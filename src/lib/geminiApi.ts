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
  systemInstruction?: string
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
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Server error (${response.status})`);
  }

  return data;
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
