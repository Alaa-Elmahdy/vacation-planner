export function tripStatus(trip, today = new Date()) {
  if (trip.status === 'archived') return 'archived';
  const current = isoDate(today);
  if (current < trip.startDate) return 'upcoming';
  if (current > trip.endDate) return 'completed';
  return 'ongoing';
}

export function selectActiveTrip(trips, savedId, fallbackId, today = new Date()) {
  if (!trips.length) return null;
  const saved = trips.find(t => t.id === savedId);
  if (saved) return saved;
  const ongoing = trips.find(t => tripStatus(t, today) === 'ongoing');
  if (ongoing) return ongoing;
  const upcoming = trips.filter(t => tripStatus(t, today) === 'upcoming').sort((a,b) => a.startDate.localeCompare(b.startDate))[0];
  return upcoming || trips.find(t => t.id === fallbackId) || [...trips].sort((a,b) => b.startDate.localeCompare(a.startDate))[0];
}

export function daysRemaining(trip, today = new Date()) {
  const current = new Date(isoDate(today) + 'T00:00:00');
  const end = new Date(trip.endDate + 'T00:00:00');
  return Math.max(0, Math.ceil((end - current) / 86400000));
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
