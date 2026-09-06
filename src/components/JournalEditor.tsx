import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Lightbulb,
  FileText,
  Copy,
  Check,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Layers,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
  Share2,
  Shield,
} from 'lucide-react';
import type { JournalEntry, JournalMode, ChatMessage, SaveStatus, EntryLocation } from '../types';
import { LocationPickerModal } from './LocationPickerModal';
import { LocationPreview } from './LocationPreview';
import { btnPrimary, btnSecondary, btnIcon, btnIconSm, field, sectionLabel } from '../lib/ui';
import { formatFullDate, formatTime } from '../lib/datetime';

const MODES: { id: JournalMode; label: string }[] = [
  { id: 'reflection', label: 'Reflection' },
  { id: 'brainstorm', label: 'Brainstorm' },
  { id: 'deep_thinking', label: 'Deep thinking' },
  { id: 'gratitude', label: 'Gratitude' },
];

interface JournalEditorProps {
  entry: JournalEntry;
  onUpdateEntry: (updated: JournalEntry) => void;
  onSendMessage: (text: string) => Promise<void>;
  onGenerateSummary: () => Promise<void>;
  isGeneratingAI: boolean;
  isGeneratingSummary: boolean;
  saveStatus: SaveStatus;
  onRetrySave: () => void;
  onToggleSidebarMobile: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

/**
 * Openers, not questionnaire items.
 *
 * The previous set ("What was the most rewarding moment of today and why?")
 * was interchangeable with any journaling app's defaults. These are written as
 * first-person sentences the person can carry on from, and each one gives the
 * model something concrete to work with — which is what this product is for.
 */
const PROMPT_SUGGESTIONS: Record<JournalMode, string[]> = {
  reflection: [
    'Something today went differently than I expected.',
    'I keep replaying one conversation from today.',
    'I said yes to something I wanted to say no to.',
    'Today was ordinary. I want to notice it anyway.',
  ],
  brainstorm: [
    'I am stuck between two options and cannot tell them apart.',
    'Here is a rough idea. Find the hole in it.',
    'I need a fifth option, because the four I have are the same one.',
    'Argue the case against what I have already decided.',
  ],
  deep_thinking: [
    'I believe something I have never actually examined.',
    'Take the other side of this and make it convincing.',
    'What am I avoiding by staying busy?',
    'This decision looks practical. I think it is emotional.',
  ],
  gratitude: [
    'Someone made today easier and does not know it.',
    'Something I complained about a year ago is fine now.',
    'A small comfort I stopped noticing.',
    'I am grateful for something I did not choose.',
  ],
};


export const JournalEditor: React.FC<JournalEditorProps> = ({
  entry,
  onUpdateEntry,
  onSendMessage,
  onGenerateSummary,
  isGeneratingAI,
  isGeneratingSummary,
  saveStatus,
  onRetrySave,
  onToggleSidebarMobile,
  isSidebarOpen = true,
  onToggleSidebar,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isSummaryCopied, setIsSummaryCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(entry.title);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const hasAttachments = Boolean(entry.location || entry.summary);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitleInput(entry.title);
  }, [entry.id, entry.title]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entry.messages, isGeneratingAI]);

  // Auto-grow textarea dynamically based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // Cap max height at 200px and allow smooth vertical scroll
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputText]);

  const handleTitleSubmit = () => {
    const trimmed = titleInput.trim() || 'Untitled Journal Entry';
    setIsEditingTitle(false);
    onUpdateEntry({
      ...entry,
      title: trimmed,
      updatedAt: Date.now(),
    });
  };

  const handleModeChange = (newMode: JournalMode) => {
    onUpdateEntry({
      ...entry,
      mode: newMode,
      updatedAt: Date.now(),
    });
  };

  const handleSaveLocation = (loc: EntryLocation) => {
    onUpdateEntry({
      ...entry,
      location: loc,
      updatedAt: Date.now(),
    });
  };

  const handleRemoveLocation = () => {
    const updated = { ...entry };
    delete updated.location;
    onUpdateEntry({
      ...updated,
      updatedAt: Date.now(),
    });
  };

  const handleToggleShareWithCoach = () => {
    const nextSharedState = !entry.sharedWithCoach;
    onUpdateEntry({
      ...entry,
      sharedWithCoach: nextSharedState,
      updatedAt: Date.now(),
    });
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend || isGeneratingAI) return;

    setInputText('');
    await onSendMessage(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedMessageId(msg.id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleCopySummary = () => {
    if (!entry.summary) return;
    navigator.clipboard.writeText(entry.summary);
    setIsSummaryCopied(true);
    setTimeout(() => setIsSummaryCopied(false), 2000);
  };

  const handleUsePrompt = (prompt: string) => {
    setInputText(prompt);
    textareaRef.current?.focus();
  };

  const getSaveStatusDisplay = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <span className="flex items-center gap-1 text-meta text-ink-muted">
            <Clock className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Saving…
          </span>
        );
      case 'saved':
        return (
          <span className="flex items-center gap-1 text-meta text-emerald-600">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Saved
          </span>
        );
      case 'error':
        return (
          <button
            type="button"
            onClick={onRetrySave}
            className="flex cursor-pointer items-center gap-1 text-meta font-medium text-red-600 underline underline-offset-2 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> Save failed. Retry
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full bg-canvas overflow-hidden">
      {/* Editor Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:flex-nowrap sm:px-6">
        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
          <button
            type="button"
            onClick={onToggleSidebarMobile}
            aria-label="Open journal history"
            className={`${btnIcon} md:hidden`}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-expanded={isSidebarOpen}
              aria-controls="journal-history"
              title={isSidebarOpen ? 'Hide journal history' : 'Show journal history'}
              aria-label={isSidebarOpen ? 'Hide journal history' : 'Show journal history'}
              className={`${btnIcon} hidden md:inline-flex`}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
            </button>
          )}

          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <input
                id="entry-title-input"
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                autoFocus
                aria-label="Entry title"
                className={`${field} font-semibold`}
              />
            ) : (
              <h1 className="min-w-0">
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  title="Rename this entry"
                  className="max-w-full cursor-pointer truncate rounded-md text-body font-semibold text-ink decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-ink-soft hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                >
                  {entry.title || 'Untitled entry'}
                </button>
              </h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-meta text-ink-muted">
                Created {formatFullDate(entry.createdAt)}
              </span>
              <span className="text-ink-ghost" aria-hidden="true">•</span>
              {getSaveStatusDisplay()}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {/* Mode Selector */}
          <div
            role="group"
            aria-label="Reflection mode"
            className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-subtle p-0.5"
          >
            {MODES.map((mode) => {
              const isActive = entry.mode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleModeChange(mode.id)}
                  className={`cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-meta font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
                    isActive
                      ? 'bg-surface text-ink shadow-2xs'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          {/* AI Summary Action */}
          <button
            id="generate-summary-btn"
            onClick={onGenerateSummary}
            disabled={isGeneratingSummary || entry.messages.length === 0}
            className={btnSecondary}
            title="Summarize this entry"
            aria-label="Summarize this entry"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            <span className="hidden 2xl:inline">{isGeneratingSummary ? 'Summarizing…' : 'Summarize'}</span>
          </button>

          {/* Location Action */}
          {entry.location ? (
            <button
              id="edit-location-btn"
              onClick={() => setIsLocationPickerOpen(true)}
              className={`${btnSecondary} max-w-[160px] border-rose-200! bg-rose-50/70 text-rose-800! hover:border-rose-300! hover:bg-rose-100/80 hover:text-rose-900! sm:max-w-[200px]`}
              title={`Tagged at ${entry.location.placeName}. Change the place.`}
              aria-label={`Change place, currently ${entry.location.placeName}`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
              <span className="hidden truncate 2xl:inline">{entry.location.placeName}</span>
            </button>
          ) : (
            <button
              id="add-location-btn"
              onClick={() => setIsLocationPickerOpen(true)}
              className={btnSecondary}
              title="Tag this entry with a place"
              aria-label="Add a place"
            >
              <MapPin className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
              <span className="hidden 2xl:inline">Add place</span>
            </button>
          )}

          {/* Share with Coach Opt-In Toggle (Default OFF) */}
          <button
            id="share-with-coach-toggle-btn"
            type="button"
            onClick={handleToggleShareWithCoach}
            aria-pressed={Boolean(entry.sharedWithCoach)}
            className={`${btnSecondary} ${
              entry.sharedWithCoach ? 'border-line-emphasis! bg-subtle font-semibold text-ink!' : ''
            }`}
            title={
              entry.sharedWithCoach
                ? 'Shared with Coach (Admin View). Click to unshare.'
                : 'Private to you only (Default OFF). Click to opt into sharing with Coach.'
            }
          >
            <Share2
              className={`h-3.5 w-3.5 ${entry.sharedWithCoach ? 'text-ink-body' : 'text-ink-faint'}`}
              aria-hidden="true"
            />
            <span className="hidden 2xl:inline">{entry.sharedWithCoach ? 'Shared with coach' : 'Share with coach'}</span>
          </button>
        </div>
      </div>

      {/* Body: reading column + attachments rail */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] px-4 pt-4 pb-2 sm:px-6">
            <div className="mx-auto max-w-[62ch] space-y-4">
              {/* Below xl there is no rail, so the same two panels ride along
                  as disclosures — closed, costing a row each instead of ~440px. */}
              {hasAttachments && (
                <div className="space-y-2 xl:hidden">
                  {entry.location && (
                    <details className="group rounded-xl border border-line bg-surface">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-ui font-medium text-ink-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-place" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{entry.location.placeName}</span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="border-t border-line p-3">
                        <LocationPreview
                          location={entry.location}
                          variant="editor"
                          onChangeLocation={() => setIsLocationPickerOpen(true)}
                          onRemove={handleRemoveLocation}
                        />
                      </div>
                    </details>
                  )}

                  {entry.summary && (
                    <details className="group rounded-xl border border-amber-200/90 bg-amber-50/70">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-ui font-medium text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
                        <span className="min-w-0 flex-1">What Gemini noticed</span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-amber-700 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="border-t border-amber-200/70 px-3 py-3">
                        <div className="markdown-body text-amber-950/95">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.summary}</ReactMarkdown>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopySummary}
                          className={`${btnSecondary} mt-3 border-amber-200! text-amber-900!`}
                        >
                          {isSummaryCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </details>
                  )}
                </div>
              )}

          {entry.messages.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted-surface/80 text-ink-secondary mb-4">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-title font-semibold text-ink font-serif">
                Start writing
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-ui text-ink-soft">
                Write what happened. Gemini will read the whole thread as it grows.
              </p>

              {/* Starter Prompts */}
              <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-left">
                {PROMPT_SUGGESTIONS[entry.mode].map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handleUsePrompt(prompt)}
                    className="group cursor-pointer rounded-xl border border-line bg-surface p-3.5 text-left text-ui text-ink-secondary shadow-2xs transition-[border-color,background-color] duration-150 hover:border-line-emphasis hover:bg-canvas/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                  >
                    <div className="flex items-start gap-2">
                      <Lightbulb
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        aria-hidden="true"
                      />
                      <span>{prompt}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            entry.messages.map((msg) => {
              const isModel = msg.role === 'model';
              return (
                <div
                  key={msg.id}
                  className={`group py-2 transition-colors ${isModel ? 'border-b border-line-subtle/80 pb-4' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-md text-meta font-semibold shadow-2xs ${
                          isModel
                            ? 'bg-inverse text-on-inverse'
                            : 'bg-muted-surface text-ink-secondary'
                        }`}
                      >
                        {isModel ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-meta font-semibold text-ink">
                        {isModel ? 'Gemini' : 'You'}
                      </span>
                      {isModel && (
                        <span className="text-meta font-normal text-ink-muted" translate="no">
                          • {msg.modelUsed || 'gemini-3.6-flash'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-meta tabular-nums text-ink-muted">
                        {formatTime(msg.timestamp)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(msg)}
                        aria-label="Copy message text"
                        className={`${btnIconSm} opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 motion-reduce:transition-none`}
                      >
                        {copiedMessageId === msg.id ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pl-8 text-ui text-ink-body">
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* AI Thinking Animation */}
          {isGeneratingAI && (
            <div role="status" className="flex items-center gap-2.5 py-2 pl-8 text-meta text-ink-muted">
              <span className="h-2 w-2 rounded-full bg-ink-muted animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              <span className="h-2 w-2 rounded-full bg-ink-muted animate-pulse delay-150 motion-reduce:animate-none" aria-hidden="true" />
              <span className="h-2 w-2 rounded-full bg-ink-muted animate-pulse delay-300 motion-reduce:animate-none" aria-hidden="true" />
<span className="ml-1 text-ui font-medium text-ink-soft">Gemini is writing…</span>
            </div>
          )}

              <div ref={messagesEndRef} />
            </div>
          </div>
      {/* Input Composer Area */}
      <div className="border-t border-line bg-surface/95 backdrop-blur-xs p-3 sm:px-6 sm:py-3.5">
        <form onSubmit={handleSend} className="mx-auto max-w-[64ch]">
          <div className="relative rounded-2xl border border-line-strong bg-canvas/70 shadow-2xs transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-inverse focus-within:bg-surface focus-within:ring-1 focus-within:ring-ink motion-reduce:transition-none">
            <div className="flex items-end gap-2 p-2 sm:p-2.5">
              <textarea
                id="reflection-chat-input"
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Write your reflection"
                placeholder={
                  entry.messages.length === 0
                    ? 'Write your reflection…'
                    : 'Respond, ask for ideas, or go deeper…'
                }
                rows={1}
                className="max-h-52 w-full resize-none overflow-y-auto bg-transparent px-2.5 py-1 text-ui text-ink placeholder:text-ink-faint focus:outline-hidden"
                disabled={isGeneratingAI}
              />

              <button
                id="send-reflection-btn"
                type="submit"
                disabled={!inputText.trim() || isGeneratingAI}
                aria-label="Send reflection to Gemini"
                className="mb-0.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-inverse text-surface shadow-2xs transition-[background-color,opacity] duration-150 hover:bg-inverse-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-line/60 px-3 py-1.5 text-meta text-ink-muted">
              <div className="flex items-center gap-1.5">
                <span>Enter to send</span>
                <span>•</span>
                <span>Shift+Enter for newline</span>
              </div>
              {inputText.length > 0 && (
                <span className="font-mono text-meta tabular-nums text-ink-muted">
                  {inputText.length} chars
                </span>
              )}
            </div>
          </div>
        </form>
      </div>

        </div>

        {/* Attachments rail — reference material beside the conversation,
            never above it. Only rendered when there is something to show. */}
        {hasAttachments && (
          <aside
            aria-label="Entry attachments"
            className="hidden w-[22rem] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] border-l border-line bg-canvas/60 p-4 xl:flex 2xl:w-96"
          >
            {entry.location && (
              <section>
                <LocationPreview
                  location={entry.location}
                  variant="editor"
                  onChangeLocation={() => setIsLocationPickerOpen(true)}
                  onRemove={handleRemoveLocation}
                />
              </section>
            )}

            {entry.summary && (
              <section className="rounded-xl border border-amber-200/90 bg-amber-50/70 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-ui font-semibold text-amber-950">
                    <Sparkles className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    What Gemini noticed
                  </h2>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    aria-label="Copy the summary"
                    className="shrink-0 cursor-pointer rounded-md p-1 text-amber-800 transition-colors duration-150 hover:bg-amber-200/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                  >
                    {isSummaryCopied ? (
                      <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <div className="markdown-body mt-2 text-ui text-amber-950/95">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.summary}</ReactMarkdown>
                </div>
              </section>
            )}
          </aside>
        )}
      </div>

      {/* Location Picker Modal */}
      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        onSelectLocation={handleSaveLocation}
        currentLocation={entry.location}
      />
    </div>
  );
};
