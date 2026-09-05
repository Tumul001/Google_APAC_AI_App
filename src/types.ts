export type JournalMode = 'reflection' | 'brainstorm' | 'deep_thinking' | 'gratitude';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  modelUsed?: string;
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
  sharedWithCoach?: boolean;
  shareFullIdentity?: boolean;
  authorInitial?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin?: boolean;
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
