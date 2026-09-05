import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  saveJournalEntry,
  deleteJournalEntry,
  subscribeToUserEntries,
  getUserNotificationSettings,
  subscribeToUserNotificationSettings,
  triggerSlackNotification,
} from '../lib/firebase';
import { requestGeminiReflection, requestGeminiSummary } from '../lib/geminiApi';
import { EntryHistorySidebar } from './EntryHistorySidebar';
import { JournalEditor } from './JournalEditor';
import { AlertCircle, CheckCircle2, X, Bell } from 'lucide-react';
import type { UserProfile, JournalEntry, ChatMessage, SaveStatus, JournalMode, NotificationSettings } from '../types';

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
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [slackNotice, setSlackNotice] = useState<string | null>(null);

  // Rate limiting ref: tracks the last notified mode for each entry in this active session
  const notifiedModeByEntryRef = useRef<Map<string, string>>(new Map());
  // Tracks whether an intentional mode switch has occurred that is pending its first message notification
  const pendingModeTransitionByEntryRef = useRef<Map<string, boolean>>(new Map());
  // Active entry ref to avoid stale closures in event handlers and async callbacks
  const activeEntryRef = useRef<JournalEntry | null>(null);
  useEffect(() => {
    activeEntryRef.current = activeEntry;
  }, [activeEntry]);

  // Helper to create a new blank entry
  const createNewEntry = useCallback(
    (mode: JournalMode = 'reflection'): JournalEntry => {
      const newEntry: JournalEntry = {
        id: `entry_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId: user.uid,
        title: `Reflection • ${new Date().toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        })}`,
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
      console.log('[Dashboard] Synced notificationSettings from Firestore in real-time:', settings);
      setNotificationSettings(settings);
    });

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationSettings>;
      if (customEvent.detail) {
        console.log('[Dashboard] Instant sync from local event:', customEvent.detail);
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
        console.log(`[Dashboard] persistEntry: isModeTransition is true. Clearing session notification lock for entryId="${entryToSave.id}".`);
        notifiedModeByEntryRef.current.delete(entryToSave.id);
      }

      const alreadyNotified = notifiedModeByEntryRef.current.get(entryToSave.id) === entryToSave.mode;
      const hasContent =
        entryToSave.messages.length > 0 ||
        (Boolean(entryToSave.title) && !entryToSave.title.startsWith('Reflection •'));

      console.group(`[Slack Notification Debug] Entry Save Check (ID: ${entryToSave.id})`);
      console.log('1. entry.mode:', entryToSave.mode);
      console.log('2. user saved triggerModes:', triggerModes);
      console.log('3. notificationSettings.slackEnabled:', isEnabled);
      console.log('4. triggerModes.includes(entry.mode):', modeMatches);
      console.log('5. alreadyNotifiedInSession:', alreadyNotified, `(lastNotifiedMode: "${notifiedModeByEntryRef.current.get(entryToSave.id) || 'none'}")`);
      console.log('6. hasContent (messages > 0 or custom title):', hasContent, {
        messagesCount: entryToSave.messages.length,
        title: entryToSave.title,
      });
      if (options?.skipNotification) {
        console.log('7. skipNotification option: true (pure mode selector switch)');
      }
      if (options?.isModeTransition) {
        console.log('8. isModeTransition option: true');
      }

      const shouldFire = !options?.skipNotification && isEnabled && modeMatches && !alreadyNotified && hasContent;
      console.log('-> Decision: shouldFire =', shouldFire);

      if (!shouldFire) {
        if (options?.skipNotification) {
          console.log('-> Skip reason: Notification deferred until reflection content is submitted in this new mode');
        } else if (!isEnabled) {
          console.log('-> Skip reason: Slack notifications are disabled in user settings (slackEnabled=false)');
        } else if (!modeMatches) {
          console.log(`-> Skip reason: Mode "${entryToSave.mode}" is not in selected triggerModes [${triggerModes.join(', ')}]`);
        } else if (alreadyNotified) {
          console.log(`-> Skip reason: This entry was already notified for mode "${entryToSave.mode}" in this active browser session (rate-limit protection)`);
        } else if (!hasContent) {
          console.log('-> Skip reason: Entry is an empty draft (0 messages and default title)');
        }
        console.groupEnd();
      } else {
        console.groupEnd();
        // Enforce rate limit: record notification for this mode so repetitive edits in this mode do not re-trigger
        notifiedModeByEntryRef.current.set(entryToSave.id, entryToSave.mode);

        const excerptCandidate =
          entryToSave.summary ||
          entryToSave.messages[entryToSave.messages.length - 1]?.content ||
          entryToSave.messages[0]?.content ||
          'New reflection entry saved.';

        console.log(`[Slack Notification] Dispatched fetch to /api/notifications/slack for entryId="${entryToSave.id}", mode="${entryToSave.mode}", modeTransition=${Boolean(options?.isModeTransition)}`);

        triggerSlackNotification({
          entryId: entryToSave.id,
          entryTitle: entryToSave.title || 'Untitled Reflection',
          mode: entryToSave.mode,
          excerpt: excerptCandidate.slice(0, 200).trim(),
          userId: user.uid,
          modeTransition: Boolean(options?.isModeTransition),
        })
          .then((res) => {
            console.log('[Slack Notification] Backend response:', res);
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
    console.log(`[Dashboard] handleUpdateEntry mode check:`, {
      activeEntryMode: prevMode,
      updatedMode: updated.mode,
      isModeChange,
      entryId: updated.id,
    });

    if (isModeChange) {
      console.log(`[Dashboard] Entry mode changed: prevMode="${prevMode}" -> updated.mode="${updated.mode}". Resetting session notification lock for entry.`);
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

    // Call Gemini API
    setIsGeneratingAI(true);
    setErrorMessage(null);

    try {
      const messagesForGemini = updatedWithUserMsg.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const aiResponse = await requestGeminiReflection(messagesForGemini, updatedWithUserMsg.mode);

      const aiMessage: ChatMessage = {
        id: `msg_${Date.now()}_m`,
        role: 'model',
        content: aiResponse.text,
        timestamp: Date.now(),
        modelUsed: aiResponse.modelUsed || 'gemini-3.6-flash',
      };

      const finalUpdatedEntry: JournalEntry = {
        ...updatedWithUserMsg,
        messages: [...updatedWithUserMsg.messages, aiMessage],
        updatedAt: Date.now(),
      };

      activeEntryRef.current = finalUpdatedEntry;
      setActiveEntry(finalUpdatedEntry);
      await persistEntry(finalUpdatedEntry);
    } catch (err: any) {
      console.error('Error generating AI response:', err);
      setErrorMessage(
        `Gemini reflection error: ${err?.message || 'Could not communicate with AI model. Please retry.'}`
      );
    } finally {
      setIsGeneratingAI(false);
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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-stone-100">
      {/* Toast Error Alert Banner */}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 shadow-lg text-xs text-red-900 animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Notice</p>
            <p className="mt-0.5 text-red-700 leading-relaxed">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="rounded p-1 text-red-500 hover:bg-red-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Slack Notification Dispatched Banner */}
      {slackNotice && (
        <div className="fixed bottom-4 left-4 z-50 flex max-w-md items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-lg text-xs text-stone-900 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-stone-900 text-white shrink-0">
            <Bell className="h-3.5 w-3.5" />
          </div>
          <span className="font-medium flex-1">{slackNotice}</span>
          <button
            onClick={() => setSlackNotice(null)}
            className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden md:block h-full">
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
          <div
            className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-50 w-80 max-w-[85vw] bg-white shadow-xl">
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
      <main className="flex flex-1 flex-col h-full overflow-hidden">
        <JournalEditor
          entry={effectiveEntry}
          onUpdateEntry={handleUpdateEntry}
          onSendMessage={handleSendMessage}
          onGenerateSummary={handleGenerateSummary}
          isGeneratingAI={isGeneratingAI}
          isGeneratingSummary={isGeneratingSummary}
          saveStatus={saveStatus}
          onRetrySave={handleRetrySave}
          onToggleSidebarMobile={() => setMobileSidebarOpen(true)}
        />
      </main>
    </div>
  );
};
