import React, { useMemo, useState } from 'react';
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
  MapPin,
  Share2,
} from 'lucide-react';
import type { JournalEntry, JournalMode } from '../types';
import { LocationPreview } from './LocationPreview';
import { btnPrimary, btnIconSm, chip, field } from '../lib/ui';
import { formatListDate } from '../lib/datetime';

interface EntryHistorySidebarProps {
  entries: JournalEntry[];
  activeEntryId: string | null;
  onSelectEntry: (entry: JournalEntry) => void;
  onNewEntry: () => void;
  onDeleteEntry: (entryId: string) => void;
  onTogglePin: (entry: JournalEntry) => void;
  isLoading: boolean;
}

const MODE_ICON: Record<JournalMode, React.ComponentType<{ className?: string }>> = {
  reflection: MessageSquare,
  brainstorm: Lightbulb,
  deep_thinking: Sparkles,
  gratitude: Heart,
};

const MODE_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'brainstorm', label: 'Brainstorm' },
  { id: 'deep_thinking', label: 'Deep' },
  { id: 'gratitude', label: 'Gratitude' },
];

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

  // Every entry's full message list is scanned on search, so this is the one
  // derivation in the app that grows with content. Recompute only when an input
  // actually changes, not on every parent render.
  const sortedEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      const matchesQuery =
        q === '' ||
        entry.title.toLowerCase().includes(q) ||
        entry.messages.some((m) => m.content.toLowerCase().includes(q)) ||
        (entry.summary && entry.summary.toLowerCase().includes(q)) ||
        (entry.location && entry.location.placeName.toLowerCase().includes(q));

      const matchesMode = selectedModeFilter === 'all' || entry.mode === selectedModeFilter;
      return matchesQuery && matchesMode;
    });

    // Pinned first, then most recently updated.
    return filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [entries, searchQuery, selectedModeFilter]);

  return (
    <aside id="journal-history" className="flex h-full w-full shrink-0 flex-col border-r border-line bg-surface md:w-80 lg:w-96">
      <div className="space-y-3 border-b border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-ui font-semibold text-ink">Journal history</h2>
            <span className={chip}>{entries.length}</span>
          </div>
          <button id="sidebar-new-entry-btn" type="button" onClick={onNewEntry} className={btnPrimary}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New entry</span>
          </button>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            id="entry-search-input"
            type="search"
            name="entry-search"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search journal entries"
            placeholder="Search entries, e.g. “review”…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${field} pl-9`}
          />
        </div>

        <div
          role="group"
          aria-label="Filter by mode"
          className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          {MODE_FILTERS.map((filter) => {
            const isActive = selectedModeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedModeFilter(filter.id)}
                className={`shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-meta font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
                  isActive
                    ? 'bg-inverse text-on-inverse'
                    : 'bg-subtle text-ink-soft hover:bg-muted-surface hover:text-ink'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] p-2">
        {isLoading && entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-ink-muted">
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-ink-faint border-t-transparent motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="text-meta">Loading entries…</p>
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Calendar className="mb-2 h-8 w-8 text-ink-ghost" aria-hidden="true" />
            <p className="text-ui font-medium text-ink-secondary">
              {searchQuery ? 'No entries match that search' : 'No entries yet'}
            </p>
            <p className="mt-1 text-meta text-ink-muted">
              {searchQuery ? 'Try a different word or clear the search.' : 'Nothing written yet.'}
            </p>
            {!searchQuery && (
              <button type="button" onClick={onNewEntry} className={`${btnPrimary} mt-3`}>
                Start journaling
              </button>
            )}
          </div>
        ) : (
          sortedEntries.map((entry) => {
            const isActive = entry.id === activeEntryId;
            const ModeIcon = MODE_ICON[entry.mode] ?? MessageSquare;
            const messageCount = entry.messages ? entry.messages.length : 0;
            const lastMessage =
              entry.messages && entry.messages.length > 0
                ? entry.messages[entry.messages.length - 1].content
                : '';

            return (
              <div
                key={entry.id}
                id={`entry-item-${entry.id}`}
                className={`group relative rounded-xl border p-3 text-left transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink motion-reduce:transition-none ${
                  isActive
                    ? 'border-line-strong bg-subtle'
                    : 'border-transparent hover:border-line hover:bg-canvas'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ModeIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                    <h3 className="min-w-0 truncate text-ui font-semibold leading-tight text-ink">
                      {/* Stretched hit area: the whole card activates this one button. */}
                      <button
                        type="button"
                        onClick={() => onSelectEntry(entry)}
                        aria-current={isActive ? 'true' : undefined}
                        className="block max-w-full cursor-pointer truncate text-left after:absolute after:inset-0 after:rounded-xl after:content-[''] focus:outline-none"
                      >
                        {entry.title || 'Untitled entry'}
                      </button>
                    </h3>
                  </div>

                  <div className="relative z-10 flex shrink-0 items-center gap-1">
                    {entry.isPinned && (
                      <Pin className="h-3 w-3 fill-ink-muted text-ink-muted" aria-label="Pinned" />
                    )}

                    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 motion-reduce:transition-none">
                      <button
                        type="button"
                        aria-label={entry.isPinned ? 'Unpin entry' : 'Pin entry'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(entry);
                        }}
                        className={btnIconSm}
                      >
                        <Pin className="h-3 w-3" aria-hidden="true" />
                      </button>

                      {confirmDeleteId === entry.id ? (
                        <span
                          className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-meta font-medium text-red-700">Delete?</span>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteEntry(entry.id);
                              setConfirmDeleteId(null);
                            }}
                            className="cursor-pointer text-meta font-bold text-red-700 underline underline-offset-2 hover:text-red-900"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="cursor-pointer text-meta text-ink-soft underline underline-offset-2 hover:text-ink"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label="Delete entry"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(entry.id);
                          }}
                          className={`${btnIconSm} hover:bg-red-50 hover:text-red-600`}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {lastMessage && (
                  <p className="mt-1.5 line-clamp-2 text-ui text-ink-muted">{lastMessage}</p>
                )}

                {entry.location && <LocationPreview location={entry.location} variant="compact" />}

                <div className="mt-2 flex items-center justify-between gap-2 text-meta text-ink-muted">
                  <span className="truncate">{formatListDate(entry.updatedAt)}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {entry.sharedWithCoach && (
                      <span className={chip} title="Shared with coach">
                        <Share2 className="h-2.5 w-2.5" aria-hidden="true" />
                        Coach
                      </span>
                    )}
                    {entry.summary && (
                      <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-meta font-medium text-amber-700">
                        Summary
                      </span>
                    )}
                    <span className="tabular-nums">
                      {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
                    </span>
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
