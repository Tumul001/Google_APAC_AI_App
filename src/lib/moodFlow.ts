/**
 * Mood Flow data shaping.
 *
 * Pure functions only — no React, no d3, no DOM — so the awkward cases (empty
 * ranges, days with no entries, a single entry, every entry neutral) can be
 * proven in `moodFlow.check.ts` without a browser.
 *
 * The reason this file exists separately: d3's stackOffsetWiggle divides by the
 * sum of each row's values. A day with no entries sums to zero, so the offset
 * becomes NaN and the whole SVG path silently disappears. Real journalling is
 * full of empty days, so that case has to be handled here, before d3 ever sees
 * the data.
 */
import type { JournalEntry, SentimentLabel } from '../types';

export type MoodRange = 7 | 30 | 90;

/** One day's bucket. The three counts are what gets stacked. */
export interface MoodDay {
  /** Midnight local time for this day. */
  date: number;
  negative: number;
  neutral: number;
  positive: number;
  /** Entries scored that day, for the tooltip. */
  entries: { title: string; label: SentimentLabel; score: number }[];
  /** Mean score of the day's entries; null when the day is empty. */
  averageScore: number | null;
}

export const MOOD_SERIES_KEYS = ['negative', 'neutral', 'positive'] as const;
export type MoodSeriesKey = (typeof MOOD_SERIES_KEYS)[number];

/**
 * Keeps a wiggle-stacked row finite on days with no entries.
 *
 * Small enough to be invisible at any sane chart height, non-zero so the row
 * sum can never be 0. Applied to `neutral` only, so an empty day reads as a
 * thin neutral thread rather than a gap in the stream.
 */
export const EMPTY_DAY_EPSILON = 0.0001;

/**
 * Baseline thickness carried by a day that has entries, so neighbouring active
 * days join into one flowing body instead of separate blobs. Small relative to
 * a real entry (1.0), so thickness still reads as volume written.
 */
export const QUIET_DAY_BASE = 0.02;

/** Local midnight for a timestamp. */
export function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function labelForScore(score: number): SentimentLabel {
  if (score <= -0.15) return 'negative';
  if (score >= 0.15) return 'positive';
  return 'neutral';
}

/**
 * Buckets scored entries into one row per day across the whole range —
 * including days with nothing in them, which is the point.
 *
 * `now` is injectable so the checks are deterministic.
 */
export function buildMoodDays(
  entries: JournalEntry[],
  range: MoodRange,
  now: number = Date.now()
): MoodDay[] {
  const today = startOfDay(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const firstDay = today - (range - 1) * dayMs;

  const byDay = new Map<number, MoodDay>();
  for (let i = 0; i < range; i += 1) {
    const date = firstDay + i * dayMs;
    byDay.set(date, {
      date,
      negative: 0,
      neutral: 0,
      positive: 0,
      entries: [],
      averageScore: null,
    });
  }

  for (const entry of entries) {
    const sentiment = entry.sentiment;
    if (!sentiment || typeof sentiment.score !== 'number' || !Number.isFinite(sentiment.score)) {
      continue;
    }
    const day = startOfDay(entry.updatedAt);
    const bucket = byDay.get(day);
    if (!bucket) continue; // outside the window

    const score = Math.max(-1, Math.min(1, sentiment.score));
    const label = sentiment.label ?? labelForScore(score);
    bucket[label] += 1;
    bucket.entries.push({ title: entry.title || 'Untitled entry', label, score });
  }

  for (const bucket of byDay.values()) {
    if (bucket.entries.length > 0) {
      const total = bucket.entries.reduce((sum, e) => sum + e.score, 0);
      bucket.averageScore = total / bucket.entries.length;
    }
  }

  return [...byDay.values()].sort((a, b) => a.date - b.date);
}

/**
 * Sequence-based bucketing: treats each individual scored entry as its own sequential point.
 * Used when viewing "By entry" flow so that multiple entries (even on the same day) create
 * an organic wave rather than collapsing into a single vertical slice.
 */
export function buildMoodSequence(entries: JournalEntry[]): MoodDay[] {
  const scored = entries
    .filter(
      (e) =>
        e.sentiment &&
        typeof e.sentiment.score === 'number' &&
        Number.isFinite(e.sentiment.score)
    )
    .sort((a, b) => a.updatedAt - b.updatedAt);

  return scored.map((entry) => {
    const score = Math.max(-1, Math.min(1, entry.sentiment!.score));
    const label = entry.sentiment!.label ?? labelForScore(score);

    // Dominant-channel weighting: the active channel swells, others stay near-zero.
    // This produces the dramatic 100:1 contrast ratio that reference streamgraphs use
    // (data-to-viz, Flourish, NYT "Ebb and Flow"). curveBasis handles visual smoothing.
    const THIN = 0.02;
    const posWeight = score >= 0.15 ? THIN + Math.abs(score) * 2.0 : THIN;
    const negWeight = score <= -0.15 ? THIN + Math.abs(score) * 2.0 : THIN;
    const neuWeight = Math.abs(score) < 0.15 ? THIN + (1 - Math.abs(score)) * 1.5 : THIN;

    return {
      date: entry.updatedAt,
      negative: negWeight,
      neutral: neuWeight,
      positive: posWeight,
      entries: [{ title: entry.title || 'Untitled entry', label, score }],
      averageScore: score,
    };
  });
}

/**
 * The rows handed to d3.stack(). Empty days carry the epsilon so
 * stackOffsetWiggle stays finite. Supports organic river tapering (taper: true).
 */
export function toStackRows(
  days: MoodDay[],
  options?: { taper?: boolean }
): Record<MoodSeriesKey | 'date', number>[] {
  const baseRows = days.map((day) => {
    const isEmpty = day.entries.length === 0;
    // Every active day keeps a thin baseline so the stream stays one continuous
    // body rather than breaking into islands. Empty days get only the epsilon,
    // which also keeps the row sum non-zero for stackOffsetWiggle.
    const base = isEmpty ? EMPTY_DAY_EPSILON : QUIET_DAY_BASE;
    return {
      date: day.date,
      negative: day.negative + base,
      neutral: day.neutral + base,
      positive: day.positive + base,
    };
  });

  if (!options?.taper || baseRows.length < 2) {
    return baseRows;
  }

  // Organic river lead-in and lead-out tapering (Flourish & NYT signature style)
  const firstDate = baseRows[0].date;
  const lastDate = baseRows[baseRows.length - 1].date;
  const step = Math.max(1000, (lastDate - firstDate) / Math.max(baseRows.length, 1));

  const startTaper: Record<MoodSeriesKey | 'date', number> = {
    date: firstDate - step,
    negative: EMPTY_DAY_EPSILON,
    neutral: EMPTY_DAY_EPSILON,
    positive: EMPTY_DAY_EPSILON,
  };

  const endTaper: Record<MoodSeriesKey | 'date', number> = {
    date: lastDate + step,
    negative: EMPTY_DAY_EPSILON,
    neutral: EMPTY_DAY_EPSILON,
    positive: EMPTY_DAY_EPSILON,
  };

  return [startTaper, ...baseRows, endTaper];
}

/** Scored entries within the window — what the <3 empty state counts. */
export function countScoredEntries(days: MoodDay[]): number {
  return days.reduce((total, day) => total + day.entries.length, 0);
}

/**
 * Last line of defence: if any stacked coordinate came back non-finite, the
 * caller should fall back to a symmetric offset rather than render a broken
 * path. Kept here so it is covered by the checks.
 */
export function isStackFinite(series: { 0: number; 1: number }[][]): boolean {
  for (const layer of series) {
    for (const point of layer) {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
    }
  }
  return true;
}
