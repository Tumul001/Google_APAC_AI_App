/**
 * Firestore data layer + the server-backed notification calls.
 *
 * Deliberately separate from `firebase.ts`: the app shell needs Auth before it
 * can decide what to render, but nothing here is reachable until a user is
 * signed in. Keeping the two apart lets Firestore ship in the lazily loaded
 * route chunks instead of the entry bundle.
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  getFirestore,
} from 'firebase/firestore';
import { app } from './firebase';
import { debug } from './debug';
import firebaseConfig from '../../firebase-applet-config.json';
import type { JournalEntry, EntryLocation, EntrySentiment, AdminAuditLog, NotificationSettings } from '../types';

// Initialize Firestore with the specific databaseId from config if present
export const db =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

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
 * Like sanitizePayload, but DROPS undefined keys instead of writing null.
 *
 * saveJournalEntry merges the whole entry object, and a null would overwrite a
 * field the caller simply did not know about — which is how a stored sentiment
 * score gets destroyed by an unrelated title edit. Scoped to the sentiment
 * write so the shared serializer's behaviour is unchanged everywhere else.
 */
function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Writes ONLY the sentiment field. Never the entry, so it cannot clobber a
 * concurrent edit, and an absent score never becomes an explicit null.
 */
export async function saveEntrySentiment(
  userId: string,
  entryId: string,
  sentiment: EntrySentiment
): Promise<void> {
  if (!userId || !entryId) throw new Error('User ID and Entry ID are required.');
  const ref = doc(db, 'users', userId, 'interactions', entryId);
  await setDoc(ref, stripUndefined({ sentiment }), { merge: true });
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
 * Admin Role & RBAC Directive: Subscribe to all entries explicitly shared with the coach.
 * Uses collectionGroup('interactions') with where('sharedWithCoach', '==', true).
 * Strictly gated by firestore.rules (requires request.auth.token.admin == true).
 */
export function subscribeToSharedCoachEntries(
  onData: (entries: JournalEntry[]) => void,
  onError?: (err: any) => void
) {
  const interactionsGroup = collectionGroup(db, 'interactions');
  const q = query(
    interactionsGroup,
    where('sharedWithCoach', '==', true)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      debug('[Coach] shared snapshot', { count: snapshot.size });
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

/** The shape a user starts with: everything off, nothing sent anywhere. */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  slackEnabled: false,
  slackTriggerModes: ['gratitude', 'deep_thinking'],
  weeklyDigestEnabled: false,
  moodTrackingEnabled: false,
};

/**
 * Single place that turns a raw Firestore blob into settings. Every read path
 * goes through here; adding a field means editing one function, not three.
 */
function parseNotificationSettings(raw: unknown): NotificationSettings {
  const data = (raw ?? {}) as Partial<NotificationSettings>;
  return {
    slackEnabled: Boolean(data.slackEnabled),
    slackTriggerModes: Array.isArray(data.slackTriggerModes)
      ? data.slackTriggerModes
      : DEFAULT_NOTIFICATION_SETTINGS.slackTriggerModes,
    weeklyDigestEnabled: Boolean(data.weeklyDigestEnabled),
    moodTrackingEnabled: Boolean(data.moodTrackingEnabled),
    digestWebhookUrl: typeof data.digestWebhookUrl === 'string' ? data.digestWebhookUrl : undefined,
    updatedAt: data.updatedAt,
  };
}

/**
 * Retrieve user notification preferences from Firestore /users/{userId}
 */
export async function getUserNotificationSettings(userId: string): Promise<NotificationSettings> {
  if (!userId) return DEFAULT_NOTIFICATION_SETTINGS;

  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data?.notificationSettings) {
        return parseNotificationSettings(data.notificationSettings);
      }
    }
  } catch (err) {
    console.warn('Could not read notificationSettings from Firestore:', err);
  }
  return DEFAULT_NOTIFICATION_SETTINGS;
}

/**
 * Real-time subscription to user notification preferences from Firestore /users/{userId}
 */
export function subscribeToUserNotificationSettings(
  userId: string,
  onData: (settings: NotificationSettings) => void
): () => void {
  if (!userId) return () => {};

  const userDocRef = doc(db, 'users', userId);
  return onSnapshot(
    userDocRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.notificationSettings) {
          onData(parseNotificationSettings(data.notificationSettings));
          return;
        }
      }
      onData(DEFAULT_NOTIFICATION_SETTINGS);
    },
    (err) => {
      console.warn('[subscribeToUserNotificationSettings] Snapshot error:', err);
    }
  );
}

/**
 * Save user notification preferences to Firestore /users/{userId}
 */
export async function saveUserNotificationSettings(
  userId: string,
  settings: NotificationSettings
): Promise<void> {
  if (!userId) {
    throw new Error('User ID is required to save notification preferences.');
  }
  const userDocRef = doc(db, 'users', userId);
  const payload = sanitizePayload({
    notificationSettings: {
      slackEnabled: Boolean(settings.slackEnabled),
      slackTriggerModes: settings.slackTriggerModes,
      weeklyDigestEnabled: Boolean(settings.weeklyDigestEnabled),
      moodTrackingEnabled: Boolean(settings.moodTrackingEnabled),
      digestWebhookUrl: settings.digestWebhookUrl?.trim() || null,
      updatedAt: Date.now(),
    },
  });
  await setDoc(userDocRef, payload, { merge: true });
}

/**
 * Dispatches a server-side notification to Slack via Cloud Run backend route.
 * Strictly invoked only AFTER a confirmed Firestore document write.
 */
export async function triggerSlackNotification(params: {
  entryId: string;
  entryTitle: string;
  mode: string;
  excerpt: string;
  userId: string;
  modeTransition?: boolean;
}): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  try {
    const res = await fetch('/api/notifications/slack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.skipped) {
      return {
        success: false,
        error: data.error || `HTTP ${res.status}: Failed to dispatch notification.`,
      };
    }
    return {
      success: Boolean(data.success),
      skipped: Boolean(data.skipped),
      error: data.error,
    };
  } catch (err: any) {
    console.warn('[triggerSlackNotification] Network error communicating with backend:', err);
    return { success: false, error: err?.message || 'Network error dispatching notification.' };
  }
}

/**
 * Sends a test ping to Slack via Cloud Run backend route to verify Secret Manager setup.
 */
export async function testSlackWebhook(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/notifications/slack/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${res.status}: Verification failed.`,
      };
    }
    return {
      success: true,
      message: data.message || 'Test message received by Slack!',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to reach server test endpoint.',
    };
  }
}
