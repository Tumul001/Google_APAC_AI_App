/**
 * Shared control primitives for the signed-in app.
 *
 * These are plain Tailwind class strings rather than a CSS `@layer components`
 * block: Tailwind v4 silently drops component classes that `@apply` other
 * component classes, so the CSS version compiled to nothing. String constants
 * are scanned normally and always resolve.
 *
 * One radius scale — controls `rounded-lg`, cards `rounded-xl`, modals `rounded-2xl`.
 * One focus treatment, one 150ms motion duration, 12px type floor.
 */

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

const BTN_BASE =
  'inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap ' +
  'rounded-lg px-3.5 py-2 text-ui font-medium ' +
  // Touch devices get a 44px comfortable target; mouse users keep the denser 36px.
  '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-4 ' +
  'transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out ' +
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 ' +
  'motion-reduce:transition-none motion-reduce:hover:translate-y-0 ' +
  FOCUS;

export const btnPrimary =
  `${BTN_BASE} bg-inverse font-semibold text-on-inverse shadow-2xs ` +
  'hover:-translate-y-px hover:bg-inverse-hover hover:shadow-xs active:translate-y-0';

export const btnSecondary =
  `${BTN_BASE} border border-line-strong bg-surface text-ink-secondary shadow-2xs ` +
  'hover:border-line-emphasis hover:bg-canvas hover:text-ink';

export const btnGhost = `${BTN_BASE} text-ink-soft hover:bg-subtle hover:text-ink`;

/** Square icon-only button. Callers must supply an aria-label. */
export const btnIcon =
  'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg ' +
  '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ' +
  'text-ink-muted transition-[background-color,color] duration-150 ' +
  'hover:bg-subtle hover:text-ink motion-reduce:transition-none ' +
  FOCUS;

/** Compact icon button for dense rows (sidebar entries, message actions). */
export const btnIconSm =
  'inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md ' +
  // 28px is fine under a mouse; a finger needs 44, and these sit next to a delete action.
  '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ' +
  'text-ink-faint transition-[background-color,color] duration-150 ' +
  'hover:bg-muted-surface/70 hover:text-ink-body motion-reduce:transition-none ' +
  FOCUS;

/* Surfaces */
export const card = 'rounded-xl border border-line/90 bg-surface shadow-2xs';
export const cardQuiet = 'rounded-xl border border-line/80 bg-canvas/70';

/** Metadata pill. 12px is this app's floor for readable UI text. */
export const chip =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line ' +
  'bg-subtle px-2 py-0.5 text-meta font-medium text-ink-secondary';

export const chipEmerald =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 ' +
  'bg-emerald-50 px-2 py-0.5 text-meta font-medium text-emerald-700';

export const field =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-ui text-ink ' +
  '[@media(pointer:coarse)]:py-2.5 ' +
  'transition-[border-color,box-shadow] duration-150 placeholder:text-ink-faint ' +
  'focus:border-ink-muted focus:outline-none focus:ring-1 focus:ring-ink-muted ' +
  'motion-reduce:transition-none';

/** Section label above a group of controls. */
export const sectionLabel =
  'text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted';
