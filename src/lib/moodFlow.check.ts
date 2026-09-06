/**
 * Runnable checks for the Mood Flow maths.
 *
 *   bunx tsx src/lib/moodFlow.check.ts
 *
 * No framework, no fixtures on disk. The cases here are the ones that broke the
 * v1 plan in review: days with no entries (wiggle divides by the row sum), a
 * single entry, and an all-neutral window.
 */
import { stack, stackOffsetWiggle, stackOrderNone } from 'd3-shape';
import {
  buildMoodDays,
  buildMoodSequence,
  toStackRows,
  countScoredEntries,
  isStackFinite,
  labelForScore,
  startOfDay,
  MOOD_SERIES_KEYS,
  EMPTY_DAY_EPSILON,
} from './moodFlow';
import type { JournalEntry } from '../types';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const NOW = new Date('2026-09-06T12:00:00').getTime();
const DAY = 24 * 60 * 60 * 1000;

function entry(daysAgo: number, score: number | undefined, title = 'Entry'): JournalEntry {
  return {
    id: `e${daysAgo}-${score ?? 'none'}-${Math.random()}`,
    userId: 'u1',
    title,
    mode: 'reflection',
    messages: [],
    tags: [],
    createdAt: NOW - daysAgo * DAY,
    updatedAt: NOW - daysAgo * DAY,
    ...(score === undefined
      ? {}
      : { sentiment: { score, label: labelForScore(score), scoredAt: NOW } }),
  };
}

/** Runs the real d3 stack the chart will use. */
function stacked(rows: Record<string, number>[]) {
  return stack<Record<string, number>>()
    .keys([...MOOD_SERIES_KEYS])
    .order(stackOrderNone)
    .offset(stackOffsetWiggle)(rows) as unknown as { 0: number; 1: number }[][];
}

console.log('\nmoodFlow checks\n');

// ── 1. Empty window: every day present, nothing scored ───────────────────────
{
  const days = buildMoodDays([], 30, NOW);
  check('30-day range yields exactly 30 rows', days.length === 30, `got ${days.length}`);
  check('no entries anywhere', countScoredEntries(days) === 0);
  check('empty days report null average', days.every((d) => d.averageScore === null));
}

// ── 2. THE v1 BUG: all-zero days must not produce NaN through wiggle ─────────
{
  const days = buildMoodDays([], 30, NOW);
  const rows = toStackRows(days);
  check(
    'empty days carry the epsilon',
    rows.every((r) => r.neutral === EMPTY_DAY_EPSILON)
  );
  const series = stacked(rows as unknown as Record<string, number>[]);
  check('stackOffsetWiggle stays finite on a fully empty window', isStackFinite(series));
}

// ── 3. Sparse: entries on two days out of thirty ─────────────────────────────
{
  const days = buildMoodDays([entry(0, 0.8), entry(14, -0.6)], 30, NOW);
  const series = stacked(toStackRows(days) as unknown as Record<string, number>[]);
  check('sparse window stays finite', isStackFinite(series));
  check('both entries counted', countScoredEntries(days) === 2);
  check(
    'today bucketed positive',
    days[days.length - 1].positive === 1 && days[days.length - 1].negative === 0
  );
}

// ── 4. Single entry — the smallest non-empty case ────────────────────────────
{
  const days = buildMoodDays([entry(0, 0.5)], 30, NOW);
  const series = stacked(toStackRows(days) as unknown as Record<string, number>[]);
  check('single entry stays finite', isStackFinite(series));
  check('single entry counted once', countScoredEntries(days) === 1);
  check('below the 3-entry floor', countScoredEntries(days) < 3);
}

// ── 5. All neutral — every value identical ───────────────────────────────────
{
  const days = buildMoodDays([entry(0, 0), entry(1, 0.05), entry(2, -0.05)], 30, NOW);
  const series = stacked(toStackRows(days) as unknown as Record<string, number>[]);
  check('all-neutral window stays finite', isStackFinite(series));
  check('all three land in neutral', days.reduce((n, d) => n + d.neutral, 0) >= 3);
}

// ── 6. Unscored entries are ignored, not crashed on ──────────────────────────
{
  const days = buildMoodDays([entry(0, undefined), entry(1, 0.4)], 30, NOW);
  check('unscored entry excluded', countScoredEntries(days) === 1);
  const series = stacked(toStackRows(days) as unknown as Record<string, number>[]);
  check('mixed scored/unscored stays finite', isStackFinite(series));
}

// ── 7. Out-of-range entries dropped ──────────────────────────────────────────
{
  const days = buildMoodDays([entry(200, 0.9), entry(1, 0.2)], 30, NOW);
  check('entry outside the window dropped', countScoredEntries(days) === 1);
}

// ── 8. Ranges and ordering ───────────────────────────────────────────────────
{
  check('7-day range', buildMoodDays([], 7, NOW).length === 7);
  check('90-day range', buildMoodDays([], 90, NOW).length === 90);
  const days = buildMoodDays([], 30, NOW);
  check(
    'rows ascend by date',
    days.every((d, i) => i === 0 || d.date > days[i - 1].date)
  );
  check('last row is today', days[days.length - 1].date === startOfDay(NOW));
}

// ── 9. Out-of-band scores clamped ────────────────────────────────────────────
{
  const days = buildMoodDays([entry(0, 5), entry(1, -9)], 30, NOW);
  const all = days.flatMap((d) => d.entries);
  check('scores clamped to [-1,1]', all.every((e) => e.score >= -1 && e.score <= 1));
}

// ── 10. Averages ─────────────────────────────────────────────────────────────
{
  const days = buildMoodDays([entry(0, 1), entry(0, -1)], 30, NOW);
  const today = days[days.length - 1];
  check('same-day entries averaged', today.averageScore === 0, `got ${today.averageScore}`);
  check('same-day entries share a bucket', today.entries.length === 2);
}

// ── 11. Per-entry sequence mode ──────────────────────────────────────────────
{
  const entriesSameDay = [
    { ...entry(0, 0.8, 'Joy'), updatedAt: NOW - 3000 },
    { ...entry(0, -0.6, 'Anger'), updatedAt: NOW - 2000 },
    { ...entry(0, 0.0, 'Plan'), updatedAt: NOW - 1000 },
    { ...entry(0, 0.5, 'Insight'), updatedAt: NOW },
  ];

  const seq = buildMoodSequence(entriesSameDay);
  check('per-entry sequence does not collapse same-day entries', seq.length === 4, `got ${seq.length}`);
  check('sequence orders chronologically', seq[0].entries[0].title === 'Joy' && seq[3].entries[0].title === 'Insight');
  check('each node has exactly 1 entry', seq.every((s) => s.entries.length === 1));

  const rows = toStackRows(seq);
  const series = stacked(rows as unknown as Record<string, number>[]);
  check('per-entry sequence rows stay finite with stackOffsetWiggle', isStackFinite(series));
  check('per-entry sequence counts total scored entries correctly', countScoredEntries(seq) === 4);

  // Tapered rows stay finite with stackOffsetWiggle
  const taperedRows = toStackRows(seq, { taper: true });
  check('tapered rows include lead-in and lead-out caps', taperedRows.length === seq.length + 2);
  check('tapered rows stay finite with stackOffsetWiggle', isStackFinite(stacked(taperedRows as unknown as Record<string, number>[])));

  // Unscored entries filtered out
  const mixed = [entry(0, undefined), entry(0, 0.7)];
  check('per-entry sequence excludes unscored entries', buildMoodSequence(mixed).length === 1);
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
