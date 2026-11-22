/**
 * Split Mess Currency & Monetary Utility
 * 
 * Strict Zero Floating-Point Arithmetic Standard:
 * 1 AED = 100 fils.
 * All internal math, databases, and calculations operate strictly in integer fils.
 */

/**
 * Converts AED (decimal representation) to integer UAE Fils.
 * Uses Math.round to eradicate IEEE-754 floating point precision drift.
 * Example: 19.99 AED -> 1999 fils (never 1998.9999999999998)
 */
export function aedToFils(aed: number): number {
  if (typeof aed !== 'number' || isNaN(aed)) {
    throw new TypeError(`Invalid AED amount: ${aed}`);
  }
  return Math.round(aed * 100);
}

/**
 * Formats integer fils into a 2-decimal AED string for terminal UI display only.
 * Example: 1999 fils -> "19.99"
 * Example: -4525 fils -> "-45.25"
 */
export function filsToAed(fils: number): string {
  if (!Number.isInteger(fils)) {
    throw new TypeError(`Expected integer fils, received: ${fils}`);
  }
  const isNegative = fils < 0;
  const absFils = Math.abs(fils);
  const dirhams = Math.floor(absFils / 100);
  const remainderFils = absFils % 100;
  const formatted = `${dirhams}.${remainderFils.toString().padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Formats integer fils into human-readable currency with prefix.
 * Example: 24000 fils -> "+ AED 240.00"
 * Example: -6000 fils -> "- AED 60.00"
 */
export function formatCurrencyFils(fils: number): string {
  const sign = fils > 0 ? '+ ' : fils < 0 ? '- ' : '';
  const aed = filsToAed(Math.abs(fils));
  return `${sign}AED ${aed}`;
}
