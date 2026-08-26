export function parseDateSafe(value, fallback = new Date()) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function isDateOfLeavingPastOrToday(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const parsedMidnight = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return parsedMidnight <= todayMidnight;
}
