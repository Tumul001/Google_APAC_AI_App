import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  ArrowUp,
  Mic,
  MicOff,
  AudioLines,
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
import { transcribeSpeech, smartFormatVoiceText } from '../lib/geminiApi';

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
  onStopGeneration?: () => void;
  view?: 'entry' | 'mood';
  onChangeView?: (view: 'entry' | 'mood') => void;
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
  onStopGeneration,
  view = 'entry',
  onChangeView,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isSummaryCopied, setIsSummaryCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(entry.title);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isFormattingSpeech, setIsFormattingSpeech] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  const isListeningRef = useRef<boolean>(false);
  const rawTranscriptRef = useRef<string>('');
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const recognitionRef = useRef<any>(null);
  const baseTextBeforeRecordingRef = useRef<string>('');
  const hasAttachments = Boolean(entry.location || entry.summary);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check speech recognition capability on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSupport = Boolean(
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition ||
        navigator.mediaDevices?.getUserMedia
      );
      setIsSpeechSupported(hasSupport);
    }
  }, []);

  // Cleanup speech resources on unmount or when active entry changes
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {
          // ignore
        }
        audioContextRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      isListeningRef.current = false;
    };
  }, [entry.id]);

  const stopListening = async () => {
    setIsListening(false);
    isListeningRef.current = false;

    // 1. Cancel animation frame and clear inline heights so CSS processing ripple can run
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    barRefs.current.forEach((el) => {
      if (el) {
        el.style.height = '';
        el.style.opacity = '';
      }
    });

    // 2. Stop SpeechRecognition and detach event listeners immediately
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    // 3. Stop MediaRecorder if running without blocking
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }

    // 4. Release microphone and close AudioContext
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    // 5. Instant Speech Formatting (matching Google AI Studio speed)
    const base = baseTextBeforeRecordingRef.current;
    let rawText = (rawTranscriptRef.current || '').trim();
    if (!rawText && inputText && inputText !== base) {
      rawText = base ? inputText.slice(base.length).trim() : inputText.trim();
    }

    if (rawText) {
      setIsFormattingSpeech(true);

      // Instant 0ms formatting so the user sees results immediately
      const combined = base ? `${base.trim()} ${rawText}` : rawText;
      const formatted = smartFormatVoiceText(combined);
      setInputText(formatted);

      // Background model verification without blocking
      transcribeSpeech(rawText)
        .then((result) => {
          if (result.text && result.text.trim()) {
            const refinedChunk = result.text.trim();
            const formattedBase = base ? smartFormatVoiceText(base.trim()) : '';
            const sep = formattedBase && !formattedBase.endsWith(' ') && !formattedBase.endsWith('\n') ? ' ' : '';
            setInputText(formattedBase ? `${formattedBase}${sep}${refinedChunk}` : refinedChunk);
          }
        })
        .finally(() => {
          setTimeout(() => {
            setIsFormattingSpeech(false);
          }, 350);
        });
    } else {
      setIsFormattingSpeech(false);
    }
  };

  const toggleSpeechRecognition = async () => {
    if (isListening) {
      await stopListening();
      return;
    }

    if (!isSpeechSupported) {
      setSpeechError('Speech recognition is not supported in this browser.');
      setTimeout(() => setSpeechError(null), 4000);
      return;
    }

    baseTextBeforeRecordingRef.current = inputText;
    rawTranscriptRef.current = '';
    audioChunksRef.current = [];

    // 1. Microphone access for real-time waveform visualizer & audio recording
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;

        // Setup AudioContext & AnalyserNode for the 5 equalizer bars
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.3;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let phase = 0;

          const animate = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            phase += 0.08;

            // Speech-tuned frequency bands (FFT size 256, ~48kHz):
            // Bin 1: ~180Hz (fundamental vocal pitch)
            // Bin 2: ~375Hz (vowel body)
            // Bin 3: ~560Hz (core speech energy)
            // Bin 6: ~1120Hz (consonants / articulation)
            // Bin 11: ~2060Hz (upper harmonic sibilance)
            const sampleBands = [1, 2, 3, 6, 11];
            // Symmetrical peak heights: [outer: 9px, mid: 14px, center: 18px, mid: 14px, outer: 9px]
            const maxHeights = [9, 14, 18, 14, 9];

            sampleBands.forEach((binIdx, i) => {
              const val = dataArray[binIdx] || 0;
              // Normalize speech volume: floor at 8, reach max around 140
              const normalized = Math.max(0, (val - 8) / 132);

              // Organic ambient breathing wave so the dots remain visually alive during pauses
              const ambient = 0.5 + 0.5 * Math.sin(phase + i * 0.75);
              const ambientPx = ambient * 1.5;

              // Combined height: baseline 3.5px + voice amplitude + gentle ambient
              const dynamicPx = Math.min(normalized, 1) * (maxHeights[i] - 3.5);
              const height = Math.min(maxHeights[i], Math.round(3.5 + dynamicPx + (normalized > 0.05 ? 0 : ambientPx)));

              const el = barRefs.current[i];
              if (el) {
                el.style.height = `${height}px`;
                el.style.opacity = `${0.65 + Math.min(normalized, 1) * 0.35}`;
              }
            });

            animationFrameRef.current = requestAnimationFrame(animate);
          };
          animationFrameRef.current = requestAnimationFrame(animate);
        }

        // Setup MediaRecorder
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
          const mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };
          mediaRecorder.start(250);
          mediaRecorderRef.current = mediaRecorder;
        } catch (recErr) {
          console.warn('[Speech] MediaRecorder init failed:', recErr);
        }
      }
    } catch (micErr: any) {
      console.warn('[Speech] Microphone access error:', micErr);
      if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError') {
        setSpeechError('Microphone permission was denied. Please allow microphone access in your browser.');
        setTimeout(() => setSpeechError(null), 5000);
        return;
      }
    }

    // 2. Setup SpeechRecognition for real-time live typing feedback
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionAPI) {
      try {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          isListeningRef.current = true;
          setSpeechError(null);
        };

        recognition.onresult = (event: any) => {
          const parts: string[] = [];
          for (let i = 0; i < event.results.length; i++) {
            const piece = event.results[i][0]?.transcript;
            if (piece) {
              parts.push(piece.trim());
            }
          }
          const transcript = parts.join(' ');
          rawTranscriptRef.current = transcript;
          const base = baseTextBeforeRecordingRef.current;
          const separator = base && !base.endsWith(' ') && !base.endsWith('\n') ? ' ' : '';
          setInputText(base ? `${base}${separator}${transcript}` : transcript);
        };

        recognition.onerror = (event: any) => {
          console.warn('[SpeechRecognition] Error:', event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setSpeechError('Microphone permission was denied. Please allow microphone access in your browser.');
          } else if (event.error !== 'no-speech') {
            setSpeechError(`Voice dictation issue: ${event.error}`);
          }
          stopListening();
        };

        recognition.onend = () => {
          if (isListeningRef.current) {
            stopListening();
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err: any) {
        console.warn('[SpeechRecognition] Failed to start:', err);
      }
    }

    setIsListening(true);
    isListeningRef.current = true;
  };

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
          {onChangeView && (
            <div
              role="group"
              aria-label="View"
              className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-subtle p-0.5"
            >
              {(['entry', 'mood'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => onChangeView(v)}
                  className={`cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1.5 text-meta font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
                    view === v ? 'bg-surface text-ink shadow-2xs' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {v === 'entry' ? 'Entry' : 'Mood flow'}
                </button>
              ))}
            </div>
          )}

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
            entry.messages.map((msg, index) => {
              const isModel = msg.role === 'model';
              const isLastModelStreaming = isModel && isGeneratingAI && index === entry.messages.length - 1;

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
                      {msg.content && (
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
                      )}
                    </div>
                  </div>

                  <div className="pl-8 text-ui text-ink-body">
                    {msg.content ? (
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        {isLastModelStreaming && (
                          <span className="inline-block h-3.5 w-1.5 ml-1 bg-ink animate-pulse align-middle" aria-hidden="true" />
                        )}
                      </div>
                    ) : isLastModelStreaming ? (
                      <div role="status" className="flex items-center gap-2 py-1 text-meta text-ink-muted">
                        <span className="h-2 w-2 rounded-full bg-ink-muted animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                        <span className="h-2 w-2 rounded-full bg-ink-muted animate-pulse delay-150 motion-reduce:animate-none" aria-hidden="true" />
                        <span className="h-2 w-2 rounded-full bg-ink-muted animate-pulse delay-300 motion-reduce:animate-none" aria-hidden="true" />
                        <span className="ml-1 text-ui font-medium text-ink-soft">Gemini is writing…</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

              <div ref={messagesEndRef} />
            </div>
          </div>
      {/* Input Composer Area */}
      <div className="border-t border-line bg-surface/95 backdrop-blur-xs p-3 sm:px-6 sm:py-3.5">
        <form onSubmit={handleSend} className="mx-auto max-w-[64ch]">
          {/* Active Voice Listening Banner */}
          {isListening && (
            <div
              role="status"
              className="mb-2 flex items-center justify-between rounded-xl border border-red-200 bg-red-50/80 px-3 py-1.5 text-meta text-red-700 shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                </span>
                <span className="font-medium">Listening to your voice… Speak freely to dictate</span>
              </div>
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className="cursor-pointer text-meta font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
              >
                Done
              </button>
            </div>
          )}

          {/* Speech Error Banner */}
          {speechError && (
            <div
              role="alert"
              className="mb-2 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-meta text-amber-800 shadow-2xs"
            >
              <span>{speechError}</span>
              <button
                type="button"
                onClick={() => setSpeechError(null)}
                aria-label="Dismiss message"
                className="cursor-pointer text-ui font-bold hover:text-amber-950"
              >
                &times;
              </button>
            </div>
          )}

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

              <div className="mb-0.5 flex items-center gap-1.5 shrink-0">
                {/* Voice Dictation (Speech to text) Button with animated red audio waveform */}
                <button
                  id="voice-dictate-btn"
                  type="button"
                  onClick={toggleSpeechRecognition}
                  disabled={isGeneratingAI}
                  aria-pressed={isListening || isFormattingSpeech}
                  aria-label={
                    isListening
                      ? 'Stop speech to text'
                      : isFormattingSpeech
                      ? 'Processing speech'
                      : 'Speech to text'
                  }
                  title={
                    isListening
                      ? 'Speech to text (Click to stop)'
                      : isFormattingSpeech
                      ? 'Speech to text'
                      : isSpeechSupported
                      ? 'Speech to text'
                      : 'Voice dictation is not supported in this browser'
                  }
                  className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
                    isListening || isFormattingSpeech
                      ? 'cursor-pointer border border-red-500/25 bg-red-500/10 text-red-600 shadow-2xs active:scale-95'
                      : isSpeechSupported
                      ? 'cursor-pointer text-ink-muted hover:bg-muted-surface hover:text-ink active:scale-95'
                      : 'cursor-not-allowed text-ink-muted/30 opacity-40'
                  }`}
                >
                  {isListening || isFormattingSpeech ? (
                    <div className="flex h-5 items-center justify-center gap-[3px] px-0.5" aria-hidden="true">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          ref={(el) => {
                            barRefs.current[i] = el;
                          }}
                          className={`audio-dot ${
                            isFormattingSpeech
                              ? `audio-dot-processing audio-dot-${i + 1}`
                              : isListening && !audioContextRef.current
                              ? `audio-dot-listening-fallback audio-dot-${i + 1}`
                              : ''
                          }`}
                        />
                      ))}
                    </div>
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                {/* Send Arrow (lights up when text entered) OR Cancel Generation Button (when generating) */}
                {isGeneratingAI ? (
                  <button
                    id="cancel-generation-btn"
                    type="button"
                    onClick={onStopGeneration}
                    aria-label="Cancel generation"
                    title="Cancel generation"
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface text-ink shadow-2xs transition-all duration-150 hover:bg-muted-surface hover:border-line-strong hover:text-red-600 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
                  >
                    <div className="relative flex h-5 w-5 items-center justify-center">
                      <svg
                        className="h-5 w-5 animate-spin text-ink"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        />
                        <path
                          className="opacity-90"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <div className="absolute h-2 w-2 rounded-xs bg-ink" aria-hidden="true" />
                    </div>
                  </button>
                ) : (
                  <button
                    id="send-reflection-btn"
                    type="submit"
                    disabled={!inputText.trim()}
                    aria-label="Send prompt"
                    title={inputText.trim() ? 'Send prompt' : 'Write a reflection to send'}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none ${
                      inputText.trim()
                        ? 'cursor-pointer bg-inverse text-surface shadow-xs ring-2 ring-inverse/25 hover:bg-inverse-hover active:scale-95'
                        : 'cursor-not-allowed bg-muted-surface/70 text-ink-muted/30 shadow-none'
                    }`}
                  >
                    <ArrowUp
                      className={`h-4 w-4 transition-transform duration-150 ${
                        inputText.trim() ? 'scale-105 stroke-[2.5]' : 'scale-100 stroke-2'
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
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
