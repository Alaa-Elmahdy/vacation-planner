const { app } = require('@azure/functions');
const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

const accountName = process.env.STORAGE_ACCOUNT_NAME;
const accountKey = process.env.STORAGE_ACCOUNT_KEY;
const tableName = process.env.STORAGE_TABLE_NAME || 'planneritems';
const tripIdDefault = process.env.TRIP_ID || 'egypt-2026';
const adminEmail = (process.env.ADMIN_EMAIL || 'alaa@elmahdy.net').trim().toLowerCase();

let tableClient;
let firebaseApp;
let firebaseCertCache = { expiresAt: 0, certs: null };

function getTableClient() {
  if (!accountName || !accountKey) throw new Error('Missing STORAGE_ACCOUNT_NAME or STORAGE_ACCOUNT_KEY.');
  if (!tableClient) {
    const credential = new AzureNamedKeyCredential(accountName, accountKey);
    tableClient = new TableClient(`https://${accountName}.table.core.windows.net`, tableName, credential);
  }
  return tableClient;
}

async function ensureTable() {
  const table = getTableClient();
  await table.createTable().catch((error) => {
    if (error.statusCode !== 409) throw error;
  });
  return table;
}

function initFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;
  if (admin.apps.length) {
    firebaseApp = admin.app();
    return firebaseApp;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin settings: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
  }
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey })
  });
  return firebaseApp;
}

async function requireUser(request) {
  // V4.7: Azure Static Web Apps / Functions can use or replace the Authorization header.
  // Therefore the browser sends the Firebase ID token in this custom header only.
  const token = request.headers.get('x-firebase-id-token') || '';
  if (!token) {
    const error = new Error('Missing X-Firebase-ID-Token header. This API expects Firebase ID Token in X-Firebase-ID-Token, not Authorization. Deploy V4.7 and hard refresh.');
    error.status = 401;
    throw error;
  }
  if (!token || token.split('.').length !== 3) {
    const error = new Error('التوكن المرسل للـ API ليس Firebase ID Token. افتح الموقع بعد النشر بعمل Ctrl+F5، ثم اعمل خروج ودخول مرة أخرى.');
    error.status = 401;
    throw error;
  }
  initFirebaseAdmin();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('kid')) {
      decoded = await verifyFirebaseTokenWithoutKid(token).catch((fallbackError) => {
        const details = inspectJwt(token);
        const wrapped = new Error(
          'توكن Firebase غير صحيح أو ليس ID Token. ' +
          'اعمل تسجيل خروج ثم Ctrl+F5 ثم دخول مرة أخرى. ' +
          'تفاصيل التوكن: issuer=' + (details.payload.iss || '-') +
          ', audience=' + (details.payload.aud || '-') +
          ', headerKid=' + (details.header.kid || '-') +
          '. الخطأ الأصلي: ' + msg +
          '. خطأ التحقق البديل: ' + (fallbackError.message || fallbackError)
        );
        wrapped.status = 401;
        throw wrapped;
      });
    } else {
      throw error;
    }
  }
  const profile = await getOrCreateProfile(decoded);
  return { decoded, profile };
}

function inspectJwt(token) {
  try {
    const [h, p] = token.split('.');
    return {
      header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')),
      payload: JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
    };
  } catch (e) {
    return { header: {}, payload: {} };
  }
}

async function getFirebaseCerts() {
  const now = Date.now();
  if (firebaseCertCache.certs && firebaseCertCache.expiresAt > now) return firebaseCertCache.certs;
  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!response.ok) throw new Error('تعذر تحميل شهادات Firebase للتحقق من التوكن.');
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = await response.json();
  firebaseCertCache = { certs, expiresAt: now + maxAgeSeconds * 1000 };
  return certs;
}

async function verifyFirebaseTokenWithoutKid(token) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const details = inspectJwt(token);
  const expectedIssuer = 'https://securetoken.google.com/' + projectId;
  if (details.payload.iss !== expectedIssuer || details.payload.aud !== projectId) {
    throw new Error('التوكن ليس Firebase SecureToken لهذا المشروع.');
  }
  const certs = await getFirebaseCerts();
  let lastError;
  for (const cert of Object.values(certs)) {
    try {
      const decoded = jwt.verify(token, cert, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: expectedIssuer
      });
      decoded.uid = decoded.user_id || decoded.sub;
      return decoded;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('فشل التحقق اليدوي من Firebase token.');
}

function nowIso() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }
function s(value) { return value === undefined || value === null ? '' : String(value); }
function isAdmin(profile) { return profile.role === 'admin'; }

function escapeOData(value) { return String(value).replace(/'/g, "''"); }

async function getOrCreateProfile(decoded) {
  const table = await ensureTable();
  const uid = decoded.uid;
  const email = (decoded.email || '').toLowerCase();
  const shouldBeAdmin = email && email === adminEmail;
  try {
    const entity = await table.getEntity('users', uid);
    let changed = false;
    if (shouldBeAdmin && entity.role !== 'admin') { entity.role = 'admin'; changed = true; }
    if (!entity.email && email) { entity.email = email; changed = true; }
    if (!entity.name && (decoded.name || email)) { entity.name = decoded.name || email.split('@')[0]; entity.displayName = entity.name; changed = true; }
    if (!entity.photoURL && decoded.picture) { entity.photoURL = decoded.picture; changed = true; }
    if (changed) { entity.updatedAt = nowIso(); await table.updateEntity(entity, 'Merge'); }
    return userToClient(entity);
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
  const name = decoded.name || (email ? email.split('@')[0] : 'مستخدم');
  const role = shouldBeAdmin ? 'admin' : 'member';
  const entity = {
    partitionKey: 'users',
    rowKey: uid,
    uid,
    email,
    name,
    displayName: name,
    photoURL: decoded.picture || '',
    role,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await table.createEntity(entity);
  return userToClient(entity);
}

function userToClient(entity) {
  return {
    uid: entity.rowKey || entity.uid,
    email: entity.email || '',
    name: entity.name || entity.displayName || '',
    displayName: entity.displayName || entity.name || '',
    photoURL: entity.photoURL || '',
    role: ((entity.email || '').toLowerCase() === adminEmail ? 'admin' : (entity.role || 'member')),
    createdAt: entity.createdAt || '',
    updatedAt: entity.updatedAt || ''
  };
}

function inviteToClient(entity) {
  return {
    email: entity.rowKey || entity.email || '',
    name: entity.name || '',
    status: entity.status || 'active',
    createdBy: entity.createdBy || '',
    createdByName: entity.createdByName || '',
    createdAt: entity.createdAt || '',
    updatedAt: entity.updatedAt || ''
  };
}

async function isEmailInvited(email) {
  if (!email) return false;
  if (email.toLowerCase() === adminEmail) return true;
  const table = await ensureTable();
  try {
    const invite = await table.getEntity('invites', email.toLowerCase());
    return (invite.status || 'active') === 'active';
  } catch (error) {
    if (error.statusCode === 404) return false;
    throw error;
  }
}

function itemToClient(entity) {
  return {
    id: entity.rowKey,
    tripId: entity.partitionKey,
    kind: entity.kind || '',
    type: entity.type || '',
    scope: entity.scope || 'family',
    title: entity.title || '',
    item: entity.item || '',
    name: entity.name || '',
    category: entity.category || '',
    cuisine: entity.cuisine || '',
    area: entity.area || '',
    location: entity.location || '',
    startDate: entity.startDate || '',
    endDate: entity.endDate || '',
    date: entity.date || entity.startDate || '',
    time: entity.time || '',
    mealSlot: entity.mealSlot || '',
    status: entity.status || 'planned',
    assignedTo: entity.assignedTo || '',
    ownerUid: entity.ownerUid || '',
    ownerName: entity.ownerName || '',
    ownerEmail: entity.ownerEmail || '',
    parentTripId: entity.parentTripId || '',
    restaurantId: entity.restaurantId || '',
    outingPlaceId: entity.outingPlaceId || '',
    purchaseActivityId: entity.purchaseActivityId || entity.assignedTo || '',
    qty: entity.qty || '',
    budget: entity.budget || '',
    mustTry: entity.mustTry || '',
    bestTime: entity.bestTime || '',
    notes: entity.notes || '',
    sourcePersonalId: entity.sourcePersonalId || '',
    createdBy: entity.createdBy || '',
    createdByName: entity.createdByName || '',
    updatedBy: entity.updatedBy || '',
    updatedByName: entity.updatedByName || '',
    createdAt: entity.createdAt || '',
    updatedAt: entity.updatedAt || ''
  };
}

function canAccessItem(item, profile) {
  if (item.scope === 'family') return true;
  return item.ownerUid === profile.uid;
}

function canModifyItem(item, profile) {
  if (isAdmin(profile)) return true;
  if (item.scope === 'personal') return item.ownerUid === profile.uid;
  return item.createdBy === profile.uid || item.ownerUid === profile.uid || true;
}

async function listItems(request, profile) {
  const table = await ensureTable();
  const tripId = request.query.get('tripId') || tripIdDefault;
  const scope = request.query.get('scope') || 'all';
  const kind = request.query.get('kind') || '';
  const resources = [];
  const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq '${escapeOData(tripId)}'` } });
  for await (const entity of entities) {
    const item = itemToClient(entity);
    if (!canAccessItem(item, profile)) continue;
    if (scope !== 'all' && item.scope !== scope) continue;
    if (kind && item.kind !== kind) continue;
    resources.push(item);
  }
  resources.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return resources;
}

function buildEntity(body, profile, existing) {
  const now = nowIso();
  const scope = body.scope === 'personal' ? 'personal' : 'family';
  const kind = s(body.kind || existing?.kind || 'event');
  const title = s(body.title || body.name || body.item || existing?.title || existing?.name || existing?.item || '');
  return {
    partitionKey: s(body.tripId || existing?.partitionKey || tripIdDefault),
    rowKey: s(body.id || existing?.rowKey || id(kind)),
    kind,
    type: s(body.type || existing?.type || ''),
    scope,
    title,
    item: s(body.item || existing?.item || ''),
    name: s(body.name || existing?.name || title),
    category: s(body.category || existing?.category || ''),
    cuisine: s(body.cuisine || existing?.cuisine || ''),
    area: s(body.area || existing?.area || ''),
    location: s(body.location || existing?.location || body.area || ''),
    startDate: s(body.startDate || body.date || existing?.startDate || ''),
    endDate: s(body.endDate || body.startDate || body.date || existing?.endDate || body.date || ''),
    date: s(body.date || body.startDate || existing?.date || ''),
    time: s(body.time || existing?.time || ''),
    mealSlot: s(body.mealSlot || existing?.mealSlot || ''),
    status: s(body.status || existing?.status || 'planned'),
    assignedTo: s(body.assignedTo || existing?.assignedTo || ''),
    ownerUid: scope === 'personal' ? profile.uid : s(existing?.ownerUid || body.ownerUid || profile.uid),
    ownerName: scope === 'personal' ? profile.name : s(existing?.ownerName || body.ownerName || profile.name),
    ownerEmail: scope === 'personal' ? profile.email : s(existing?.ownerEmail || body.ownerEmail || profile.email),
    parentTripId: s(body.parentTripId || existing?.parentTripId || ''),
    restaurantId: s(body.restaurantId || existing?.restaurantId || ''),
    outingPlaceId: s(body.outingPlaceId || existing?.outingPlaceId || ''),
    purchaseActivityId: s(body.purchaseActivityId || body.assignedTo || existing?.purchaseActivityId || ''),
    qty: s(body.qty || existing?.qty || ''),
    budget: s(body.budget || existing?.budget || ''),
    mustTry: s(body.mustTry || existing?.mustTry || ''),
    bestTime: s(body.bestTime || existing?.bestTime || ''),
    notes: s(body.notes || existing?.notes || ''),
    sourcePersonalId: s(body.sourcePersonalId || existing?.sourcePersonalId || ''),
    createdBy: s(existing?.createdBy || profile.uid),
    createdByName: s(existing?.createdByName || profile.name),
    updatedBy: profile.uid,
    updatedByName: profile.name,
    createdAt: s(existing?.createdAt || now),
    updatedAt: now
  };
}

app.http('config', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'config',
  handler: async () => ({
    status: 200,
    jsonBody: {
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY || '',
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.FIREBASE_PROJECT_ID || '',
        appId: process.env.FIREBASE_APP_ID || ''
      },
      tripId: tripIdDefault,
      adminEmail,
      version: 'v4.8'
    }
  })
});

app.http('me', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'me',
  handler: async (request, context) => {
    try {
      const { profile } = await requireUser(request);
      const table = await ensureTable();
      if (request.method === 'GET') return { status: 200, jsonBody: { user: profile } };
      const body = await request.json();
      const entity = await table.getEntity('users', profile.uid);
      entity.name = s(body.name || entity.name);
      entity.displayName = entity.name;
      entity.updatedAt = nowIso();
      await table.updateEntity(entity, 'Replace');
      return { status: 200, jsonBody: { user: userToClient(entity) } };
    } catch (error) {
      context.error(error);
      return { status: error.status || 500, jsonBody: { error: error.message || 'خطأ في الخادم' } };
    }
  }
});

app.http('users', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'users',
  handler: async (request, context) => {
    try {
      const { profile } = await requireUser(request);
      if (!isAdmin(profile)) return { status: 403, jsonBody: { error: 'صلاحية الأدمن مطلوبة.' } };
      const table = await ensureTable();
      const users = [];
      const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq 'users'` } });
      for await (const entity of entities) users.push(userToClient(entity));
      return { status: 200, jsonBody: { users } };
    } catch (error) {
      context.error(error);
      return { status: error.status || 500, jsonBody: { error: error.message || 'خطأ في الخادم' } };
    }
  }
});


app.http('invites', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'invites',
  handler: async (request, context) => {
    try {
      const { profile } = await requireUser(request);
      if (!isAdmin(profile)) return { status: 403, jsonBody: { error: 'صلاحية الأدمن مطلوبة لإدارة الدعوات.' } };
      const table = await ensureTable();
      if (request.method === 'GET') {
        const invites = [];
        const entities = table.listEntities({ queryOptions: { filter: `PartitionKey eq 'invites'` } });
        for await (const entity of entities) invites.push(inviteToClient(entity));
        invites.sort((a,b)=>String(a.email).localeCompare(String(b.email)));
        return { status: 200, jsonBody: { invites } };
      }
      if (request.method === 'POST') {
        const body = await request.json();
        const email = s(body.email).trim().toLowerCase();
        if (!email || !email.includes('@')) return { status: 400, jsonBody: { error: 'بريد صحيح مطلوب.' } };
        const entity = {
          partitionKey: 'invites',
          rowKey: email,
          email,
          name: s(body.name),
          status: 'active',
          createdBy: profile.uid,
          createdByName: profile.name,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        await table.upsertEntity(entity, 'Merge');
        return { status: 200, jsonBody: { invite: inviteToClient(entity) } };
      }
      if (request.method === 'DELETE') {
        const email = s(request.query.get('email')).trim().toLowerCase();
        if (!email) return { status: 400, jsonBody: { error: 'البريد مطلوب.' } };
        if (email === adminEmail) return { status: 400, jsonBody: { error: 'لا يمكن حذف دعوة الأدمن الأساسي.' } };
        await table.deleteEntity('invites', email).catch(error => { if (error.statusCode !== 404) throw error; });
        return { status: 200, jsonBody: { deleted: true } };
      }
      return { status: 405, jsonBody: { error: 'Method not allowed' } };
    } catch (error) {
      context.error(error);
      return { status: error.status || error.statusCode || 500, jsonBody: { error: error.message || 'خطأ في الخادم' } };
    }
  }
});

app.http('planner', {
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'planner',
  handler: async (request, context) => {
    try {
      const { profile } = await requireUser(request);
      const table = await ensureTable();
      if (request.method === 'GET') {
        const items = await listItems(request, profile);
        return { status: 200, jsonBody: { items } };
      }
      if (request.method === 'POST') {
        const body = await request.json();
        const entity = buildEntity(body, profile, null);
        await table.createEntity(entity);
        return { status: 201, jsonBody: itemToClient(entity) };
      }
      if (request.method === 'PUT') {
        const body = await request.json();
        const tripId = body.tripId || tripIdDefault;
        const idValue = body.id;
        if (!idValue) return { status: 400, jsonBody: { error: 'معرف العنصر مطلوب.' } };
        const existing = await table.getEntity(tripId, idValue);
        const item = itemToClient(existing);
        if (!canAccessItem(item, profile) || !canModifyItem(item, profile)) return { status: 403, jsonBody: { error: 'غير مسموح بالتعديل.' } };
        const entity = buildEntity(body, profile, existing);
        await table.updateEntity(entity, 'Replace');
        return { status: 200, jsonBody: itemToClient(entity) };
      }
      if (request.method === 'DELETE') {
        const tripId = request.query.get('tripId') || tripIdDefault;
        const idValue = request.query.get('id');
        if (!idValue) return { status: 400, jsonBody: { error: 'معرف العنصر مطلوب.' } };
        const existing = await table.getEntity(tripId, idValue);
        const item = itemToClient(existing);
        if (!canAccessItem(item, profile) || !canModifyItem(item, profile)) return { status: 403, jsonBody: { error: 'غير مسموح بالحذف.' } };
        await table.deleteEntity(tripId, idValue);
        return { status: 200, jsonBody: { deleted: true } };
      }
      return { status: 405, jsonBody: { error: 'Method not allowed' } };
    } catch (error) {
      context.error(error);
      return { status: error.status || error.statusCode || 500, jsonBody: { error: error.message || 'خطأ في الخادم' } };
    }
  }
});

app.http('transfer', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'transfer',
  handler: async (request, context) => {
    try {
      const { profile } = await requireUser(request);
      const table = await ensureTable();
      const body = await request.json();
      const tripId = body.tripId || tripIdDefault;
      const idValue = body.id;
      const mode = body.mode || 'copy';
      if (!idValue) return { status: 400, jsonBody: { error: 'معرف العنصر مطلوب.' } };
      const existing = await table.getEntity(tripId, idValue);
      const item = itemToClient(existing);
      if (item.scope !== 'personal' || item.ownerUid !== profile.uid) return { status: 403, jsonBody: { error: 'يمكن نقل العناصر الشخصية الخاصة بك فقط.' } };
      const copy = buildEntity({ ...item, id: id(item.kind), scope: 'family', sourcePersonalId: item.id }, profile, null);
      copy.rowKey = id(item.kind);
      copy.scope = 'family';
      copy.ownerUid = item.ownerUid;
      copy.ownerName = item.ownerName;
      copy.ownerEmail = item.ownerEmail;
      copy.sourcePersonalId = item.id;
      await table.createEntity(copy);
      if (mode === 'move') {
        existing.status = 'movedToFamily';
        existing.updatedAt = nowIso();
        await table.updateEntity(existing, 'Merge');
      }
      return { status: 201, jsonBody: itemToClient(copy) };
    } catch (error) {
      context.error(error);
      return { status: error.status || error.statusCode || 500, jsonBody: { error: error.message || 'خطأ في الخادم' } };
    }
  }
});
