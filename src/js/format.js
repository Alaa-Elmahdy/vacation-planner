const AR_LATIN = 'ar-EG-u-nu-latn';

export function money(value) {
  return new Intl.NumberFormat(AR_LATIN, { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 }).format(Number(value || 0));
}

export function shortDay(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString(AR_LATIN, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function longDate(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString(AR_LATIN, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
