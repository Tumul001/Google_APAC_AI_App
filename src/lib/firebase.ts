import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { debug } from './debug';

// Initialize Firebase App singleton
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Authentication helper methods
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Firebase Auth error during Google sign-in:', error);
    throw error;
  }
}

export async function signOut(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (error: any) {
    console.error('Firebase Auth sign-out error:', error);
    throw error;
  }
}

export function subscribeToAuthChanges(callback: (user: User | null, isAdmin: boolean) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, false);
      return;
    }
    try {
      // Force refresh (true) to ensure newly assigned custom claims are retrieved immediately
      const idTokenResult = await user.getIdTokenResult(true);
      debug('[Auth] token refreshed', { admin: Boolean(idTokenResult.claims.admin) });
      const isAdmin = Boolean(idTokenResult.claims.admin);
      callback(user, isAdmin);
    } catch (err) {
      console.error('[Auth State] Failed to retrieve or refresh ID token:', err);
      callback(user, false);
    }
  });
}

/**
 * Check if the currently authenticated user possesses the 'admin' custom claim,
 * forcing a fresh token exchange with Firebase Auth.
 */
export async function checkIsCurrentUserAdmin(): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('[checkIsCurrentUserAdmin] auth.currentUser is null');
    return false;
  }
  try {
    const idTokenResult = await currentUser.getIdTokenResult(true);
    debug('[Auth] admin check', { admin: Boolean(idTokenResult.claims.admin) });
    return Boolean(idTokenResult.claims.admin);
  } catch (err) {
    console.error('[checkIsCurrentUserAdmin] Error checking admin claim:', err);
    return false;
  }
}

/**
 * Force refresh the ID token of the currently authenticated user
 */
export async function forceRefreshToken(): Promise<{ isAdmin: boolean; claims: Record<string, any> }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('[forceRefreshToken] auth.currentUser is null. Cannot force refresh token.');
    return { isAdmin: false, claims: {} };
  }
  try {
    const idTokenResult = await currentUser.getIdTokenResult(true);
    debug('[Auth] force refresh', { admin: Boolean(idTokenResult.claims.admin) });
    const isAdmin = Boolean(idTokenResult.claims.admin);
    return { isAdmin, claims: idTokenResult.claims };
  } catch (err) {
    console.error('[forceRefreshToken] Failed to force refresh ID token:', err);
    return { isAdmin: false, claims: {} };
  }
}
