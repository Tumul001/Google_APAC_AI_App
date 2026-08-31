import React, { useState, useEffect, useCallback } from 'react';
import {
  saveJournalEntry,
  deleteJournalEntry,
  subscribeToUserEntries,
} from '../lib/firebase';
import { requestGeminiReflection, requestGeminiSummary } from '../lib/geminiApi';
import { EntryHistorySidebar } from './EntryHistorySidebar';
import { JournalEditor } from './JournalEditor';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { UserProfile, JournalEntry, ChatMessage, SaveStatus, JournalMode } from '../types';

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

  // Persist entry helper with error escalation
  const persistEntry = async (entryToSave: JournalEntry) => {
    try {
      setSaveStatus('saving');
      await saveJournalEntry(user.uid, entryToSave);
      setSaveStatus('saved');
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
    setActiveEntry(entry);
    setMobileSidebarOpen(false);
  };

  const handleNewEntry = () => {
    const fresh = createNewEntry();
    setActiveEntry(fresh);
    setMobileSidebarOpen(false);
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteJournalEntry(user.uid, entryId);
      if (activeEntry?.id === entryId) {
        const remaining = entries.filter((e) => e.id !== entryId);
        setActiveEntry(remaining.length > 0 ? remaining[0] : null);
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
    setActiveEntry(updated);
    await persistEntry(updated);
  };

  const handleUpdateEntry = async (updated: JournalEntry) => {
    setActiveEntry(updated);
    await persistEntry(updated);
  };

  const handleSendMessage = async (text: string) => {
    let currentEntry = activeEntry;
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

    // Update UI and save user message immediately
    setActiveEntry(updatedWithUserMsg);
    await persistEntry(updatedWithUserMsg);

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
    if (!activeEntry || activeEntry.messages.length === 0) return;

    setIsGeneratingSummary(true);
    setErrorMessage(null);

    try {
      const fullConversation = activeEntry.messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Gemini'}: ${m.content}`)
        .join('\n\n');

      const response = await requestGeminiSummary(fullConversation, activeEntry.title);

      const updatedEntry: JournalEntry = {
        ...activeEntry,
        summary: response.summary,
        updatedAt: Date.now(),
      };

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
            className="rounded p-1 text-red-500 hover:bg-red-100"
          >
            <X className="h-4 w-4" />
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
