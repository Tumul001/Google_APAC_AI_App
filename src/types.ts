export type JournalMode = 'reflection' | 'brainstorm' | 'deep_thinking' | 'gratitude';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  modelUsed?: string;
}

export type SentimentLabel = 'negative' | 'neutral' | 'positive';

/**
 * A sentiment score for one entry. Written only when the owner has opted into
 * mood tracking, and readable only by them under the existing owner-scoped rule.
 */
export interface EntrySentiment {
  /** -1.0 (most negative) .. 1.0 (most positive). */
  score: number;
  label: SentimentLabel;
  scoredAt: number;
}

export interface EntryLocation {
  lat: number;
  lng: number;
  placeName: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  mode: JournalMode;
  messages: ChatMessage[];
  tags: string[];
  summary?: string;
  mood?: string;
  isPinned?: boolean;
  location?: EntryLocation;
  sentiment?: EntrySentiment;
  sharedWithCoach?: boolean;
  shareFullIdentity?: boolean;
  authorInitial?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationSettings {
  slackEnabled: boolean;
  slackTriggerModes: JournalMode[];
  /** Weekly digest, off unless the user turns it on and supplies their own webhook. */
  weeklyDigestEnabled: boolean;
  /**
   * Mood tracking. Off by default: this is the only path that sends journal
   * content to Gemini without the user composing a message, so it is opt-in.
   */
  moodTrackingEnabled: boolean;
  /**
   * The user's own Slack incoming webhook. A digest summarises a week of private
   * journalling, so it is never sent to the shared team channel that
   * SLACK_WEBHOOK_URL points at — it goes only where this user chose.
   * Treat as a bearer secret: never render it back in full, never log it.
   */
  digestWebhookUrl?: string;
  updatedAt?: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin?: boolean;
  notificationSettings?: NotificationSettings;
}

export interface AdminAuditLog {
  id?: string;
  adminUid: string;
  viewedUserId: string;
  entryId: string;
  entryTitle?: string;
  timestamp: number;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
