import React from 'react';
import {
  AlertCircle,
  BrainCircuit,
  Bot,
  CheckCircle2,
  Lock,
  MapPin,
  ShieldCheck,
  User,
} from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
  onOpenThreatModel: () => void;
}

const GoogleMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="currentColor"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="currentColor"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="currentColor"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);

const FEATURES = [
  {
    icon: BrainCircuit,
    title: 'Multi-turn reflection',
    body:
      'Every turn stays in context. Switch between reflection, brainstorming, deep thinking and gratitude without starting over.',
  },
  {
    icon: MapPin,
    title: 'Place, only when you add it',
    body:
      'Tag an entry with a place you search for, or where you are right now. Untagged entries hold no location at all.',
  },
  {
    icon: Lock,
    title: 'Isolated to your account',
    body:
      'Entries are written to a Firestore path keyed to your account. The rules reject every read that is not yours. A coach sees an entry only after you share that entry.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  isLoading,
  errorMessage,
  onOpenThreatModel,
}) => {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <main id="main-content">
        {/* Hero — the page's one visual moment */}
        <section className="relative isolate overflow-hidden border-b border-line/80">
          <div className="landing-texture" aria-hidden="true" />

          <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
            {errorMessage && (
              <div
                role="status"
                aria-live="polite"
                className="mb-10 flex max-w-2xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-ui text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-semibold">Sign-in didn&rsquo;t complete</p>
                  <p className="mt-0.5 break-words text-red-700">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
              {/* Left: the argument */}
              <div className="lg:col-span-7">
                <h1 className="text-[clamp(2.25rem,5.2vw,3.5rem)] font-bold leading-[1.08] tracking-tight text-ink text-pretty">
                  <span className="block">Write it down.</span>
                  <span className="block">
                    Think it{' '}
                    <em className="font-serif font-normal italic tracking-normal">through</em>.
                  </span>
                </h1>

                <p className="mt-6 max-w-xl text-body text-ink-soft sm:text-title">
                  Write an entry, then keep talking to it. Gemini reads the whole thread, so the
                  fourth question knows what the first one said. Only your account can open any of it.
                </p>

                <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <button
                    id="google-signin-hero-btn"
                    type="button"
                    onClick={onSignIn}
                    disabled={isLoading}
                    className="inline-flex min-h-[3rem] cursor-pointer items-center justify-center gap-3 rounded-xl bg-inverse px-7 py-3.5 text-ui font-semibold text-surface shadow-2xs transition-[transform,background-color,box-shadow] duration-150 ease-out hover:-translate-y-px hover:bg-inverse-hover hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    {isLoading ? (
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : (
                      <GoogleMark className="h-4 w-4" />
                    )}
                    <span>{isLoading ? 'Connecting to Google…' : 'Sign in with Google'}</span>
                  </button>

                  <button
                    id="threat-model-hero-btn"
                    type="button"
                    onClick={onOpenThreatModel}
                    className="inline-flex min-h-[3rem] cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3.5 text-ui font-medium text-ink-secondary shadow-2xs transition-[background-color,border-color] duration-150 hover:border-line-emphasis hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <ShieldCheck className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                    <span>Read the threat model</span>
                  </button>
                </div>

                <p className="mt-5 text-ui text-ink-muted">
                  Google sign-in only. This app never creates, sends or stores a password.
                </p>
              </div>

              {/* Right: a specimen of the actual editor */}
              <div className="lg:col-span-5" aria-hidden="true">
                <div className="pointer-events-none select-none rounded-2xl border border-line/90 bg-surface p-4 shadow-xs sm:p-5">
                  <div className="flex items-center justify-between gap-3 border-b border-line/80 pb-3">
                    <div className="min-w-0">
                      <p className="truncate text-ui font-semibold text-ink">
                        Thursday, after the review
                      </p>
                      <span className="mt-1 flex items-center gap-1 text-meta text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Saved in Firestore
                      </span>
                    </div>
                    <span className="shrink-0 rounded-md bg-subtle px-2.5 py-1 text-meta font-medium text-ink-secondary">
                      Reflection
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-meta font-medium text-rose-800">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                    <span className="truncate">Cubbon Park, Bengaluru</span>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted-surface text-ink-secondary">
                          <User className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-meta font-semibold text-ink">You</span>
                      </div>
                      <p className="mt-1.5 pl-8 font-serif text-ui text-ink-body">
                        The feedback was fair and I still took it badly. I want to understand why.
                      </p>
                    </div>

                    <div className="border-t border-line-subtle/80 pt-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-inverse text-on-inverse">
                          <Bot className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-meta font-semibold text-ink">Gemini</span>
                        <span className="text-meta text-ink-faint" translate="no">
                          • gemini-3.6-flash
                        </span>
                      </div>
                      <p className="mt-1.5 pl-8 font-serif text-ui text-ink-body">
                        Separate the two for a moment. Which part stung — the substance of the note,
                        or being seen not having caught it first?
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features — deliberately quieter than the hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 className="max-w-2xl text-[clamp(1.5rem,3vw,2rem)] font-bold leading-tight tracking-tight text-ink text-pretty">
            Built for how you{' '}
            <em className="font-serif font-normal italic tracking-normal">reflect</em>.
          </h2>

          <dl className="mt-10 border-t border-line">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="grid grid-cols-1 gap-x-10 gap-y-2 border-b border-line py-7 sm:grid-cols-12 sm:py-8"
              >
                <dt className="sm:col-span-4">
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                    <span className="text-body font-semibold text-ink">{title}</span>
                  </span>
                </dt>
                <dd className="max-w-[58ch] font-serif text-body text-ink-soft sm:col-span-7">{body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="mt-auto border-t border-line/80 bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-ui text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            <span className="font-medium text-ink-secondary">Gemini Reflections</span>. Built on Firebase
            Auth, Cloud Firestore and the Gemini API.
          </p>
          <button
            type="button"
            onClick={onOpenThreatModel}
            className="inline-flex cursor-pointer items-center self-start rounded-md text-ink-soft underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [@media(pointer:coarse)]:min-h-11 sm:self-auto"
          >
            Threat model
          </button>
        </div>
      </footer>
    </div>
  );
};
