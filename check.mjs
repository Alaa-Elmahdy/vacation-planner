
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const trip = { startDate:'2026-07-16', endDate:'2026-08-23', id:'egypt-2026' };
let firebaseApp, auth, currentUser, profile, state = { items: [], selectedDate: trip.startDate, scope: 'family', tab: 'calendarTab' };
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));

const labels = {
  family:'مساحة العائلة', personal:'مساحتي الشخصية', planned:'مخطط', bought:'تم الشراء', visited:'تمت الزيارة', cancelled:'ملغي', done:'تم', movedToFamily:'تم نقله للعائلة',
  purchase:'مشتريات', restaurant:'مطعم', outingPlace:'مكان خروج', event:'حدث', breakfast:'الإفطار', lunch:'الغداء', dinner:'العشاء', activity:'نشاط', trip:'رحلة', task:'مهمة', purchaseActivity:'نشاط شراء', restaurantMeal:'وجبة مطعم', outingActivity:'خروج'
};

init();
async function init(){
  bindStaticUI();
  const config = await apiPublic('/api/config');
  if(!config.firebase.apiKey){ $('authMsg').textContent = 'إعدادات Firebase غير موجودة في Azure Environment Variables.'; return; }
  firebaseApp = initializeApp(config.firebase);
  auth = getAuth(firebaseApp);
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if(user){ $('authView').classList.add('hidden'); $('appView').classList.remove('hidden'); await bootstrapUser(); }
    else { $('appView').classList.add('hidden'); $('authView').classList.remove('hidden'); }
  });
}
function bindStaticUI(){
  let authMode='login';
  $('signupMode').onclick=()=>{authMode='signup';$('signupMode').classList.add('active');$('loginMode').classList.remove('active');$('authSubmit').textContent='إنشاء حساب';$('nameField').classList.remove('hidden')};
  $('loginMode').onclick=()=>{authMode='login';$('loginMode').classList.add('active');$('signupMode').classList.remove('active');$('authSubmit').textContent='دخول';$('nameField').classList.add('hidden')};
  $('loginMode').click();
  $('googleBtn').onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){authError(e)}};
  $('authForm').onsubmit=async e=>{e.preventDefault();try{const email=$('authEmail').value.trim(), pass=$('authPassword').value; if(authMode==='signup'){const res=await createUserWithEmailAndPassword(auth,email,pass); if($('authName').value.trim()) await updateProfile(res.user,{displayName:$('authName').value.trim()});}else await signInWithEmailAndPassword(auth,email,pass);}catch(err){authError(err)}};
  $('resetPasswordBtn').onclick=async()=>resetPassword($('authEmail').value.trim());
  $('logoutBtn').onclick=()=>signOut(auth);
  $('openEventBtn').onclick=()=>openEventModal('activity',state.selectedDate);
  $('quickAddBtn').onclick=()=>openEventModal('activity',state.selectedDate);
  $('jumpBtn').onclick=()=>{state.selectedDate=$('jumpDate').value||trip.startDate;renderAll()};
  $('tripStartBtn').onclick=()=>{state.selectedDate=trip.startDate;$('jumpDate').value=trip.startDate;renderAll()};
  qsa('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  qsa('.scope-btn').forEach(b=>b.onclick=async()=>{state.scope=b.dataset.scope;qsa('.scope-btn').forEach(x=>x.classList.toggle('active',x.dataset.scope===state.scope));await loadItems();});
  $('eventType').onchange=syncEventFormType;$('closeEventModal').onclick=closeEventModal;$('cancelEventBtn').onclick=closeEventModal;$('eventForm').onsubmit=saveEvent;$('deleteEventBtn').onclick=deleteCurrentEvent;
  $('purchaseForm').onsubmit=savePurchase;$('clearPurchaseBtn').onclick=clearPurchase;
  $('restaurantForm').onsubmit=saveRestaurant;$('clearRestaurantBtn').onclick=clearRestaurant;$('mealForm').onsubmit=saveMeal;
  $('placeForm').onsubmit=savePlace;$('clearPlaceBtn').onclick=clearPlace;$('outingForm').onsubmit=saveOuting;
  $('profileForm').onsubmit=saveProfile;$('profileResetPassword').onclick=()=>resetPassword(profile.email);
}
async function bootstrapUser(){
  const me = await api('/api/me'); profile = me.user; renderProfile(); await loadItems(); if(profile.role==='admin') loadUsers();
}
async function loadItems(){ const data=await api(`/api/planner?tripId=${trip.id}&scope=all`); state.items=data.items||[]; renderAll(); }
function renderAll(){ renderHeader(); renderCalendar(); renderSelectedDay(); renderLists(); }
function renderHeader(){
  $('profileName').textContent=profile?.name||currentUser?.displayName||'مستخدم'; $('profileRole').textContent=profile?.role==='admin'?'أدمن':'عضو';
  if(profile?.photoURL){$('profilePhoto').src=profile.photoURL;$('profilePhoto').classList.remove('hidden')}
  const visible=visibleItems(); $('statEvents').textContent=visible.filter(i=>i.kind==='event').length; $('statPurchases').textContent=visible.filter(i=>i.kind==='purchase').length;
  $('scopeLabel1').textContent=labels[state.scope]; $('purchaseScopeLabel').textContent=labels[state.scope];
}
function visibleItems(){ return state.items.filter(i=> i.scope==='family' || i.ownerUid===profile?.uid).filter(i=>state.scope==='family'?i.scope==='family':i.scope==='personal'); }
function setTab(tab){state.tab=tab;qsa('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));qsa('.tabpane').forEach(p=>p.classList.toggle('hidden',p.id!==tab));renderLists();}
function renderCalendar(){
  const months=[{y:2026,m:6},{y:2026,m:7}]; $('calendarMonths').innerHTML=months.map(x=>monthHtml(x.y,x.m)).join('');
  qsa('.day-cell.in-range').forEach(c=>c.onclick=()=>{state.selectedDate=c.dataset.date;$('jumpDate').value=state.selectedDate;renderAll()});
  qsa('[data-event-id]').forEach(p=>p.onclick=e=>{e.stopPropagation();openExistingEvent(p.dataset.eventId)});
}
function monthHtml(y,m){
  const first=new Date(y,m,1), last=new Date(y,m+1,0), days=last.getDate(), blanks=first.getDay(); let cells=[];
  for(let i=0;i<blanks;i++)cells.push('<div class="day-cell muted"></div>');
  for(let d=1;d<=days;d++){const date=iso(new Date(y,m,d)), inRange=date>=trip.startDate&&date<=trip.endDate, ev=inRange?eventsForDate(date):[];cells.push(`<div class="day-cell ${inRange?'in-range':''} ${date===state.selectedDate?'selected':''}" data-date="${date}"><div class="date-num">${d}</div>${ev.slice(0,4).map(e=>`<span class="event-pill" data-event-id="${e.id}">${esc(eventLabel(e))}</span>`).join('')}${ev.length>4?`<span class="helper">+${ev.length-4}</span>`:''}</div>`)}
  while(cells.length%7)cells.push('<div class="day-cell muted"></div>');
  const name=m===6?'يوليو':'أغسطس'; return `<div class="month-card"><div class="month-title"><span>${name} ${y}</span><span>${days} يوم</span></div><div class="weekday-row">${['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(w=>`<div>${w}</div>`).join('')}</div><div class="month-grid">${cells.join('')}</div></div>`;
}
function eventsForDate(date){return visibleItems().filter(i=>i.kind==='event').filter(e=>e.type==='trip' ? date>=e.startDate&&date<=e.endDate : (e.date||e.startDate)===date).sort((a,b)=>(a.time||'').localeCompare(b.time||''));}
function renderSelectedDay(){
  const ev=eventsForDate(state.selectedDate); $('selectedDayPanel').innerHTML=`<h3 style="color:var(--p);margin:0 0 5px">${longDate(state.selectedDate)}</h3><div class="helper">${labels[state.scope]} · ${ev.length} أحداث</div><div class="agenda" style="margin-top:12px">${ev.length?ev.map(agendaCard).join(''):'<div class="empty">لا توجد أحداث لهذا اليوم</div>'}</div>`;
  qsa('[data-edit-event]').forEach(b=>b.onclick=()=>openExistingEvent(b.dataset.editEvent));
}
function agendaCard(e){return `<div class="agenda-card"><b>${esc(eventLabel(e))}</b><div class="meta">${esc(e.location||e.area||'')} ${e.time?'· '+e.time:''}</div><div class="tags"><span class="tag">${labels[e.type]||e.type}</span><span class="tag">${labels[e.status]||e.status}</span>${e.ownerName?`<span class="tag">${esc(e.ownerName)}</span>`:''}</div>${e.notes?`<div class="notes-box">${esc(e.notes)}</div>`:''}<button class="small" data-edit-event="${e.id}">تعديل</button></div>`}
function eventLabel(e){if(e.type==='restaurantMeal')return `${labels[e.mealSlot]||'وجبة'} · ${e.title}`; if(e.type==='outingActivity')return `خروج · ${e.title}`; return e.title||e.name||e.item||'حدث';}
function renderLists(){renderPurchaseAssignments();renderPurchases();renderRestaurants();renderPlaces();}
function renderPurchaseAssignments(){const opts=visibleItems().filter(i=>i.kind==='event'&&i.type==='purchaseActivity').map(i=>`<option value="${i.id}">${esc(i.title)} · ${shortDate(i.date||i.startDate)}</option>`).join(''); $('purchaseAssignedTo').innerHTML='<option value="">بدون</option>'+opts; $('eventParentTrip').innerHTML='<option value="">بدون</option>'+visibleItems().filter(i=>i.kind==='event'&&i.type==='trip').map(i=>`<option value="${i.id}">${esc(i.title)}</option>`).join('')}
function renderPurchases(){const arr=visibleItems().filter(i=>i.kind==='purchase');$('purchaseList').innerHTML=arr.length?arr.map(i=>resourceCard(i,'purchase')).join(''):'<div class="empty">لا توجد مشتريات</div>';bindResourceButtons();}
function renderRestaurants(){const arr=visibleItems().filter(i=>i.kind==='restaurant');$('restaurantList').innerHTML=arr.length?arr.map(i=>resourceCard(i,'restaurant')).join(''):'<div class="empty">لا توجد مطاعم</div>';$('mealRestaurant').innerHTML=arr.map(i=>`<option value="${i.id}">${esc(i.name||i.title)}</option>`).join('');bindResourceButtons();}
function renderPlaces(){const arr=visibleItems().filter(i=>i.kind==='outingPlace');$('placeList').innerHTML=arr.length?arr.map(i=>resourceCard(i,'outingPlace')).join(''):'<div class="empty">لا توجد أماكن خروج</div>';$('outingPlace').innerHTML=arr.map(i=>`<option value="${i.id}">${esc(i.name||i.title)}</option>`).join('');bindResourceButtons();}
function resourceCard(i,kind){const title=i.name||i.item||i.title;return `<div class="resource-card"><div class="title"><h3 style="margin:0">${esc(title)}</h3><span class="tag">${labels[i.status]||i.status||labels[state.scope]}</span></div><div class="tags">${[i.category,i.cuisine,i.area,i.bestTime,i.mealSlot].filter(Boolean).map(x=>`<span class="tag">${esc(labels[x]||x)}</span>`).join('')}</div>${i.notes?`<div class="notes-box">${esc(i.notes)}</div>`:''}<div class="owner">${i.ownerName?`بواسطة: ${esc(i.ownerName)}`:''}</div><div class="card-actions">${kind==='purchase'?statusButtons(i,'bought'):''}${kind==='restaurant'?`<button data-schedule-meal="${i.id}">إضافة وجبة</button>${statusButtons(i,'visited')}`:''}${kind==='outingPlace'?`<button data-schedule-outing="${i.id}">إضافة للتقويم</button>${statusButtons(i,'visited')}`:''}${i.scope==='personal'?`<button class="soft" data-transfer="${i.id}">نسخ للعائلة</button>`:''}<button data-edit="${i.id}" data-kind="${kind}">تعديل</button><button class="danger" data-delete="${i.id}">حذف</button></div></div>`}
function statusButtons(i,target){return `<button class="soft" data-status="${target}" data-id="${i.id}">${labels[target]}</button>`}
function bindResourceButtons(){qsa('[data-delete]').forEach(b=>b.onclick=()=>deleteItem(b.dataset.delete));qsa('[data-transfer]').forEach(b=>b.onclick=()=>transferItem(b.dataset.transfer));qsa('[data-status]').forEach(b=>b.onclick=()=>updateStatus(b.dataset.id,b.dataset.status));qsa('[data-edit]').forEach(b=>b.onclick=()=>editResource(b.dataset.id,b.dataset.kind));qsa('[data-schedule-meal]').forEach(b=>b.onclick=()=>{$('mealRestaurant').value=b.dataset.scheduleMeal;setTab('restaurantsTab')});qsa('[data-schedule-outing]').forEach(b=>b.onclick=()=>{$('outingPlace').value=b.dataset.scheduleOuting;setTab('placesTab')});}
function currentScope(){return state.scope}
async function savePurchase(e){e.preventDefault();await upsert({id:$('purchaseId').value,kind:'purchase',scope:currentScope(),item:$('purchaseItem').value,category:$('purchaseCategory').value,qty:$('purchaseQty').value,budget:$('purchaseBudget').value,status:$('purchaseStatus').value,purchaseActivityId:$('purchaseAssignedTo').value,notes:$('purchaseNotes').value});clearPurchase();}
async function saveRestaurant(e){e.preventDefault();await upsert({id:$('restaurantId').value,kind:'restaurant',scope:currentScope(),name:$('restaurantName').value,title:$('restaurantName').value,cuisine:$('restaurantCuisine').value,area:$('restaurantArea').value,mealSlot:$('restaurantBestSlot').value,status:'planned',notes:$('restaurantNotes').value});clearRestaurant();}
async function saveMeal(e){e.preventDefault();const r=itemById($('mealRestaurant').value);if(!r)return alert('اختر مطعم');await upsert({kind:'event',type:'restaurantMeal',scope:currentScope(),title:r.name||r.title,restaurantId:r.id,location:r.area,mealSlot:$('mealSlot').value,date:$('mealDate').value,startDate:$('mealDate').value,endDate:$('mealDate').value,time:$('mealTime').value,status:$('mealStatus').value,notes:$('mealNotes').value});$('mealForm').reset();$('mealDate').value=state.selectedDate;}
async function savePlace(e){e.preventDefault();await upsert({id:$('placeId').value,kind:'outingPlace',scope:currentScope(),name:$('placeName').value,title:$('placeName').value,category:$('placeType').value,area:$('placeArea').value,bestTime:$('placeBestTime').value,status:'planned',notes:$('placeNotes').value});clearPlace();}
async function saveOuting(e){e.preventDefault();const p=itemById($('outingPlace').value);if(!p)return alert('اختر مكان');await upsert({kind:'event',type:'outingActivity',scope:currentScope(),title:p.name||p.title,outingPlaceId:p.id,location:p.area,date:$('outingDate').value,startDate:$('outingDate').value,endDate:$('outingDate').value,time:$('outingTime').value,status:$('outingStatus').value,notes:$('outingNotes').value});$('outingForm').reset();$('outingDate').value=state.selectedDate;}
function editResource(id,kind){const i=itemById(id);if(!i)return;if(kind==='purchase'){setTab('purchasesTab');$('purchaseId').value=i.id;$('purchaseItem').value=i.item;$('purchaseCategory').value=i.category;$('purchaseQty').value=i.qty||1;$('purchaseBudget').value=i.budget;$('purchaseStatus').value=i.status||'planned';$('purchaseAssignedTo').value=i.purchaseActivityId||'';$('purchaseNotes').value=i.notes||''}if(kind==='restaurant'){setTab('restaurantsTab');$('restaurantId').value=i.id;$('restaurantName').value=i.name;$('restaurantCuisine').value=i.cuisine;$('restaurantArea').value=i.area;$('restaurantBestSlot').value=i.mealSlot||'breakfast';$('restaurantNotes').value=i.notes||''}if(kind==='outingPlace'){setTab('placesTab');$('placeId').value=i.id;$('placeName').value=i.name;$('placeType').value=i.category;$('placeArea').value=i.area;$('placeBestTime').value=i.bestTime;$('placeNotes').value=i.notes||''}}
function clearPurchase(){$('purchaseForm').reset();$('purchaseId').value='';$('purchaseQty').value=1}function clearRestaurant(){$('restaurantForm').reset();$('restaurantId').value=''}function clearPlace(){$('placeForm').reset();$('placeId').value=''}
function openEventModal(type='activity',date=state.selectedDate){$('eventForm').reset();$('eventId').value='';$('eventType').value=type;$('eventDate').value=date;$('eventStart').value=date;$('eventEnd').value=date;$('eventStatus').value='planned';$('deleteEventBtn').classList.add('hidden');syncEventFormType();$('eventModal').classList.add('open')}
function openExistingEvent(id){const e=itemById(id);if(!e)return;$('eventId').value=e.id;$('eventType').value=e.type;$('eventTitle').value=e.title;$('eventDate').value=e.date||e.startDate;$('eventTime').value=e.time;$('eventStart').value=e.startDate;$('eventEnd').value=e.endDate;$('eventLocation').value=e.location;$('eventParentTrip').value=e.parentTripId;$('eventStatus').value=e.status||'planned';$('eventNotes').value=e.notes;$('deleteEventBtn').classList.remove('hidden');syncEventFormType();$('eventModal').classList.add('open')}
function closeEventModal(){$('eventModal').classList.remove('open')}function syncEventFormType(){const tripType=$('eventType').value==='trip';qsa('.event-single').forEach(x=>x.classList.toggle('hidden',tripType));qsa('.event-trip').forEach(x=>x.classList.toggle('hidden',!tripType));}
async function saveEvent(e){e.preventDefault();const type=$('eventType').value;const date=$('eventDate').value||state.selectedDate;await upsert({id:$('eventId').value,kind:'event',type,scope:currentScope(),title:$('eventTitle').value,date,startDate:type==='trip'?$('eventStart').value:date,endDate:type==='trip'?$('eventEnd').value:date,time:$('eventTime').value,location:$('eventLocation').value,parentTripId:$('eventParentTrip').value,status:$('eventStatus').value,notes:$('eventNotes').value});closeEventModal();}
async function deleteCurrentEvent(){if(!$('eventId').value)return;if(confirm('حذف الحدث؟')){await deleteItem($('eventId').value);closeEventModal();}}
async function upsert(payload){payload.tripId=trip.id; if(payload.id) await api('/api/planner',{method:'PUT',body:payload}); else await api('/api/planner',{method:'POST',body:payload}); await loadItems();}
async function deleteItem(id){if(!confirm('تأكيد الحذف؟'))return; await api(`/api/planner?tripId=${trip.id}&id=${encodeURIComponent(id)}`,{method:'DELETE'}); await loadItems();}
async function transferItem(id){await api('/api/transfer',{method:'POST',body:{tripId:trip.id,id,mode:'copy'}}); await loadItems(); alert('تم النسخ إلى مساحة العائلة');}
async function updateStatus(id,status){const i=itemById(id);await upsert({...i,status});}
function renderProfile(){ $('profileEditName').value=profile.name||'';$('profileEmail').value=profile.email||'';$('profileRoleInput').value=profile.role==='admin'?'أدمن':'عضو';}
async function saveProfile(e){e.preventDefault();const data=await api('/api/me',{method:'PUT',body:{name:$('profileEditName').value}});profile=data.user;renderHeader();alert('تم حفظ الاسم')}
async function loadUsers(){try{const data=await api('/api/users');$('familyUsers').innerHTML=(data.users||[]).map(u=>`<div class="mini-card" style="padding:12px;margin-bottom:8px"><b>${esc(u.name)}</b><div class="helper">${esc(u.email)} · ${u.role==='admin'?'أدمن':'عضو'}</div></div>`).join('')||'<div class="empty">لا يوجد أعضاء</div>'}catch(e){$('familyUsers').innerHTML='<div class="empty">تعذر تحميل الأعضاء</div>'}}
async function resetPassword(email){if(!email)return alert('اكتب البريد أولاً');try{await sendPasswordResetEmail(auth,email);alert('تم إرسال رابط تغيير كلمة السر')}catch(e){authError(e)}}
function authError(e){$('authMsg').textContent=e.message||'حدث خطأ'}
async function apiPublic(url){const r=await fetch(url);if(!r.ok)throw new Error(await r.text());return r.json()}
async function getFreshFirebaseIdToken(){
  if(!auth || !auth.currentUser) throw new Error('جلسة الدخول غير موجودة. اعمل تسجيل خروج ثم دخول مرة أخرى.');
  currentUser = auth.currentUser;
  await currentUser.reload().catch(()=>{});
  const token = await currentUser.getIdToken(true);
  if(!token || token.split('.').length !== 3){
    throw new Error('تعذر استخراج Firebase ID Token صحيح من المتصفح. اعمل خروج ثم ادخل مرة أخرى.');
  }
  try{
    const header = JSON.parse(atob(token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));
    if(!header.kid){
      throw new Error('Firebase ID Token المستخرج لا يحتوي على kid. اعمل خروج ثم دخول مرة أخرى.');
    }
  }catch(e){
    throw new Error('توكن تسجيل الدخول غير صالح في المتصفح. اعمل خروج ثم دخول مرة أخرى. التفاصيل: '+e.message);
  }
  return token;
}
async function api(url,opts={}){
  if(!currentUser) throw new Error('لم يتم تسجيل الدخول.');
  const token = await getFreshFirebaseIdToken();
  const r=await fetch(url,{method:opts.method||'GET',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'X-Client-Version':'v4.5'},body:opts.body?JSON.stringify(opts.body):undefined});
  const text=await r.text();
  if(!r.ok)throw new Error(text||r.status);
  return text?JSON.parse(text):{};
}
function itemById(id){return state.items.find(i=>i.id===id)}function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}function shortDate(d){return d||''}function longDate(d){return new Date(d+'T00:00:00').toLocaleDateString('ar-EG',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
