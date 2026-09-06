/**
 * One place that decides how a moment is written.
 *
 * Four different formats had grown across the app for the same value — the
 * sidebar said "Today at 11:27", the editor "Created 6 Sept 2026", the coach
 * list "6 Sept", and the coach reader "05/09/2026, 19:25:30". Same data, four
 * voices, one of them showing seconds.
 *
 * All of these use Intl rather than hardcoded patterns, so they follow the
 * reader's locale.
 */

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

/** Clock time alone: "11:27". For turns inside a conversation. */
export function formatTime(timestamp: number): string {
  return time.format(new Date(timestamp));
}

/**
 * How a list refers to an entry: "11:27" today, "5 Sept" this year,
 * "5 Sept 2025" beyond it. Relative where relative is unambiguous.
 */
export function formatListDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (isSameDay(date, now)) return time.format(date);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.getFullYear() === now.getFullYear() ? dayMonth.format(date) : dayMonthYear.format(date);
}

/** Full date for a heading: "6 Sept 2026". Never seconds. */
export function formatFullDate(timestamp: number): string {
  return dayMonthYear.format(new Date(timestamp));
}
