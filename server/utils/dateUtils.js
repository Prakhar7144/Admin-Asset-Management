export function parseDateSafe(value, fallback = new Date()) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function getNormalizedDay(value) {
  const parsed = parseDateSafe(value, null);
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  const normalized = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return normalized;
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

export function getEmployeeStatus(value, isArchived = false) {
  if (isArchived) return 'Archived';

  const trimmed = String(value || '').trim();
  if (!trimmed) return 'Active';

  const leavingDate = getNormalizedDay(trimmed);
  if (!leavingDate) return 'Active';

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (leavingDate < todayMidnight) return 'Released';
  if (leavingDate >= todayMidnight) return 'Pending Release';

  return 'Active';
}
