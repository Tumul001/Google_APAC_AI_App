import React from 'react';
import {
  Sparkles,
  Lock,
  Database,
  BrainCircuit,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
  onOpenThreatModel: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  isLoading,
  errorMessage,
  onOpenThreatModel,
}) => {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col justify-between">
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        {errorMessage && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
            <div className="h-5 w-5 text-red-600 shrink-0">⚠️</div>
            <div>
              <p className="font-medium">Authentication Notice</p>
              <p className="mt-0.5 text-xs text-red-700">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-stone-300/80 bg-stone-100/90 px-3.5 py-1 text-xs font-medium text-stone-700 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span>Private AI Reflection & Journaling Workspace</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl lg:text-6xl font-serif">
            Reflect deeper. Think clearer.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base sm:text-lg text-stone-600 leading-relaxed font-sans">
            A conversational journal powered by <strong>Gemini 3.6 Flash</strong> and secured with{' '}
            <strong>Cloud Firestore</strong>. Your thoughts, reflections, and insights remain
            strictly isolated to your private account.
          </p>

          {/* Call to Action */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              id="google-signin-hero-btn"
              onClick={onSignIn}
              disabled={isLoading}
              className="flex w-full sm:w-auto items-center justify-center gap-3 rounded-xl bg-stone-900 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 transition-all disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
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
              )}
              <span>{isLoading ? 'Connecting to Google...' : 'Sign in with Google'}</span>
            </button>

            <button
              id="threat-model-hero-btn"
              onClick={onOpenThreatModel}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-3.5 text-sm font-medium text-stone-700 shadow-2xs hover:bg-stone-50 transition-all cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Security & Threat Model</span>
            </button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> No password storage required
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> User-isolated Firestore
            </span>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-800 mb-4">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-stone-900">Gemini 3.6 Flash</h2>
            <p className="mt-2 text-xs sm:text-sm text-stone-600 leading-relaxed">
              Multi-turn contextual reflections, empathetic feedback, constructive brainstorming,
              and structured insight summaries.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-800 mb-4">
              <Database className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-stone-900">Isolated Cloud Firestore</h2>
            <p className="mt-2 text-xs sm:text-sm text-stone-600 leading-relaxed">
              Every conversation and reflection is written to user-specific Firestore paths
              enforced by strict security rules.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-800 mb-4">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-stone-900">Zero-Secret Exposure</h2>
            <p className="mt-2 text-xs sm:text-sm text-stone-600 leading-relaxed">
              Gemini API keys stay protected on the secure Express backend with resilient model
              fallback ladders.
            </p>
          </div>
        </div>

        {/* Workflow Showcase */}
        <div className="mt-16 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xs">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
            How It Works
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="flex gap-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
                1
              </div>
              <div>
                <h3 className="text-sm font-medium text-stone-900">Sign in securely</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Authenticate with Google Firebase Auth without transmitting passwords.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
                2
              </div>
              <div>
                <h3 className="text-sm font-medium text-stone-900">Journal & Converse</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Write daily thoughts or brainstorm ideas with Gemini 3.6 Flash in multi-turn dialogues.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
                3
              </div>
              <div>
                <h3 className="text-sm font-medium text-stone-900">Persistent History</h3>
                <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                  Review past entries, extract summaries, and track your personal growth timeline.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200/80 bg-white py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 text-xs text-stone-500 sm:px-6">
          <p>© 2026 Gemini Journal & Reflections. User authenticated & Cloud Firestore secured.</p>
          <div className="flex items-center gap-4">
            <button
              onClick={onOpenThreatModel}
              className="text-stone-600 hover:text-stone-900 underline underline-offset-2"
            >
              Threat Analysis
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
