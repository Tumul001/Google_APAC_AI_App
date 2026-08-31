import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { JournalEntry } from '../types';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Initialize Firestore with specific databaseId from config if present
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

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

export function subscribeToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Strict Undefined-Stripping Utility:
 * Sanitizes object payloads before saving to Firestore to prevent SDK crashes.
 */
export function sanitizePayload<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (key, value) => {
      if (value === undefined) {
        return null;
      }
      return value;
    })
  );
}

/**
 * Firestore CRUD helpers strictly bound to /users/{userId}/interactions/{entryId}
 */
export async function saveJournalEntry(userId: string, entry: JournalEntry): Promise<void> {
  if (!userId || !entry.id) {
    throw new Error('User ID and Entry ID are required to save an entry.');
  }

  const sanitized = sanitizePayload(entry);
  const entryDocRef = doc(db, 'users', userId, 'interactions', entry.id);
  await setDoc(entryDocRef, sanitized, { merge: true });
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) {
    throw new Error('User ID and Entry ID are required to delete an entry.');
  }

  const entryDocRef = doc(db, 'users', userId, 'interactions', entryId);
  await deleteDoc(entryDocRef);
}

export function subscribeToUserEntries(
  userId: string,
  onData: (entries: JournalEntry[]) => void,
  onError?: (err: Error) => void
) {
  if (!userId) return () => {};

  const interactionsRef = collection(db, 'users', userId, 'interactions');
  const q = query(interactionsRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: JournalEntry[] = [];
      snapshot.forEach((docSnap) => {
        entries.push(docSnap.data() as JournalEntry);
      });
      onData(entries);
    },
    (error) => {
      console.error('Firestore snapshot listener error:', error);
      if (onError) onError(error);
    }
  );
}

export async function fetchUserEntriesOnce(userId: string): Promise<JournalEntry[]> {
  if (!userId) return [];
  const interactionsRef = collection(db, 'users', userId, 'interactions');
  const q = query(interactionsRef, orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  const entries: JournalEntry[] = [];
  snap.forEach((d) => entries.push(d.data() as JournalEntry));
  return entries;
}
