import React, { useId, useMemo, useState } from 'react';
import { area, curveMonotoneX, stack, stackOffsetSilhouette, stackOffsetWiggle, stackOrderNone } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { Sparkles, TrendingUp } from 'lucide-react';
import type { JournalEntry } from '../types';
import {
  buildMoodDays,
  buildMoodSequence,
  countScoredEntries,
  isStackFinite,
  toStackRows,
  MOOD_SERIES_KEYS,
  type MoodDay,
  type MoodRange,
  type MoodSeriesKey,
} from '../lib/moodFlow';
import { sectionLabel } from '../lib/ui';

interface MoodFlowProps {
  entries: JournalEntry[];
  /** False when the user has not opted into mood tracking. */
  isEnabled: boolean;
  onOpenSettings?: () => void;
  view?: 'entry' | 'mood';
  onChangeView?: (view: 'entry' | 'mood') => void;
}

export type FlowRange = 'entries' | MoodRange;

const RANGES: { value: FlowRange; label: string }[] = [
  { value: 'entries', label: 'By entry' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

const SERIES_STYLE: Record<
  MoodSeriesKey,
  {
    label: string;
    description: string;
    stroke: string;
    fillStart: string;
    fillMid: string;
    fillEnd: string;
    dotColor: string;
    badgeBg: string;
    badgeText: string;
    activeBg: string;
  }
> = {
  positive: {
    label: 'Positive',
    description: 'Joy, gratitude, calm optimism',
    stroke: '#b45309',
    fillStart: '#fcd34d',
    fillMid: '#f59e0b',
    fillEnd: '#d97706',
    dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-800',
    activeBg: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  neutral: {
    label: 'Neutral',
    description: 'Observation, routine, balanced reflection',
    stroke: '#57534e',
    fillStart: '#e7e5e4',
    fillMid: '#a8a29e',
    fillEnd: '#78716c',
    dotColor: 'bg-stone-400',
    badgeBg: 'bg-stone-50 border-stone-200',
    badgeText: 'text-stone-700',
    activeBg: 'bg-stone-200 text-stone-900 border-stone-300',
  },
  negative: {
    label: 'Reflective',
    description: 'Vulnerability, challenge, heaviness',
    stroke: '#4338ca',
    fillStart: '#a5b4fc',
    fillMid: '#6366f1',
    fillEnd: '#4338ca',
    dotColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-50 border-indigo-200',
    badgeText: 'text-indigo-800',
    activeBg: 'bg-indigo-200 text-indigo-900 border-indigo-300',
  },
};

const VIEW_W = 960;
const VIEW_H = 380;
const PAD_X = 28;

/** Minimum scored entries before a stream says anything meaningful. */
const MIN_ENTRIES = 3;

export const MoodFlow: React.FC<MoodFlowProps> = ({
  entries,
  isEnabled,
  onOpenSettings,
  view = 'mood',
  onChangeView,
}) => {
  const [range, setRange] = useState<FlowRange>('entries');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoveredSeries, setHoveredSeries] = useState<MoodSeriesKey | null>(null);
  const gradientId = useId();

  const days = useMemo<MoodDay[]>(() => {
    if (range === 'entries') {
      return buildMoodSequence(entries);
    }
    return buildMoodDays(entries, range);
  }, [entries, range]);
  const scoredCount = useMemo(() => countScoredEntries(days), [days]);

  // Overall metric summary across current window
  const summary = useMemo(() => {
    let posCount = 0;
    let neuCount = 0;
    let negCount = 0;
    let scoreSum = 0;
    let scoredDays = 0;

    for (const d of days) {
      for (const e of d.entries) {
        if (e.label === 'positive') posCount++;
        else if (e.label === 'negative') negCount++;
        else neuCount++;
      }
      if (d.averageScore !== null) {
        scoreSum += d.averageScore;
        scoredDays++;
      }
    }

    const avgScore = scoredDays > 0 ? scoreSum / scoredDays : null;
    let dominant: MoodSeriesKey = 'neutral';
    if (posCount >= neuCount && posCount >= negCount) dominant = 'positive';
    else if (negCount >= neuCount && negCount >= posCount) dominant = 'negative';

    return { posCount, neuCount, negCount, avgScore, dominant };
  }, [days]);

  const { paths, series, x, y, taperOffset } = useMemo(() => {
    if (scoredCount < MIN_ENTRIES) return { paths: null, series: null, x: null, y: null, taperOffset: 0 };

    // Organic river tapering: zero-valued cap points at edges so streams converge
    // to nothing (data-to-viz / Flourish signature). Only for entry-sequence mode.
    const useTaper = range === 'entries' && days.length >= MIN_ENTRIES;
    const rows = toStackRows(days, { taper: useTaper }) as unknown as Record<string, number>[];
    const offset = useTaper ? 1 : 0;

    const build = (stackOffset: typeof stackOffsetSilhouette) =>
      stack<Record<string, number>>()
        .keys([...MOOD_SERIES_KEYS])
        .order(stackOrderNone)
        .offset(stackOffset)(rows) as unknown as { 0: number; 1: number }[][];

    let stackedSeries = build(stackOffsetSilhouette);
    if (!isStackFinite(stackedSeries)) stackedSeries = build(stackOffsetWiggle);

    let min = Infinity;
    let max = -Infinity;
    for (const layer of stackedSeries) {
      for (const point of layer) {
        if (point[0] < min) min = point[0];
        if (point[1] > max) max = point[1];
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = -1;
      max = 1;
    }

    // Full-bleed x range: taper cap points land at SVG edges, real data fills the middle.
    // The fade mask then smoothly hides the convergence zone.
    const xScale = scaleLinear()
      .domain([0, Math.max(rows.length - 1, 1)])
      .range([0, VIEW_W]);
    const yScale = scaleLinear()
      .domain([min, max])
      .range([VIEW_H - 24, 24]);

    const shape = area<{ 0: number; 1: number }>()
      .x((_, i) => xScale(i))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(curveMonotoneX);

    const computedPaths = MOOD_SERIES_KEYS.map((key, i) => ({
      key,
      d: shape(stackedSeries[i]) ?? '',
    })).filter((p) => p.d);

    return {
      paths: computedPaths,
      series: stackedSeries,
      x: xScale,
      y: yScale,
      taperOffset: offset,
    };
  }, [days, scoredCount, range]);

  const xForIndex = (i: number) =>
    x ? x(i + (taperOffset ?? 0)) : PAD_X + (i * (VIEW_W - PAD_X * 2)) / Math.max(days.length - 1, 1);

  // Active entry vertical position on its specific emotional ribbon
  const activeFocalPoint = useMemo(() => {
    if (hoverIndex === null || !series || !x || !y) return null;
    const currentDay = days[hoverIndex];
    if (!currentDay || currentDay.entries.length === 0) return null;

    const dominantLabel: MoodSeriesKey =
      currentDay.averageScore !== null
        ? currentDay.averageScore >= 0.15
          ? 'positive'
          : currentDay.averageScore <= -0.15
          ? 'negative'
          : 'neutral'
        : (currentDay.entries[0]?.label as MoodSeriesKey) ?? 'neutral';

    const seriesIdx = MOOD_SERIES_KEYS.indexOf(dominantLabel);
    if (seriesIdx === -1) return null;

    const layer = series[seriesIdx];
    const dataIdx = hoverIndex + (taperOffset ?? 0);
    const point = layer[dataIdx];
    if (!point) return null;

    const px = x(dataIdx);
    const y0 = y(point[0]);
    const y1 = y(point[1]);
    const py = (y0 + y1) / 2;

    return {
      x: px,
      y: py,
      label: dominantLabel,
      score: currentDay.averageScore,
    };
  }, [hoverIndex, days, series, x, y]);

  // Multi-point temporal timeline markers across the window
  const timelineTicks = useMemo(() => {
    if (days.length === 0) return [];
    if (days.length <= 4) {
      return days.map((d, i) => ({ index: i, day: d }));
    }
    const count = Math.min(5, days.length);
    const step = (days.length - 1) / (count - 1);
    const indices = Array.from({ length: count }, (_, i) => Math.round(i * step));
    const unique = Array.from(new Set(indices));
    return unique.map((i) => ({ index: i, day: days[i] }));
  }, [days]);

  const rangeToggle = (
    <div
      role="group"
      aria-label="Time range"
      className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-subtle p-0.5"
    >
      {RANGES.map((option) => {
        const isActive = range === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => {
              setRange(option.value);
              setHoverIndex(null);
            }}
            className={`cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-meta font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
              isActive ? 'bg-surface text-ink shadow-2xs' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const viewToggle = onChangeView ? (
    <div
      role="group"
      aria-label="View"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-subtle p-0.5"
    >
      {(['entry', 'mood'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChangeView(v)}
          className={`cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-meta font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
            view === v ? 'bg-surface text-ink shadow-2xs' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {v === 'entry' ? 'Entry' : 'Mood flow'}
        </button>
      ))}
    </div>
  ) : null;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-title font-semibold text-ink">
          Mood <em className="font-serif font-normal italic">flow</em>
        </h2>
        <p className="mt-1 text-ui text-ink-muted">
          {isEnabled
            ? 'How the tone of your entries evolves over time — symmetrical streamgraph.'
            : 'Turn on mood tracking to see this.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {viewToggle}
        {isEnabled && rangeToggle}
      </div>
    </div>
  );

  // ── Not opted in ───────────────────────────────────────────────────────────
  if (!isEnabled) {
    return (
      <section className="mx-auto max-w-[62ch] space-y-5 px-4 py-8 sm:px-6">
        {header}
        <div className="rounded-xl border border-line bg-surface p-6 text-center">
          <Sparkles className="mx-auto mb-3 h-6 w-6 text-ink-ghost" aria-hidden="true" />
          <p className="text-body text-ink-secondary">Mood tracking is off.</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-ui text-ink-muted">
            With it on, each entry you save is scored for tone so this chart can show how a week
            felt. That means the entry text is sent to Gemini when you save it.
          </p>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-4 cursor-pointer rounded-md text-ui font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Open settings
            </button>
          )}
        </div>
      </section>
    );
  }

  // ── Opted in, not enough data yet ──────────────────────────────────────────
  if (!paths) {
    return (
      <section className="mx-auto max-w-[62ch] space-y-5 px-4 py-8 sm:px-6">
        {header}
        <div className="rounded-xl border border-line bg-surface p-6 text-center">
          <Sparkles className="mx-auto mb-3 h-6 w-6 text-ink-ghost" aria-hidden="true" />
          <p className="text-body text-ink-secondary">Keep journaling to see your mood flow emerge.</p>
          <p className="mt-2 text-ui text-ink-muted">
            {scoredCount === 0
              ? 'No scored entries in this window yet.'
              : `${scoredCount} of ${MIN_ENTRIES} entries so far.`}
          </p>
        </div>
      </section>
    );
  }

  const hovered = hoverIndex === null ? null : days[hoverIndex];
  const isRightHalf = hoverIndex !== null && hoverIndex >= days.length / 2;

  return (
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
      {header}

      {/* Flourish-style Interactive Legend & Summary Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-subtle bg-subtle/50 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Filter series">
          <span className="text-meta font-medium text-ink-muted mr-1">Highlight tone:</span>
          {MOOD_SERIES_KEYS.map((key) => {
            const style = SERIES_STYLE[key];
            const isSelected = hoveredSeries === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setHoveredSeries(isSelected ? null : key)}
                onMouseEnter={() => setHoveredSeries(key)}
                onMouseLeave={() => setHoveredSeries(null)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-meta font-medium transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? `${style.activeBg} shadow-2xs`
                    : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${style.dotColor}`} aria-hidden="true" />
                <span>{style.label}</span>
              </button>
            );
          })}
        </div>

        {/* Aggregate tone indicator */}
        <div className="flex items-center gap-3 text-meta text-ink-muted">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
            <span>Tone:</span>
            <span className="font-medium text-ink capitalize">
              {SERIES_STYLE[summary.dominant].label}
            </span>
          </div>
          {summary.avgScore !== null && (
            <div className="flex items-center gap-1">
              <span>Avg:</span>
              <span
                className={`font-mono text-2xs font-semibold ${
                  summary.avgScore >= 0.15
                    ? 'text-amber-700'
                    : summary.avgScore <= -0.15
                    ? 'text-slate-700'
                    : 'text-stone-600'
                }`}
              >
                {summary.avgScore > 0 ? `+${summary.avgScore.toFixed(2)}` : summary.avgScore.toFixed(2)}
              </span>
            </div>
          )}
          <span>{scoredCount} scored {scoredCount === 1 ? 'entry' : 'entries'}</span>
        </div>
      </div>

      <figure className="m-0">
        <div className="relative rounded-2xl border border-line bg-surface p-4 shadow-2xs">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="block h-auto w-full select-none"
            role="img"
            aria-label={`Mood flow streamgraph across ${range} range, from ${scoredCount} scored entries.`}
            onMouseLeave={() => {
              setHoverIndex(null);
            }}
          >
            <defs>
              {/* Horizontal river-mouth edge fade mask: eliminates harsh vertical cliff slices */}
              <linearGradient id={`${gradientId}-fade-grad`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="3%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="97%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
              <mask id={`${gradientId}-fade-mask`}>
                <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={`url(#${gradientId}-fade-grad)`} />
              </mask>

              {/* Rich 3-stop luminous gradients for depth (data-to-viz / BuPu style richness) */}
              {MOOD_SERIES_KEYS.map((key) => (
                <linearGradient
                  key={key}
                  id={`${gradientId}-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={SERIES_STYLE[key].fillStart} stopOpacity="0.95" />
                  <stop offset="50%" stopColor={SERIES_STYLE[key].fillMid} stopOpacity="0.90" />
                  <stop offset="100%" stopColor={SERIES_STYLE[key].fillEnd} stopOpacity="0.85" />
                </linearGradient>
              ))}
            </defs>

            {/* Subtle vertical tick guidelines */}
            {timelineTicks.map(({ index }) => (
              <line
                key={index}
                x1={xForIndex(index)}
                x2={xForIndex(index)}
                y1={VIEW_H - 12}
                y2={VIEW_H - 4}
                stroke="var(--color-line-strong)"
                strokeWidth={1}
                strokeOpacity={0.6}
              />
            ))}

            {/* Render stream paths with soft river-mouth boundaries and interactive series spotlighting */}
            <g mask={`url(#${gradientId}-fade-mask)`}>
              {paths.map((path) => {
                const isDimmed = hoveredSeries !== null && hoveredSeries !== path.key;
                const isHighlighted = hoveredSeries === path.key;
                const style = SERIES_STYLE[path.key];

                return (
                  <path
                    key={path.key}
                    d={path.d}
                    fill={`url(#${gradientId}-${path.key})`}
                    stroke="none"
                    fillOpacity={isDimmed ? 0.35 : isHighlighted ? 1.0 : 0.88}
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredSeries(path.key)}
                    onMouseLeave={() => setHoveredSeries(null)}
                    role="button"
                    aria-label={`${style.label} mood stream`}
                  />
                );
              })}
            </g>

            {/* Flourish-style vertical abline tracking hover position */}
            {hoverIndex !== null && (
              <line
                x1={xForIndex(hoverIndex)}
                x2={xForIndex(hoverIndex)}
                y1={14}
                y2={VIEW_H - 14}
                stroke="var(--color-ink-faint)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            )}

            {/* Active entry glowing focal bead on the tone ribbon (NYT / Flourish signature) */}
            {activeFocalPoint && (
              <g className="pointer-events-none transition-all duration-150">
                <circle
                  cx={activeFocalPoint.x}
                  cy={activeFocalPoint.y}
                  r={11}
                  fill={SERIES_STYLE[activeFocalPoint.label].stroke}
                  fillOpacity={0.22}
                />
                <circle
                  cx={activeFocalPoint.x}
                  cy={activeFocalPoint.y}
                  r={5}
                  fill="var(--color-surface)"
                  stroke={SERIES_STYLE[activeFocalPoint.label].stroke}
                  strokeWidth={2.5}
                />
              </g>
            )}

            {/* One invisible hit column per day/entry. Keyboard-reachable for full accessibility. */}
            {days.map((day, i) => {
              const w = (VIEW_W - PAD_X * 2) / Math.max(days.length, 1);
              return (
                <rect
                  key={day.date}
                  x={xForIndex(i) - w / 2}
                  y={0}
                  width={w}
                  height={VIEW_H}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${new Date(day.date).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    ...(range === 'entries' ? { hour: '2-digit', minute: '2-digit' } : {}),
                  })}: ${
                    day.entries.length === 0
                      ? 'no entries'
                      : `${day.entries.length} ${day.entries.length === 1 ? 'entry' : 'entries'}`
                  }`}
                  onMouseEnter={() => setHoverIndex(i)}
                  onFocus={() => setHoverIndex(i)}
                  onBlur={() => setHoverIndex(null)}
                  className="cursor-crosshair focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink"
                />
              );
            })}
          </svg>

          {/* Multi-point temporal timeline markers */}
          <div className="relative mt-2.5 h-6 px-7 text-meta text-ink-muted">
            {timelineTicks.map(({ index, day }) => (
              <div
                key={day.date}
                className="absolute -translate-x-1/2 flex flex-col items-center whitespace-nowrap"
                style={{ left: `${(xForIndex(index) / VIEW_W) * 100}%` }}
              >
                <span className="text-2xs text-ink-muted font-medium">
                  {new Date(day.date).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    ...(range === 'entries' ? { hour: '2-digit', minute: '2-digit' } : {}),
                  })}
                </span>
              </div>
            ))}
          </div>

          {/* Smart opposite-side anchored tooltip: never masks hovered data stream */}
          {hovered && (
            <div
              role="status"
              className={`pointer-events-none absolute top-4 z-10 w-80 max-w-[calc(100%-2rem)] rounded-xl border border-line bg-surface/95 p-3.5 shadow-md backdrop-blur-xs transition-all duration-150 ${
                isRightHalf ? 'left-4' : 'right-4'
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-line-subtle pb-2">
                <p className="text-meta font-semibold text-ink">
                  {new Date(hovered.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    ...(range === 'entries' ? { hour: '2-digit', minute: '2-digit' } : {}),
                  })}
                </p>
                {hovered.averageScore !== null && (
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-2xs font-medium ${
                      hovered.averageScore >= 0.15
                        ? 'bg-amber-100/70 text-amber-800'
                        : hovered.averageScore <= -0.15
                        ? 'bg-slate-200 text-slate-800'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {hovered.averageScore > 0
                      ? `+${hovered.averageScore.toFixed(2)}`
                      : hovered.averageScore.toFixed(2)}
                  </span>
                )}
              </div>
              {hovered.entries.length === 0 ? (
                <p className="mt-2 text-ui text-ink-muted">No entries on this day.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {hovered.entries.slice(0, 4).map((e, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-ui">
                      <span className="min-w-0 truncate text-meta font-medium text-ink">{e.title}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium capitalize ${
                          e.label === 'positive'
                            ? 'bg-amber-50 text-amber-700'
                            : e.label === 'negative'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-subtle text-ink-muted'
                        }`}
                      >
                        {e.label}
                      </span>
                    </li>
                  ))}
                  {hovered.entries.length > 4 && (
                    <li className="pt-0.5 text-meta text-ink-muted">
                      +{hovered.entries.length - 4} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-meta text-ink-muted">
          <span>Symmetrical streamgraph</span>
          <span className="text-ink-ghost" aria-hidden="true">·</span>
          <span>Swells reflect emotional intensity</span>
          <span className="text-ink-ghost" aria-hidden="true">·</span>
          <span>Hover along timeline or click a tone above to isolate</span>
        </figcaption>
      </figure>
    </section>
  );
};

