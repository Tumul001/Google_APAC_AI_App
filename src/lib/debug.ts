/**
 * Development-only logging.
 *
 * These call sites print journal titles, entry modes and decoded auth-token
 * claims. That is fine on a developer's machine and unacceptable in a shipped
 * build, where anything on the console can be read over a user's shoulder or
 * captured by an error-reporting agent. In production these are no-ops;
 * `import.meta.env.DEV` is statically replaced at build time, so the minifier
 * drops the branch entirely.
 *
 * Genuine failures still use console.warn / console.error directly — those are
 * meant to survive into production.
 */
type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

export const debug: LogFn = import.meta.env.DEV ? console.log.bind(console) : noop;
