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
} from 'lucide-react';
import type { JournalEntry, JournalMode, ChatMessage, SaveStatus } from '../types';

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
}

const PROMPT_SUGGESTIONS: Record<JournalMode, string[]> = {
  reflection: [
    'What was the most rewarding moment of today and why?',
    'What is a recurring thought or challenge on my mind right now?',
    'How did I handle stress or uncertainty today, and what could I improve?',
    'What is one thing I learned about myself recently?',
  ],
  brainstorm: [
    'I want to brainstorm creative solutions for a project bottleneck.',
    'Help me explore 5 unexpected angles to approach this challenge.',
    'What are the second-order consequences of this decision?',
    'Turn this vague concept into a structured 3-step action plan.',
  ],
  deep_thinking: [
    'Help me challenge my own assumptions regarding this dilemma.',
    'What cognitive biases might be influencing my current perspective?',
    'If I had zero fear of failure, what would be the obvious choice here?',
    'Analyze both sides of this decision with pros, cons, and blind spots.',
  ],
  gratitude: [
    'Name 3 small moments of grace or joy that happened today.',
    'Who is someone that made my life easier or happier recently and why?',
    'What is a difficult past experience I am now grateful for because of the growth it gave me?',
    'What everyday comfort do I usually take for granted?',
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
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isSummaryCopied, setIsSummaryCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(entry.title);
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
          <span className="flex items-center gap-1 text-[11px] text-stone-500">
            <Clock className="h-3 w-3 animate-spin" /> Saving to Firestore...
          </span>
        );
      case 'saved':
        return (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Saved in Firestore
          </span>
        );
      case 'error':
        return (
          <button
            onClick={onRetrySave}
            className="flex items-center gap-1 text-[11px] text-red-600 hover:underline font-medium"
          >
            <AlertCircle className="h-3 w-3" /> Save failed (Click to retry)
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full bg-stone-50 overflow-hidden">
      {/* Editor Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-stone-200 bg-white px-4 py-3 sm:px-6 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebarMobile}
            className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100 md:hidden"
            title="Toggle Journal History"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            {isEditingTitle ? (
              <input
                id="entry-title-input"
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                autoFocus
                className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm font-semibold text-stone-900 focus:border-stone-500 focus:outline-hidden"
              />
            ) : (
              <h2
                onClick={() => setIsEditingTitle(true)}
                className="truncate text-base font-semibold text-stone-900 cursor-pointer hover:text-stone-600 hover:underline decoration-stone-300 underline-offset-4"
                title="Click to rename"
              >
                {entry.title || 'Untitled Journal Entry'}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-stone-400">
                Created {new Date(entry.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-stone-300">•</span>
              {getSaveStatusDisplay()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Selector */}
          <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs">
            <button
              onClick={() => handleModeChange('reflection')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                entry.mode === 'reflection'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Reflection
            </button>
            <button
              onClick={() => handleModeChange('brainstorm')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                entry.mode === 'brainstorm'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Brainstorm
            </button>
            <button
              onClick={() => handleModeChange('deep_thinking')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                entry.mode === 'deep_thinking'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Deep Thinking
            </button>
            <button
              onClick={() => handleModeChange('gratitude')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                entry.mode === 'gratitude'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Gratitude
            </button>
          </div>

          {/* AI Summary Action */}
          <button
            id="generate-summary-btn"
            onClick={onGenerateSummary}
            disabled={isGeneratingSummary || entry.messages.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-2xs hover:bg-stone-50 disabled:opacity-50 transition-colors cursor-pointer"
            title="Generate AI Summary & Structured Takeaways"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span className="hidden sm:inline">{isGeneratingSummary ? 'Summarizing...' : 'Summarize'}</span>
          </button>
        </div>
      </div>

      {/* Messages Workspace */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* AI Summary Highlight Card (Inline at top of conversation stream) */}
          {entry.summary && (
            <div className="rounded-2xl border border-amber-200/90 bg-amber-50/70 p-5 shadow-2xs transition-all">
              <div className="flex items-center justify-between gap-3 border-b border-amber-200/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-200/80 text-amber-900">
                    <Sparkles className="h-4 w-4 text-amber-800" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-amber-950 font-serif">
                        AI Insight Summary & Action Items
                      </h4>
                      <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                        Gemini 3.6 Flash
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800/80">
                      Key takeaways, mindset patterns, and suggested next steps
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopySummary}
                    className="flex items-center gap-1 rounded-lg border border-amber-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-white transition-colors cursor-pointer shadow-2xs"
                    title="Copy full summary"
                  >
                    {isSummaryCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-amber-800" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    className="rounded-lg p-1 text-amber-800/70 hover:bg-amber-200/50 hover:text-amber-950 transition-colors cursor-pointer"
                    title={isSummaryExpanded ? 'Collapse summary' : 'Expand summary'}
                  >
                    {isSummaryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {isSummaryExpanded && (
                <div className="mt-3 text-xs text-amber-950/95 leading-relaxed font-sans">
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.summary}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}

          {entry.messages.length === 0 ? (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-200/80 text-stone-700 mb-4">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-stone-900 font-serif">
                Begin your reflection
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs sm:text-sm text-stone-500 leading-relaxed">
                Write down what's on your mind, what happened today, or pick one of the prompts below
                to start an engaging dialogue with Gemini.
              </p>

              {/* Starter Prompts */}
              <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-left">
                {PROMPT_SUGGESTIONS[entry.mode].map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handleUsePrompt(prompt)}
                    className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-700 shadow-2xs hover:border-stone-400 hover:bg-stone-50/80 transition-all text-left group"
                  >
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
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
                  className={`group py-2 transition-colors ${isModel ? 'border-b border-stone-100/80 pb-4' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold shadow-2xs ${
                          isModel
                            ? 'bg-stone-900 text-stone-50'
                            : 'bg-stone-200 text-stone-700'
                        }`}
                      >
                        {isModel ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      </div>
                      <span className="text-xs font-semibold text-stone-900">
                        {isModel ? 'Gemini' : 'You'}
                      </span>
                      {isModel && (
                        <span className="text-[11px] text-stone-400 font-normal">
                          • {msg.modelUsed || 'Gemini 3.6 Flash'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-stone-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => handleCopy(msg)}
                        className="opacity-0 group-hover:opacity-100 rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-all cursor-pointer"
                        title="Copy message text"
                      >
                        {copiedMessageId === msg.id ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className={`pl-8 text-sm leading-relaxed text-stone-800 font-sans`}>
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
            <div className="flex items-center gap-2.5 pl-8 py-2 text-xs text-stone-500">
              <div className="flex h-2 w-2 rounded-full bg-stone-500 animate-pulse" />
              <div className="flex h-2 w-2 rounded-full bg-stone-500 animate-pulse delay-150" />
              <div className="flex h-2 w-2 rounded-full bg-stone-500 animate-pulse delay-300" />
              <span className="text-xs font-medium text-stone-600 ml-1">
                Gemini is reflecting...
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Composer Area */}
      <div className="border-t border-stone-200 bg-white/95 backdrop-blur-xs p-3 sm:px-6 sm:py-3.5">
        <form onSubmit={handleSend} className="mx-auto max-w-3xl">
          <div className="relative rounded-2xl border border-stone-300 bg-stone-50/70 focus-within:border-stone-900 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-900 transition-all shadow-2xs">
            <div className="flex items-end gap-2 p-2 sm:p-2.5">
              <textarea
                id="reflection-chat-input"
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  entry.messages.length === 0
                    ? 'Write your reflection, thoughts, or questions (Shift+Enter for newline)...'
                    : 'Respond, ask for ideas, or dive deeper into this reflection...'
                }
                rows={1}
                className="w-full resize-none bg-transparent px-2.5 py-1 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden leading-relaxed max-h-52 overflow-y-auto"
                disabled={isGeneratingAI}
              />

              <button
                id="send-reflection-btn"
                type="submit"
                disabled={!inputText.trim() || isGeneratingAI}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white shadow-2xs hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer mb-0.5"
                title="Send reflection to Gemini"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-stone-200/50 px-3 py-1 text-[11px] text-stone-400">
              <div className="flex items-center gap-1.5">
                <span>Enter to send</span>
                <span>•</span>
                <span>Shift+Enter for newline</span>
              </div>
              {inputText.length > 0 && (
                <span className="text-[10px] text-stone-400 font-mono">
                  {inputText.length} chars
                </span>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
