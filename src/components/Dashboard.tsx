import React, { useState, useEffect, useCallback, useRef } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  saveJournalEntry,
  deleteJournalEntry,
  subscribeToUserEntries,
  getUserNotificationSettings,
  subscribeToUserNotificationSettings,
  triggerSlackNotification,
} from '../lib/firestore';
import { requestGeminiReflection, requestGeminiSummary, streamGeminiReflection } from '../lib/geminiApi';
import { EntryHistorySidebar } from './EntryHistorySidebar';
import { JournalEditor } from './JournalEditor';
import { AlertCircle, CheckCircle2, X, Bell } from 'lucide-react';
import type { UserProfile, JournalEntry, ChatMessage, SaveStatus, JournalMode, NotificationSettings } from '../types';
import { btnIconSm } from '../lib/ui';
import { debug } from '../lib/debug';
import { formatFullDate } from '../lib/datetime';

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

interface DashboardProps {
  user: UserProfile;
}

export const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Remembered per browser: a writer who hides the list usually wants it to
  // stay hidden next time.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem('journal:sidebar') !== 'closed';
    } catch {
      return true;
    }
  });

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((open) => {
      try {
        localStorage.setItem('journal:sidebar', open ? 'closed' : 'open');
      } catch {
        /* private mode: the preference simply does not persist */
      }
      return !open;
    });
  }, []);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [slackNotice, setSlackNotice] = useState<string | null>(null);

  // Rate limiting ref: tracks the last notified mode for each entry in this active session
  const notifiedModeByEntryRef = useRef<Map<string, string>>(new Map());
  // Tracks whether an intentional mode switch has occurred that is pending its first message notification
  const pendingModeTransitionByEntryRef = useRef<Map<string, boolean>>(new Map());
  // Active entry ref to avoid stale closures in event handlers and async callbacks
  const activeEntryRef = useRef<JournalEntry | null>(null);
  // Abort controller for cancelling ongoing Gemini generation requests
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    activeEntryRef.current = activeEntry;
  }, [activeEntry]);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      debug('[Dashboard] Cancelling ongoing AI generation request via AbortController');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGeneratingAI(false);
  }, []);

  // Helper to create a new blank entry
  const createNewEntry = useCallback(
    (mode: JournalMode = 'reflection'): JournalEntry => {
      const newEntry: JournalEntry = {
        id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId: user.uid,
        title: `Reflection • ${formatFullDate(Date.now())}`,
        mode,
        messages: [],
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return newEntry;
    },
    [user.uid]
  );

  // Subscribe to real-time entries from Firestore
  useEffect(() => {
    setIsLoadingEntries(true);
    const unsubscribe = subscribeToUserEntries(
      user.uid,
      (fetchedEntries) => {
        setEntries(fetchedEntries);
        setIsLoadingEntries(false);

        // If no active entry is selected or active entry was deleted, pick the first or create a new one
        setActiveEntry((current) => {
          if (!current && fetchedEntries.length > 0) {
            return fetchedEntries[0];
          }
          if (current) {
            const updatedMatch = fetchedEntries.find((e) => e.id === current.id);
            if (updatedMatch) {
              return updatedMatch;
            }
          }
          return current || (fetchedEntries.length > 0 ? fetchedEntries[0] : null);
        });
      },
      (error) => {
        console.error('Failed to load user entries from Firestore:', error);
        setIsLoadingEntries(false);
        setErrorMessage('Failed to load journal entries from Firestore.');
      }
    );

    return () => unsubscribe();
  }, [user.uid]);

  // Real-time synchronization of notification preferences from Firestore /users/{userId}
  useEffect(() => {
    if (!user.uid) return;
    const unsubscribe = subscribeToUserNotificationSettings(user.uid, (settings) => {
      debug('[Dashboard] notificationSettings synced', settings);
      setNotificationSettings(settings);
    });

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationSettings>;
      if (customEvent.detail) {
        debug('[Dashboard] notificationSettings synced (local event)', customEvent.detail);
        setNotificationSettings(customEvent.detail);
      }
    };
    window.addEventListener('notification-settings-updated', handleCustomEvent);

    return () => {
      unsubscribe();
      window.removeEventListener('notification-settings-updated', handleCustomEvent);
    };
  }, [user.uid]);

  // Persist entry helper with error escalation
  const persistEntry = async (
    entryToSave: JournalEntry,
    options?: { skipNotification?: boolean; isModeTransition?: boolean }
  ) => {
    try {
      setSaveStatus('saving');
      await saveJournalEntry(user.uid, entryToSave);
      setSaveStatus('saved');

      // Notification API Directive: Trigger Slack Notification server-side AFTER confirmed Firestore write
      const isEnabled = Boolean(notificationSettings?.slackEnabled);
      const triggerModes = notificationSettings?.slackTriggerModes || [];
      const modeMatches = triggerModes.includes(entryToSave.mode);

      // If an intentional mode transition was flagged, clear any existing session notification lock for this entry
      if (options?.isModeTransition) {
        notifiedModeByEntryRef.current.delete(entryToSave.id);
      }

      const alreadyNotified = notifiedModeByEntryRef.current.get(entryToSave.id) === entryToSave.mode;
      const hasContent =
        entryToSave.messages.length > 0 ||
        (Boolean(entryToSave.title) && !entryToSave.title.startsWith('Reflection •'));

      const shouldFire =
        !options?.skipNotification && isEnabled && modeMatches && !alreadyNotified && hasContent;

      debug('[Slack] save check', {
        entryId: entryToSave.id,
        mode: entryToSave.mode,
        triggerModes,
        slackEnabled: isEnabled,
        modeMatches,
        alreadyNotified,
        hasContent,
        skipNotification: Boolean(options?.skipNotification),
        isModeTransition: Boolean(options?.isModeTransition),
        shouldFire,
      });

      if (shouldFire) {
        // Enforce rate limit: record notification for this mode so repetitive edits in this mode do not re-trigger
        notifiedModeByEntryRef.current.set(entryToSave.id, entryToSave.mode);

        const excerptCandidate =
          entryToSave.summary ||
          entryToSave.messages[entryToSave.messages.length - 1]?.content ||
          entryToSave.messages[0]?.content ||
          'New reflection entry saved.';

        triggerSlackNotification({
          entryId: entryToSave.id,
          entryTitle: entryToSave.title || 'Untitled Reflection',
          mode: entryToSave.mode,
          excerpt: excerptCandidate.slice(0, 200).trim(),
          userId: user.uid,
          modeTransition: Boolean(options?.isModeTransition),
        })
          .then((res) => {
            if (res.success && !res.skipped) {
              const modeLabel = entryToSave.mode.replace('_', ' ');
              setSlackNotice(`Slack notification dispatched for ${modeLabel} entry!`);
              setTimeout(() => setSlackNotice(null), 4000);
            }
          })
          .catch((err) => {
            console.warn('[Slack Notification] Dispatch failed:', err);
          });
      }

      setTimeout(() => {
        setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
      }, 3000);
    } catch (err: any) {
      console.error('Error persisting entry to Firestore:', err);
      setSaveStatus('error');
      setErrorMessage(`Failed to save journal to Firestore: ${err?.message || 'Permission or network issue'}`);
    }
  };

  const handleSelectEntry = (entry: JournalEntry) => {
    activeEntryRef.current = entry;
    setActiveEntry(entry);
    setMobileSidebarOpen(false);
  };

  const handleNewEntry = () => {
    const fresh = createNewEntry();
    activeEntryRef.current = fresh;
    setActiveEntry(fresh);
    setMobileSidebarOpen(false);
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteJournalEntry(user.uid, entryId);
      if (activeEntry?.id === entryId) {
        const remaining = entries.filter((e) => e.id !== entryId);
        const nextActive = remaining.length > 0 ? remaining[0] : null;
        activeEntryRef.current = nextActive;
        setActiveEntry(nextActive);
      }
    } catch (err: any) {
      console.error('Failed to delete entry:', err);
      setErrorMessage('Could not delete journal entry.');
    }
  };

  const handleTogglePin = async (entry: JournalEntry) => {
    const updated: JournalEntry = {
      ...entry,
      isPinned: !entry.isPinned,
      updatedAt: Date.now(),
    };
    activeEntryRef.current = updated;
    setActiveEntry(updated);
    await persistEntry(updated);
  };

  const handleUpdateEntry = async (updated: JournalEntry) => {
    const prevMode = activeEntryRef.current?.mode || activeEntry?.mode;
    const isModeChange = Boolean(prevMode && prevMode !== updated.mode);
    debug('[Dashboard] mode check', {
      activeEntryMode: prevMode,
      updatedMode: updated.mode,
      isModeChange,
      entryId: updated.id,
    });

    if (isModeChange) {
      debug('[Dashboard] mode changed, clearing notification lock', { prevMode, next: updated.mode });
      notifiedModeByEntryRef.current.delete(updated.id);
      pendingModeTransitionByEntryRef.current.set(updated.id, true);
    }
    activeEntryRef.current = updated;
    setActiveEntry(updated);
    // When changing mode purely via mode pill selector, save the mode to Firestore without firing premature Slack alert.
    // The Slack notification will fire when the user sends their reflection message in this mode!
    await persistEntry(updated, { skipNotification: isModeChange, isModeTransition: isModeChange });
  };

  const handleSendMessage = async (text: string) => {
    let currentEntry = activeEntryRef.current || activeEntry;
    if (!currentEntry) {
      currentEntry = createNewEntry();
    }

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    // Auto-update title if it's the first message and still default
    let newTitle = currentEntry.title;
    if (currentEntry.messages.length === 0) {
      const preview = text.slice(0, 32).trim();
      newTitle = preview.length > 0 ? `${preview}${text.length > 32 ? '...' : ''}` : currentEntry.title;
    }

    const updatedWithUserMsg: JournalEntry = {
      ...currentEntry,
      title: newTitle,
      messages: [...currentEntry.messages, userMessage],
      updatedAt: Date.now(),
    };

    // Check if this message follows an intentional mode transition
    const hadPendingTransition = Boolean(pendingModeTransitionByEntryRef.current.get(currentEntry.id));
    if (hadPendingTransition) {
      pendingModeTransitionByEntryRef.current.delete(currentEntry.id);
    }

    // Update UI and save user message immediately with modeTransition enabled if transition occurred
    activeEntryRef.current = updatedWithUserMsg;
    setActiveEntry(updatedWithUserMsg);
    await persistEntry(updatedWithUserMsg, { isModeTransition: hadPendingTransition });

    // Call Gemini API with streaming
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGeneratingAI(true);
    setErrorMessage(null);

    const aiMsgId = `msg_${Date.now()}_m`;
    let accumulatedText = '';
    let usedModel = 'gemini-3.6-flash';

    // Optimistically insert model message placeholder in UI
    const streamingEntry: JournalEntry = {
      ...updatedWithUserMsg,
      messages: [
        ...updatedWithUserMsg.messages,
        {
          id: aiMsgId,
          role: 'model',
          content: '',
          timestamp: Date.now(),
          modelUsed: usedModel,
        },
      ],
      updatedAt: Date.now(),
    };
    activeEntryRef.current = streamingEntry;
    setActiveEntry(streamingEntry);

    try {
      const messagesForGemini = updatedWithUserMsg.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await streamGeminiReflection(
        messagesForGemini,
        updatedWithUserMsg.mode,
        undefined,
        (chunk) => {
          accumulatedText += chunk.text;
          if (chunk.modelUsed) usedModel = chunk.modelUsed;

          setActiveEntry((prev) => {
            if (!prev || prev.id !== currentEntry.id) return prev;
            const updatedMessages = prev.messages.map((m) =>
              m.id === aiMsgId ? { ...m, content: accumulatedText, modelUsed: usedModel } : m
            );
            const nextEntry = {
              ...prev,
              messages: updatedMessages,
              updatedAt: Date.now(),
            };
            activeEntryRef.current = nextEntry;
            return nextEntry;
          });
        },
        controller.signal
      );
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        debug('[Dashboard] AI generation stopped by user.');
      } else {
        console.error('Error generating AI response:', err);
        setErrorMessage(
          `Gemini reflection error: ${err?.message || 'Could not communicate with AI model. Please retry.'}`
        );
      }
    } finally {
      setIsGeneratingAI(false);
      abortControllerRef.current = null;

      const current = activeEntryRef.current;
      if (current && current.id === currentEntry.id) {
        if (!accumulatedText.trim()) {
          // If stopped before any token arrived, prune empty model placeholder
          const cleaned = {
            ...current,
            messages: current.messages.filter((m) => m.id !== aiMsgId),
          };
          activeEntryRef.current = cleaned;
          setActiveEntry(cleaned);
          await persistEntry(cleaned);
        } else {
          // Persist the full or partial generated content cleanly
          await persistEntry(current);
        }
      }
    }
  };

  const handleGenerateSummary = async () => {
    const currentEntry = activeEntryRef.current || activeEntry;
    if (!currentEntry || currentEntry.messages.length === 0) return;

    setIsGeneratingSummary(true);
    setErrorMessage(null);

    try {
      const fullConversation = currentEntry.messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Gemini'}: ${m.content}`)
        .join('\n\n');

      const response = await requestGeminiSummary(fullConversation, currentEntry.title);

      const updatedEntry: JournalEntry = {
        ...currentEntry,
        summary: response.summary,
        updatedAt: Date.now(),
      };

      activeEntryRef.current = updatedEntry;
      setActiveEntry(updatedEntry);
      await persistEntry(updatedEntry);
    } catch (err: any) {
      console.error('Error generating summary:', err);
      setErrorMessage(`Failed to generate AI summary: ${err?.message || 'Error occurred.'}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleRetrySave = () => {
    if (activeEntry) {
      persistEntry(activeEntry);
    }
  };

  // If there are no entries and no active entry selected, present a fresh new entry canvas
  const effectiveEntry = activeEntry || createNewEntry();

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-subtle">
      {/* Toast Error Alert Banner */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-ui text-red-900 shadow-lg"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Something didn&rsquo;t go through</p>
            <p className="mt-0.5 break-words text-red-700">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss message"
            className={`${btnIconSm} text-red-500 hover:bg-red-100 hover:text-red-800`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Slack Notification Dispatched Banner */}
      {slackNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 z-50 flex max-w-md items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-ui text-ink shadow-lg"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-inverse text-surface">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 font-medium">{slackNotice}</span>
          <button
            type="button"
            onClick={() => setSlackNotice(null)}
            aria-label="Dismiss notification"
            className={btnIconSm}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Desktop sidebar. Width animates so the editor reflows with it rather
          than snapping. aria-hidden while closed keeps it out of the tab order. */}
      <div
        aria-hidden={!isSidebarOpen}
        className={`hidden h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none md:block ${
          isSidebarOpen ? 'w-80 lg:w-96' : 'w-0'
        }`}
      >
        <EntryHistorySidebar
          entries={entries}
          activeEntryId={activeEntry?.id || null}
          onSelectEntry={handleSelectEntry}
          onNewEntry={handleNewEntry}
          onDeleteEntry={handleDeleteEntry}
          onTogglePin={handleTogglePin}
          isLoading={isLoadingEntries}
        />
      </div>

      {/* Mobile Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label="Close journal history"
            className="fixed inset-0 cursor-default bg-inverse/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-50 w-80 max-w-[85vw] bg-surface shadow-xl">
            <EntryHistorySidebar
              entries={entries}
              activeEntryId={activeEntry?.id || null}
              onSelectEntry={handleSelectEntry}
              onNewEntry={handleNewEntry}
              onDeleteEntry={handleDeleteEntry}
              onTogglePin={handleTogglePin}
              isLoading={isLoadingEntries}
            />
          </div>
        </div>
      )}

      {/* Main Journal Editor Workspace */}
      <main id="main-content" className="flex flex-1 flex-col h-full overflow-hidden">
        <JournalEditor
          entry={effectiveEntry}
          onUpdateEntry={handleUpdateEntry}
          onSendMessage={handleSendMessage}
          onGenerateSummary={handleGenerateSummary}
          isGeneratingAI={isGeneratingAI}
          isGeneratingSummary={isGeneratingSummary}
          onStopGeneration={handleStopGeneration}
          saveStatus={saveStatus}
          onRetrySave={handleRetrySave}
          onToggleSidebarMobile={() => setMobileSidebarOpen(true)}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={toggleSidebar}
        />
      </main>
    </div>
    </APIProvider>
  );
};
