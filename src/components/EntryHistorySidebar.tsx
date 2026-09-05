import React, { useState } from 'react';
import {
  Search,
  Plus,
  Pin,
  Trash2,
  Calendar,
  Sparkles,
  MessageSquare,
  Lightbulb,
  Heart,
  ChevronRight,
  Filter,
  MapPin,
  Share2,
} from 'lucide-react';
import type { JournalEntry, JournalMode } from '../types';
import { LocationPreview } from './LocationPreview';

interface EntryHistorySidebarProps {
  entries: JournalEntry[];
  activeEntryId: string | null;
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onTogglePin: (entry: JournalEntry) => void;
  isLoading: boolean;
}

export const EntryHistorySidebar: React.FC<EntryHistorySidebarProps> = ({
  entries,
  activeEntryId,
  onSelectEntry,
  onNewEntry,
  onDeleteEntry,
  onTogglePin,
  isLoading,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModeFilter, setSelectedModeFilter] = useState<string>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const getModeIcon = (mode: JournalMode) => {
    switch (mode) {
      case 'brainstorm':
        return <Lightbulb className="h-3.5 w-3.5 text-amber-600" />;
      case 'deep_thinking':
        return <Sparkles className="h-3.5 w-3.5 text-indigo-600" />;
      case 'gratitude':
        return <Heart className="h-3.5 w-3.5 text-rose-500" />;
      case 'reflection':
      default:
        return <MessageSquare className="h-3.5 w-3.5 text-stone-600" />;
    }
  };

  const filteredEntries = entries.filter((entry) => {
    const matchesQuery =
      searchQuery.trim() === '' ||
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (entry.summary && entry.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (entry.location && entry.location.placeName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesMode = selectedModeFilter === 'all' || entry.mode === selectedModeFilter;

    return matchesQuery && matchesMode;
  });

  // Sort pinned entries first, then by updatedAt desc
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-stone-200 bg-white md:w-80 lg:w-96 shrink-0">
      {/* Sidebar Header */}
      <div className="border-b border-stone-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-stone-900">Journal History</h2>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
              {entries.length}
            </span>
          </div>
          <button
            id="sidebar-new-entry-btn"
            onClick={onNewEntry}
            className="flex items-center gap-1.5 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-2xs hover:bg-stone-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Entry</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
          <input
            id="entry-search-input"
            type="text"
            placeholder="Search entries or reflections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-stone-50/70 pl-8 pr-3 py-1.5 text-xs text-stone-900 placeholder:text-stone-400 focus:bg-white focus:border-stone-400 focus:outline-hidden"
          />
        </div>

        {/* Mode Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            onClick={() => setSelectedModeFilter('all')}
            className={`whitespace-nowrap rounded-md px-2 py-1 font-medium transition-colors ${
              selectedModeFilter === 'all'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSelectedModeFilter('reflection')}
            className={`whitespace-nowrap rounded-md px-2 py-1 font-medium transition-colors ${
              selectedModeFilter === 'reflection'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Reflection
          </button>
          <button
            onClick={() => setSelectedModeFilter('brainstorm')}
            className={`whitespace-nowrap rounded-md px-2 py-1 font-medium transition-colors ${
              selectedModeFilter === 'brainstorm'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Brainstorm
          </button>
          <button
            onClick={() => setSelectedModeFilter('deep_thinking')}
            className={`whitespace-nowrap rounded-md px-2 py-1 font-medium transition-colors ${
              selectedModeFilter === 'deep_thinking'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Deep
          </button>
          <button
            onClick={() => setSelectedModeFilter('gratitude')}
            className={`whitespace-nowrap rounded-md px-2 py-1 font-medium transition-colors ${
              selectedModeFilter === 'gratitude'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            Gratitude
          </button>
        </div>
      </div>

      {/* Entry List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-stone-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-400 border-t-transparent mb-2" />
            <p className="text-xs">Loading journal entries...</p>
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-stone-400">
            <Calendar className="h-8 w-8 text-stone-300 mb-2" />
            <p className="text-xs font-medium text-stone-600">
              {searchQuery ? 'No matching entries found' : 'No journal entries yet'}
            </p>
            <p className="text-[11px] text-stone-400 mt-1">
              {searchQuery ? 'Try a different search keyword' : 'Create your first reflection!'}
            </p>
            {!searchQuery && (
              <button
                onClick={onNewEntry}
                className="mt-3 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-200 transition-colors"
              >
                Start Journaling
              </button>
            )}
          </div>
        ) : (
          sortedEntries.map((entry) => {
            const isActive = entry.id === activeEntryId;
            const messageCount = entry.messages ? entry.messages.length : 0;
            const lastMessage = entry.messages && entry.messages.length > 0
              ? entry.messages[entry.messages.length - 1].content
              : '';

            return (
              <div
                key={entry.id}
                id={`entry-item-${entry.id}`}
                onClick={() => onSelectEntry(entry)}
                className={`group relative rounded-xl p-3 text-left transition-all cursor-pointer border ${
                  isActive
                    ? 'border-stone-900/40 bg-stone-100/90 shadow-2xs'
                    : 'border-transparent hover:border-stone-200 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0">{getModeIcon(entry.mode)}</span>
                    <h3 className="truncate text-xs font-semibold text-stone-900 leading-tight">
                      {entry.title || 'Untitled Entry'}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {entry.isPinned && (
                      <Pin className="h-3 w-3 fill-amber-500 text-amber-500" />
                    )}

                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <button
                        title={entry.isPinned ? 'Unpin Entry' : 'Pin Entry'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(entry);
                        }}
                        className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                      >
                        <Pin className="h-3 w-3" />
                      </button>

                      {confirmDeleteId === entry.id ? (
                        <div
                          className="flex items-center gap-1 bg-red-50 border border-red-200 rounded px-1 py-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-red-700 font-medium">Delete?</span>
                          <button
                            onClick={() => {
                              onDeleteEntry(entry.id);
                              setConfirmDeleteId(null);
                            }}
                            className="text-[10px] font-bold text-red-700 hover:underline"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[10px] text-stone-500 hover:underline"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          title="Delete Entry"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(entry.id);
                          }}
                          className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {lastMessage && (
                  <p className="mt-1.5 line-clamp-2 text-[11px] text-stone-500 leading-relaxed">
                    {lastMessage}
                  </p>
                )}

                {/* Location Map Preview for tagged entries */}
                {entry.location && (
                  <LocationPreview location={entry.location} variant="compact" />
                )}

                <div className="mt-2 flex items-center justify-between text-[10px] text-stone-400">
                  <span>{formatDate(entry.updatedAt)}</span>
                  <div className="flex items-center gap-1.5">
                    {entry.sharedWithCoach && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700 border border-indigo-200"
                        title="Shared with Coach"
                      >
                        <Share2 className="h-2.5 w-2.5" />
                        Coach
                      </span>
                    )}
                    {entry.summary && (
                      <span className="rounded bg-amber-50 px-1 py-0.2 text-[9px] font-medium text-amber-700 border border-amber-200">
                        AI Summary
                      </span>
                    )}
                    <span>{messageCount} {messageCount === 1 ? 'msg' : 'msgs'}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
