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
  collectionGroup,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { JournalEntry, EntryLocation, AdminAuditLog } from '../types';

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

export function subscribeToAuthChanges(callback: (user: User | null, isAdmin: boolean) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      console.log('[Auth State] No active user signed in.');
      callback(null, false);
      return;
    }
    try {
      console.log(`[Auth State] User detected: ${user.email} (${user.uid}). Requesting getIdTokenResult(true)...`);
      // Force refresh (true) to ensure newly assigned custom claims are retrieved immediately
      const idTokenResult = await user.getIdTokenResult(true);
      console.log('[Auth State] Decoded Token Claims from getIdTokenResult(true):', {
        email: user.email,
        uid: user.uid,
        claims: idTokenResult.claims,
        'claims.admin': idTokenResult.claims.admin,
        authTime: idTokenResult.authTime,
        issuedAtTime: idTokenResult.issuedAtTime,
      });
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
    console.log('[checkIsCurrentUserAdmin] Calling currentUser.getIdTokenResult(true)...');
    const idTokenResult = await currentUser.getIdTokenResult(true);
    console.log('[checkIsCurrentUserAdmin] Decoded claims:', idTokenResult.claims);
    return Boolean(idTokenResult.claims.admin);
  } catch (err) {
    console.error('[checkIsCurrentUserAdmin] Error checking admin claim:', err);
    return false;
  }
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
 * Google Maps Integration Directive: Payload Validation
 * Validates lat/lng numerical ranges (-90..90, -180..180) and place name bounds.
 */
export function validateLocation(loc: unknown): EntryLocation | undefined {
  if (!loc || typeof loc !== 'object') return undefined;
  const raw = loc as Partial<EntryLocation>;
  const lat = typeof raw.lat === 'number' ? raw.lat : NaN;
  const lng = typeof raw.lng === 'number' ? raw.lng : NaN;
  const placeName = typeof raw.placeName === 'string' ? raw.placeName.trim() : '';

  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid coordinates: lat and lng must be numeric.');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90 degrees.');
  }
  if (lng < -180 || lng > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180 degrees.');
  }
  if (!placeName) {
    throw new Error('Invalid location: placeName is required.');
  }

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    placeName: placeName.slice(0, 256),
  };
}

/**
 * Firestore CRUD helpers strictly bound to /users/{userId}/interactions/{entryId}
 */
export async function saveJournalEntry(userId: string, entry: JournalEntry): Promise<void> {
  if (!userId || !entry.id) {
    throw new Error('User ID and Entry ID are required to save an entry.');
  }

  // Validate optional nested location payload if present
  let sanitizedLocation: EntryLocation | undefined = undefined;
  if (entry.location) {
    sanitizedLocation = validateLocation(entry.location);
  }

  const entryToSave: JournalEntry = {
    ...entry,
    location: sanitizedLocation,
  };

  const sanitized = sanitizePayload(entryToSave);
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
    console.log(`[forceRefreshToken] Calling currentUser.getIdTokenResult(true) for ${currentUser.email}...`);
    const idTokenResult = await currentUser.getIdTokenResult(true);
    console.log('[forceRefreshToken] Raw Decoded Claims from Firebase Auth:', idTokenResult.claims);
    console.log('[forceRefreshToken] admin claim value:', idTokenResult.claims.admin, 'type:', typeof idTokenResult.claims.admin);
    const isAdmin = Boolean(idTokenResult.claims.admin);
    return { isAdmin, claims: idTokenResult.claims };
  } catch (err) {
    console.error('[forceRefreshToken] Failed to force refresh ID token:', err);
    return { isAdmin: false, claims: {} };
  }
}

/**
 * Admin Role & RBAC Directive: Subscribe to all entries explicitly shared with the coach.
 * Uses collectionGroup('interactions') with where('sharedWithCoach', '==', true).
 * Strictly gated by firestore.rules (requires request.auth.token.admin == true).
 */
export function subscribeToSharedCoachEntries(
  onData: (entries: JournalEntry[]) => void,
  onError?: (err: any) => void
) {
  console.log('[subscribeToSharedCoachEntries] Creating collectionGroup query on "interactions" with where("sharedWithCoach", "==", true)...');
  const interactionsGroup = collectionGroup(db, 'interactions');
  const q = query(
    interactionsGroup,
    where('sharedWithCoach', '==', true)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      console.log(`[subscribeToSharedCoachEntries] Snapshot received with ${snapshot.size} shared documents.`);
      const entries: JournalEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as JournalEntry;
        // Ensure userId is preserved from path if not explicitly present in doc
        const pathSegments = docSnap.ref.path.split('/');
        const docUserId = data.userId || (pathSegments.length >= 2 ? pathSegments[1] : 'anonymous');
        entries.push({
          ...data,
          id: docSnap.id,
          userId: docUserId,
        });
      });
      // Sort in-memory by updatedAt descending
      entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      onData(entries);
    },
    (error) => {
      console.error('[subscribeToSharedCoachEntries] Snapshot error encountered:', {
        code: error.code,
        message: error.message,
        name: error.name,
      }, error);
      if (onError) onError(error);
    }
  );
}

/**
 * Admin Role & RBAC Directive: Log admin access to a shared entry
 * Inserts an immutable audit record into /admin_audit_logs
 */
export async function logAdminEntryView(log: AdminAuditLog): Promise<void> {
  if (!log.adminUid || !log.entryId || !log.viewedUserId) {
    return;
  }
  try {
    const auditLogsRef = collection(db, 'admin_audit_logs');
    const sanitized = sanitizePayload({
      ...log,
      timestamp: log.timestamp || Date.now(),
    });
    await addDoc(auditLogsRef, sanitized);
  } catch (error) {
    console.error('Failed to log admin entry view in admin_audit_logs:', error);
  }
}
