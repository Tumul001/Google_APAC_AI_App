import React, { useState, useEffect, Suspense, lazy } from 'react';
import {
  signInWithGoogle,
  signOut as appSignOut,
  subscribeToAuthChanges,
  forceRefreshToken,
} from './lib/firebase';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import type { UserProfile } from './types';

/**
 * Signed-out visitors reach only the landing page, so the editor, the coach
 * workspace, the Maps SDK and the markdown renderer all load on demand rather
 * than before first paint. The modals split too — most sessions never open them.
 */
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const ThreatModelModal = lazy(() =>
  import('./components/ThreatModelModal').then((m) => ({ default: m.ThreatModelModal }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);

const RouteFallback: React.FC = () => (
  <div className="flex flex-1 items-center justify-center py-24" role="status">
    <span
      className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-stone-800 motion-reduce:animate-none"
      aria-hidden="true"
    />
    <span className="sr-only">Loading…</span>
  </div>
);

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isThreatModelOpen, setIsThreatModelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  // Sync browser back/forward and path changes
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = async (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
    if (path === '/admin') {
      try {
        const { isAdmin } = await forceRefreshToken();
        setUser((prev) => (prev ? { ...prev, isAdmin } : prev));
      } catch (err) {
        console.error('Failed to force refresh token on navigateTo /admin:', err);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((firebaseUser, isAdmin) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          isAdmin: isAdmin,
        });
      } else {
        setUser(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Route Guard: Non-admin users hitting /admin route -> quietly redirected to / without error leak
  useEffect(() => {
    if (!isAuthLoading) {
      if (currentPath === '/admin' && (!user || !user.isAdmin)) {
        // Silently replace history state back to '/'
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/');
          setCurrentPath('/');
        }
      }
    }
  }, [currentPath, user, isAuthLoading]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      // If popup was closed by user or cancelled, present friendly note
      if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('Google sign-in popup was closed before completion.');
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setAuthError('Authentication request was cancelled.');
      } else {
        setAuthError(err?.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await appSignOut();
      setUser(null);
    } catch (err: any) {
      console.error('Sign-out error:', err);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-ink-soft">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-ink-body border-t-transparent motion-reduce:animate-none motion-reduce:border-t-stone-300"
            aria-hidden="true"
          />
          <p className="text-meta font-medium text-ink-muted">Checking secure authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-inverse focus:px-4 focus:py-2 focus:text-ui focus:font-semibold focus:text-on-inverse"
        >
          Skip to main content
        </a>
        <Navbar
          user={user}
          onSignOut={handleSignOut}
          currentRoute={currentPath}
          onNavigateToAdmin={() => navigateTo('/admin')}
          onNavigateHome={() => navigateTo('/')}
          onNewEntry={() => {
            if (currentPath === '/admin') {
              navigateTo('/');
            }
            setTimeout(() => {
              const newEntryBtn = document.getElementById('sidebar-new-entry-btn');
              if (newEntryBtn) {
                newEntryBtn.click();
              }
            }, 50);
          }}
          onOpenThreatModel={() => setIsThreatModelOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSignIn={handleSignIn}
          isSigningIn={isSigningIn}
        />

        {user ? (
          <Suspense fallback={<RouteFallback />}>
            {currentPath === '/admin' && user.isAdmin ? (
              <AdminDashboard user={user} onNavigateHome={() => navigateTo('/')} />
            ) : (
              <Dashboard user={user} onOpenSettings={() => setIsSettingsOpen(true)} />
            )}
          </Suspense>
        ) : (
          <LandingPage
            onSignIn={handleSignIn}
            isLoading={isSigningIn}
            errorMessage={authError}
            onOpenThreatModel={() => setIsThreatModelOpen(true)}
          />
        )}

        <Suspense fallback={null}>
          {isThreatModelOpen && (
            <ThreatModelModal
              isOpen={isThreatModelOpen}
              onClose={() => setIsThreatModelOpen(false)}
            />
          )}

          {user && isSettingsOpen && (
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              user={user}
            />
          )}
        </Suspense>
      </div>
  );
}
