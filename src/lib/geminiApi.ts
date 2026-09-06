import type { ChatMessage, JournalMode } from '../types';

export interface GenerateReflectionResponse {
  success: boolean;
  text: string;
  modelUsed?: string;
  error?: string;
}

export interface GenerateSummaryResponse {
  success: boolean;
  summary: string;
  modelUsed?: string;
  error?: string;
}

export async function requestGeminiReflection(
  messages: Array<{ role: 'user' | 'model'; content: string }>,
  mode: JournalMode = 'reflection',
  systemInstruction?: string,
  signal?: AbortSignal
): Promise<GenerateReflectionResponse> {
  const response = await fetch('/api/gemini/reflect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      mode,
      systemInstruction,
    }),
    signal,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Server error (${response.status})`);
  }

  return data;
}

export async function streamGeminiReflection(
  messages: Array<{ role: 'user' | 'model'; content: string }>,
  mode: JournalMode = 'reflection',
  systemInstruction?: string,
  onChunk?: (chunk: { text: string; modelUsed?: string }) => void,
  signal?: AbortSignal
): Promise<{ text: string; modelUsed?: string }> {
  const response = await fetch('/api/gemini/reflect/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      mode,
      systemInstruction,
    }),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Server error (${response.status})`);
  }

  if (!response.body) {
    throw new Error('ReadableStream not supported in response.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let lastModelUsed: string | undefined;
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') {
          break;
        }
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
            fullText += parsed.text;
            if (parsed.modelUsed) lastModelUsed = parsed.modelUsed;
            if (onChunk) {
              onChunk({ text: parsed.text, modelUsed: parsed.modelUsed });
            }
          }
        } catch (e: any) {
          if (e.message && !e.message.includes('Unexpected token')) {
            throw e;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { text: fullText, modelUsed: lastModelUsed };
}

export async function requestGeminiSummary(
  content: string,
  title?: string
): Promise<GenerateSummaryResponse> {
  const response = await fetch('/api/gemini/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      title,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Server error (${response.status})`);
  }

  return data;
}

/**
 * Client-side immediate heuristic formatter for voice dictation.
 * Applies instant punctuation, capitalization, sentence boundary detection,
 * and question mark inference in 0ms (matching Google AI Studio).
 */
export function smartFormatVoiceText(text: string): string {
  if (!text) return '';
  let s = text.trim();
  if (!s) return '';

  // 1. Capitalize standalone "i" and contractions
  s = s.replace(/\bi\b/g, 'I');
  s = s.replace(/\bi'm\b/gi, "I'm");
  s = s.replace(/\bi've\b/gi, "I've");
  s = s.replace(/\bi'll\b/gi, "I'll");
  s = s.replace(/\bi'd\b/gi, "I'd");

  // 2. Identify and separate compound conversational greetings or new utterances mid-stream
  // e.g. "audible hey am I audible" -> "audible. Hey am I audible"
  s = s.replace(/([a-zA-Z0-9])\s+(hey|hi|hello)\s+/gi, '$1. $2 ');

  // 3. Comma after greetings at start of utterance or after sentence boundaries
  s = s.replace(/(^|[.?!]\s+)(Hey|Hi|Hello)\s+([a-zA-Z])/gi, (_m, prefix, greeting, nextChar) => {
    const capitalizedGreeting = greeting.charAt(0).toUpperCase() + greeting.slice(1).toLowerCase();
    return `${prefix}${capitalizedGreeting}, ${nextChar}`;
  });

  // 4. Common conversational discourse markers
  s = s.replace(/(^|[.?!]\s+)(Actually|Honestly|Basically|Meanwhile|By the way|Anyway|Well)\s+([a-zA-Z])/gi, '$1$2, $3');

  // 5. Split by sentence delimiters or process clauses
  const rawParts = s.split(/(?<=[.?!])\s+/);
  const formattedSentences = rawParts.map((sentence) => {
    let part = sentence.trim();
    if (!part) return '';

    // Capitalize first letter of sentence
    part = part.charAt(0).toUpperCase() + part.slice(1);

    // Question patterns for this sentence
    const questionRegex = /^(am I|are you|is it|is this|is that|can you|can I|could you|could I|would you|should I|what|when|where|why|how|who|whom|whose|do you|did you|does it|have you|has it|will you|won't you|aren't you|isn't it)\b/i;
    const greetingQuestionRegex = /^(Hey|Hi|Hello),\s+(am I|are you|is it|is this|is that|can you|can I|could you|what|when|where|why|how|who|do you|did you|have you)\b/i;

    const hasEndPunct = /[.?!]$/.test(part);
    if (!hasEndPunct) {
      if (questionRegex.test(part) || greetingQuestionRegex.test(part)) {
        part += '?';
      } else {
        part += '.';
      }
    }
    return part;
  });

  s = formattedSentences.filter(Boolean).join(' ');

  // Cleanup any double punctuation or trailing spaces before punctuation
  s = s.replace(/\.+/g, '.').replace(/\?+/g, '?').replace(/!+/g, '!');
  s = s.replace(/\s+([,.?!])/g, '$1');

  return s;
}

/**
 * Fast intelligent speech post-processor via Gemini backend.
 * Dispatches lightweight text payload and safely returns formatted text.
 * Never degrades back to raw unformatted transcript if the background call fails.
 */
export async function transcribeSpeech(
  rawTranscript?: string
): Promise<{ text?: string; modelUsed?: string }> {
  if (!rawTranscript || !rawTranscript.trim()) {
    return {};
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch('/api/speech/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rawTranscript: rawTranscript.trim(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      return {};
    }

    const data = await response.json().catch(() => ({}));
    if (data.success && data.text && !data.fallback) {
      return {
        text: data.text,
        modelUsed: data.modelUsed,
      };
    }
    return {};
  } catch {
    clearTimeout(timeoutId);
    return {};
  }
}
