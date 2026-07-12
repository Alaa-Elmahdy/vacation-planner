export function visibleItemsForScope(items, profileUid, scope) {
  return items
    .filter(item => item.scope === 'family' || item.ownerUid === profileUid)
    .filter(item => scope === 'family' ? item.scope === 'family' : item.scope === 'personal');
}

export function eventsOnDate(items, date) {
  return items
    .filter(item => item.kind === 'event')
    .filter(event => event.type === 'trip'
      ? date >= event.startDate && date <= event.endDate
      : (event.date || event.startDate) === date)
    .sort((a,b) => (a.time || '').localeCompare(b.time || ''));
}
