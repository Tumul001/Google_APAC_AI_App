import React, { useState, useEffect } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  signInWithGoogle,
  signOut as appSignOut,
  subscribeToAuthChanges,
  forceRefreshToken,
} from './lib/firebase';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { ThreatModelModal } from './components/ThreatModelModal';
import type { UserProfile } from './types';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isThreatModelOpen, setIsThreatModelOpen] = useState(false);
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
      <div className="flex min-h-screen items-center justify-center bg-stone-50 text-stone-600">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
          <p className="text-xs font-medium text-stone-500">Checking secure authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 font-sans">
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
        />

        {user ? (
          currentPath === '/admin' && user.isAdmin ? (
            <AdminDashboard user={user} onNavigateHome={() => navigateTo('/')} />
          ) : (
            <Dashboard user={user} />
          )
        ) : (
          <LandingPage
            onSignIn={handleSignIn}
            isLoading={isSigningIn}
            errorMessage={authError}
            onOpenThreatModel={() => setIsThreatModelOpen(true)}
          />
        )}

        <ThreatModelModal
          isOpen={isThreatModelOpen}
          onClose={() => setIsThreatModelOpen(false)}
        />
      </div>
    </APIProvider>
  );
}
