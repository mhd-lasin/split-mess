/**
 * Input validation & sanitization helpers for Split Mess API.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_REGEX.test(value);
}

/**
 * Strips control characters and HTML angle brackets, trims, and enforces max length.
 */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes phone numbers to safe characters only (+, digits, spaces, hyphens).
 */
export function sanitizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^\d+\-\s()]/g, '').trim().slice(0, 20);
  return cleaned.length > 0 ? cleaned : null;
}
