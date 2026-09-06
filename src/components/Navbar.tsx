import React from 'react';
import { BookOpen, LogOut, Plus, ShieldCheck, User, ShieldAlert, Settings } from 'lucide-react';
import type { UserProfile } from '../types';
import { btnPrimary, btnSecondary, btnGhost, chip } from '../lib/ui';

interface NavbarProps {
  user: UserProfile | null;
  onSignOut: () => void;
  onNewEntry: () => void;
  onOpenThreatModel: () => void;
  onOpenSettings?: () => void;
  currentRoute?: string;
  onNavigateToAdmin?: () => void;
  onNavigateHome?: () => void;
  onSignIn?: () => void;
  isSigningIn?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onSignOut,
  onNewEntry,
  onOpenThreatModel,
  onOpenSettings,
  currentRoute = '/',
  onNavigateToAdmin,
  onNavigateHome,
  onSignIn,
  isSigningIn = false,
}) => {
  const onAdminRoute = currentRoute === '/admin';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      {/* h-16 keeps the bar at exactly 4rem, which the Dashboard and LandingPage
          height calculations both assume. */}
      <div
        className={`mx-auto flex h-16 items-center justify-between gap-3 ${
          // Signed in the bar spans the app shell, so its padding matches the
          // panels underneath (p-4). Signed out it matches the landing container.
          user ? 'max-w-none px-4' : 'max-w-6xl px-4 sm:px-6'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-inverse text-on-inverse">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden whitespace-nowrap text-body font-semibold tracking-tight text-ink sm:block">
              Gemini Reflections
            </span>
            <span className={user ? 'hidden lg:block' : 'hidden sm:block'}>
              <span className={chip} translate="no">
                Gemini 3.6 Flash
              </span>
            </span>
          </div>
        </div>

        <nav aria-label="Primary" className="flex shrink-0 items-center gap-2">
          {onOpenSettings && user && (
            <button
              id="settings-btn"
              type="button"
              onClick={onOpenSettings}
              className={btnSecondary}
              title="Notification and integration settings"
              aria-label="Settings"
            >
              <Settings className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}

          <span className={user ? 'hidden md:block' : 'block'}>
            <button
              id="threat-model-btn"
              type="button"
              onClick={onOpenThreatModel}
              className={btnSecondary}
              title="Security threat model and protections"
              aria-label="Security threat model"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
              <span className="hidden sm:inline">Threat model</span>
            </button>
          </span>

          {!user && onSignIn && (
            <button
              id="navbar-signin-btn"
              type="button"
              onClick={onSignIn}
              disabled={isSigningIn}
              className={btnPrimary}
            >
              {isSigningIn ? 'Signing in…' : 'Sign in'}
            </button>
          )}

          {user && (
            <>
              {user.isAdmin &&
                (onAdminRoute ? (
                  <button
                    id="back-to-journal-btn"
                    type="button"
                    onClick={onNavigateHome}
                    className={btnSecondary}
                    title="Return to your own reflections"
                    aria-label="My journal"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                    <span className="hidden sm:inline">My journal</span>
                  </button>
                ) : (
                  <button
                    id="admin-coach-btn"
                    type="button"
                    onClick={onNavigateToAdmin}
                    className={btnSecondary}
                    title="Open the coach review workspace"
                    aria-label="Coach review"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                    <span className="hidden sm:inline">Coach review</span>
                  </button>
                ))}

              <button
                id="new-entry-header-btn"
                type="button"
                onClick={onNewEntry}
                className={btnPrimary}
                aria-label="New journal entry"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">New journal</span>
              </button>

              <span className="mx-1 hidden h-5 w-px bg-muted-surface sm:block" aria-hidden="true" />

              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={`Signed in as ${user.displayName || user.email || 'your account'}`}
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 rounded-full border border-line object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted-surface text-ink-soft">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
                <p
                  className="hidden max-w-[14ch] truncate text-ui font-medium text-ink lg:block"
                  title={user.email || undefined}
                >
                  {user.displayName || 'Signed in'}
                </p>
              </div>

              <button
                id="sign-out-btn"
                type="button"
                onClick={onSignOut}
                className={btnGhost}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
