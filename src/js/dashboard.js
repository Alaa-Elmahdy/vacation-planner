export function dashboardSummary(items, trip, selectedDate, today = new Date()) {
  const events = items.filter(item => item.kind === 'event').sort(sortEvents);
  const tasks = events.filter(item => item.type === 'task' && !['done','cancelled'].includes(item.status));
  const todayIso = isoDate(today);
  const nextEvent = events.find(item => (item.date || item.startDate) >= todayIso && item.status !== 'cancelled') || null;
  const selectedEvents = events.filter(item => item.type === 'trip'
    ? selectedDate >= item.startDate && selectedDate <= item.endDate
    : (item.date || item.startDate) === selectedDate);
  const grouped = {};
  for (const event of events) {
    const date = event.date || event.startDate;
    if (date >= trip.startDate && date <= trip.endDate) (grouped[date] ??= []).push(event);
  }
  return { events, tasks, nextEvent, selectedEvents, grouped };
}

function sortEvents(a,b) {
  return String(a.date || a.startDate).localeCompare(String(b.date || b.startDate)) || (a.time || '').localeCompare(b.time || '');
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
