import React, { useState, useEffect } from 'react';
import {
  signInWithGoogle,
  signOut as appSignOut,
  subscribeToAuthChanges,
} from './lib/firebase';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { ThreatModelModal } from './components/ThreatModelModal';
import type { UserProfile } from './types';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isThreatModelOpen, setIsThreatModelOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 font-sans">
      <Navbar
        user={user}
        onSignOut={handleSignOut}
        onNewEntry={() => {
          // When clicking New Journal from navbar, if user is logged in, Dashboard handles state or triggers refresh
          const newEntryBtn = document.getElementById('sidebar-new-entry-btn');
          if (newEntryBtn) {
            newEntryBtn.click();
          }
        }}
        onOpenThreatModel={() => setIsThreatModelOpen(true)}
      />

      {user ? (
        <Dashboard user={user} />
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
  );
}
