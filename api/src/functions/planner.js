const { app } = require('@azure/functions');
const { TableClient, AzureNamedKeyCredential } = require('@azure/data-tables');
const admin = require('firebase-admin');

const accountName = process.env.STORAGE_ACCOUNT_NAME;
const accountKey = process.env.STORAGE_ACCOUNT_KEY;
const tableName = process.env.STORAGE_TABLE_NAME || 'planneritems';
const tripIdDefault = process.env.TRIP_ID || 'egypt-2026';
const adminEmail = (process.env.ADMIN_EMAIL || 'alaa@elmahdy.net').toLowerCase();

let tableClient;
let firebaseApp;

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
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Missing Authorization Bearer token.');
    error.status = 401;
    throw error;
  }
  initFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(match[1]);
  const profile = await getOrCreateProfile(decoded);
  return { decoded, profile };
}

function nowIso() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }
function s(value) { return value === undefined || value === null ? '' : String(value); }
function isAdmin(profile) { return profile.role === 'admin'; }

function escapeOData(value) { return String(value).replace(/'/g, "''"); }

async function getOrCreateProfile(decoded) {
  const table = await ensureTable();
  const uid = decoded.uid;
  try {
    const entity = await table.getEntity('users', uid);
    return userToClient(entity);
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
  const email = (decoded.email || '').toLowerCase();
  const name = decoded.name || (email ? email.split('@')[0] : 'مستخدم');
  const role = email === adminEmail ? 'admin' : 'member';
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
    role: entity.role || 'member',
    createdAt: entity.createdAt || '',
    updatedAt: entity.updatedAt || ''
  };
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
      adminEmail
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
