import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// 1. Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Resilient Model Fallback Ladder (ordered by availability and latency per protocol)
const MODEL_FALLBACK_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
];

let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables');
    }
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

interface MessagePart {
  role: 'user' | 'model';
  content: string;
}

async function generateContentWithFallback(
  messages: MessagePart[],
  systemInstruction?: string,
  mode: string = 'reflection'
) {
  const ai = getGenAI();
  let lastError: any = null;

  // Build appropriate system prompt based on mode
  let defaultSystemPrompt = `You are a thoughtful, empathetic, and intellectually curious journaling companion and reflection guide.
Your goal is to help the user explore their thoughts, reflect on daily experiences, brainstorm constructive solutions, and uncover deeper insights.
- Be supportive, articulate, and respectful.
- Provide structured, digestible thoughts (bullet points or short paragraphs where appropriate).
- If the user asks for brainstorming or problem solving, provide creative, actionable ideas.
- Offer constructive reflection questions to encourage deeper self-discovery.`;

  if (mode === 'brainstorm') {
    defaultSystemPrompt = `You are an imaginative, structured creative ideation partner and strategic sounding board.
Help the user expand their ideas, break down complex challenges, identify unexpected angles, and outline practical next steps.`;
  } else if (mode === 'summary') {
    defaultSystemPrompt = `You are an expert executive summarizer and reflective analyst.
Summarize the core themes, emotional tone, key realizations, and actionable next steps from the user's journal entry in an elegant, structured format.`;
  }

  const promptToUse = systemInstruction || defaultSystemPrompt;

  // Convert messages to GenAI format
  const contents = messages.map((m) => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.content || '' }],
  }));

  for (const modelName of MODEL_FALLBACK_LADDER) {
    try {
      console.log(`[Gemini] Attempting content generation with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: promptToUse,
          temperature: 0.7,
        },
      });

      const text = response.text || '';
      return {
        text,
        modelUsed: modelName,
      };
    } catch (err: any) {
      lastError = err;
      const statusCode = err?.status || err?.statusCode || 0;
      const errorMsg = err?.message || String(err);
      const isRecoverable =
        statusCode === 503 ||
        statusCode === 429 ||
        statusCode === 404 ||
        statusCode === 500 ||
        errorMsg.includes('503') ||
        errorMsg.includes('429') ||
        errorMsg.includes('RESOURCE_EXHAUSTED') ||
        errorMsg.includes('UNAVAILABLE') ||
        errorMsg.includes('high demand') ||
        errorMsg.includes('NOT_FOUND');

      const isLastModel = MODEL_FALLBACK_LADDER.indexOf(modelName) === MODEL_FALLBACK_LADDER.length - 1;

      if (isRecoverable && !isLastModel) {
        console.log(`[Gemini] Model ${modelName} temporary demand/availability spike (${statusCode || 'recovering'}). Stepping to next model in fallback ladder...`);
      } else {
        console.warn(`[Gemini] Model ${modelName} encountered error:`, errorMsg);
        if (!isRecoverable && isLastModel) {
          throw err;
        }
      }
    }
  }

  throw lastError || new Error('All model fallback attempts exhausted.');
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasSlackWebhook: Boolean(process.env.SLACK_WEBHOOK_URL),
  });
});

/**
 * Clean plain-text sanitization for Slack Block Kit headers and plain_text objects
 */
function sanitizePlainText(text: string, maxLength = 80): string {
  if (!text || typeof text !== 'string') return '';
  let clean = text.replace(/[\u0000-\u001F\u007F]/g, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength).trim() + '...';
  }
  return clean;
}

/**
 * Content Sanitization per Notification API Directive:
 * - Escapes Slack markdown special characters (*, _, ~, `, <, >, &)
 * - Strips control characters
 * - Strictly bounds length to ~200 characters
 */
function sanitizeSlackContent(text: string, maxLength = 200): string {
  if (!text || typeof text !== 'string') return '';
  // 1. Strip non-printable / control characters
  let clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  // 2. Escape Slack special syntax symbols
  clean = clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // 3. Escape formatting delimiters (*, _, ~, `)
  clean = clean.replace(/([*_~`])/g, '\\$1');
  // 4. Collapse extra whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  // 5. Bound to maxLength
  if (clean.length > maxLength) {
    clean = clean.substring(0, maxLength).trim() + '...';
  }
  return clean;
}

interface SlackRateLimitRecord {
  mode: string;
  timestamp: number;
}

// In-memory rate limiting cache: max 1 notification per entry save per mode, preventing duplicate triggers for repetitive edits
const slackNotificationRateLimitCache = new Map<string, SlackRateLimitRecord>();

// Clean up cache entries older than 6 hours
setInterval(() => {
  const now = Date.now();
  for (const [entryId, record] of slackNotificationRateLimitCache.entries()) {
    if (now - record.timestamp > 6 * 60 * 60 * 1000) {
      slackNotificationRateLimitCache.delete(entryId);
    }
  }
}, 60 * 60 * 1000).unref();

function getValidatedSlackWebhookUrl(): string {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) {
    throw new Error('SLACK_WEBHOOK_URL is not configured in server environment or Secret Manager.');
  }
  // SSRF Defense: strictly enforce official Slack webhook origin
  if (!url.startsWith('https://hooks.slack.com/services/')) {
    throw new Error('Security Violation: SLACK_WEBHOOK_URL must begin with "https://hooks.slack.com/services/".');
  }
  return url;
}

// Test Slack Webhook Connectivity Endpoint
app.post('/api/notifications/slack/test', async (req, res) => {
  try {
    let webhookUrl: string;
    try {
      webhookUrl = getValidatedSlackWebhookUrl();
    } catch (urlErr: any) {
      return res.status(503).json({
        success: false,
        error: urlErr.message,
      });
    }

    const testPayload = {
      text: '🧪 *Gemini Reflections* • Test notification ping verified!',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🧪 Slack Integration Verified',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Your Slack Incoming Webhook has been successfully connected to *Gemini Reflections*! Journal entries matching your opt-in trigger settings will dispatch sanitized previews here.',
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Google Cloud Run • Secret Manager • Verified at ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });

    if (!slackResponse.ok) {
      const responseText = await slackResponse.text().catch(() => '');
      return res.status(502).json({
        success: false,
        error: `Slack rejected webhook (HTTP ${slackResponse.status}): ${responseText}`,
      });
    }

    return res.json({
      success: true,
      message: 'Test notification delivered to Slack successfully!',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to send test notification.',
    });
  }
});

// Server-side Trigger for Slack Notifications on Confirmed Firestore Save
app.post('/api/notifications/slack', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { entryId, entryTitle, mode, excerpt, modeTransition } = body;
    console.log(`[Server Slack Webhook] Received request: entryId="${entryId}", mode="${mode}", title="${entryTitle}", modeTransition=${Boolean(modeTransition)}`);

    if (!entryId || typeof entryId !== 'string') {
      console.warn('[Server Slack Webhook] Rejected: Missing or invalid "entryId"');
      return res.status(400).json({ error: 'Missing or invalid "entryId".' });
    }

    // If an intentional mode transition was completed by the user, clear the previous rate-limit record
    if (modeTransition) {
      console.log(`[Server Slack Webhook] Mode transition flagged for entryId="${entryId}". Clearing prior rate-limit lock.`);
      slackNotificationRateLimitCache.delete(entryId);
    }

    // Enforce rate limit: max one notification per entry save, no duplicate triggers within the same mode
    const rateLimitRecord = slackNotificationRateLimitCache.get(entryId);
    if (rateLimitRecord && rateLimitRecord.mode === mode) {
      console.log(`[Server Slack Webhook] Skipped: entryId="${entryId}" is already rate-limited in memory cache for mode="${mode}".`);
      return res.status(200).json({
        success: true,
        skipped: true,
        message: `Notification skipped: already dispatched for this entry in ${mode} mode (rate-limited).`,
      });
    }

    let webhookUrl: string;
    try {
      webhookUrl = getValidatedSlackWebhookUrl();
    } catch (urlErr: any) {
      return res.status(503).json({
        success: false,
        error: urlErr.message,
      });
    }

    // Friendly mode badges
    const modeLabelMap: Record<string, string> = {
      gratitude: '🌿 Gratitude',
      deep_thinking: '🧠 Deep Thinking',
      brainstorm: '💡 Brainstorming',
      reflection: '🪞 Reflection',
    };
    const modeDisplay = modeLabelMap[mode] || `Reflection (${sanitizeSlackContent(mode, 30)})`;

    // Strictly sanitize: clean plain text for headers, escaped mrkdwn for body, max 200 chars for excerpt
    const plainTitle = sanitizePlainText(entryTitle || 'Untitled Reflection', 80);
    const sanitizedTitle = sanitizeSlackContent(entryTitle || 'Untitled Reflection', 80);
    const sanitizedExcerpt = sanitizeSlackContent(excerpt || 'New journal reflection created.', 200);
    // Format timestamp explicitly in IST (Asia/Kolkata timezone)
    const formattedTimestamp =
      new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }) + ' IST';

    const payload = {
      text: `🔔 *New Journal Reflection: ${sanitizedTitle}*`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🔔 New Reflection: ${plainTitle}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Type:*\n${modeDisplay}`,
            },
            {
              type: 'mrkdwn',
              text: `*Saved At:*\n${formattedTimestamp}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Excerpt (Sanitized Preview):*\n>${sanitizedExcerpt}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `🔒 _Gemini Reflections • Zero full content leakage • Capped at ~200 chars_`,
            },
          ],
        },
      ],
    };

    console.log(`[Server Slack Webhook] Sending payload to Slack for entryId="${entryId}":`, JSON.stringify(payload, null, 2));

    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await slackResponse.text().catch(() => '');
    console.log(`[Server Slack Webhook] Slack response: HTTP ${slackResponse.status} - "${responseText}"`);

    if (!slackResponse.ok) {
      console.error(`[Slack Webhook] Delivery failed with HTTP ${slackResponse.status}:`, responseText);
      return res.status(502).json({
        success: false,
        error: `Slack rejected webhook with status ${slackResponse.status}: ${responseText}`,
      });
    }

    // Record rate limit record with mode and timestamp for this entry
    slackNotificationRateLimitCache.set(entryId, { mode, timestamp: Date.now() });

    return res.json({
      success: true,
      message: 'Slack notification dispatched successfully.',
    });
  } catch (error: any) {
    console.error('[Slack Webhook] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to dispatch Slack notification.',
    });
  }
});

// Gemini Reflection and Journaling Chat Endpoint
app.post('/api/gemini/reflect', async (req, res) => {
  try {
    // 2. Defensive Payload Ingestion (Null-Safe Destructuring)
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { messages, systemInstruction, mode } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request: "messages" array is required and must not be empty.',
      });
    }

    // Sanitize message objects
    const sanitizedMessages: MessagePart[] = messages
      .filter((m: any) => m && typeof m === 'object' && typeof m.content === 'string' && m.content.trim().length > 0)
      .map((m: any) => ({
        role: m.role === 'model' ? 'model' : 'user',
        content: String(m.content).trim(),
      }));

    if (sanitizedMessages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request: No valid non-empty messages provided.',
      });
    }

    const result = await generateContentWithFallback(
      sanitizedMessages,
      typeof systemInstruction === 'string' ? systemInstruction : undefined,
      typeof mode === 'string' ? mode : 'reflection'
    );

    return res.json({
      success: true,
      text: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error generating reflection:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate AI reflection response.',
    });
  }
});

// Quick Summary & Insights Generation
app.post('/api/gemini/summarize', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { content, title } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid request: "content" string is required.',
      });
    }

    const prompt = `Please analyze the following journal entry/reflection session:
Title: ${title || 'Untitled Session'}
Entry Content:
${content}

Provide a concise, thoughtful breakdown with:
1. **Core Theme & Key Takeaway** (1-2 sentences)
2. **Emotional & Mindset Insights** (Observed tone, mindset shifts, or underlying feelings)
3. **Actionable Suggestions / Next Steps** (2-3 realistic bullet points)
4. **Follow-Up Reflection Prompt** (A thought-provoking question for future entries)`;

    const result = await generateContentWithFallback(
      [{ role: 'user', content: prompt }],
      'You are an expert reflective analyst and mindfulness mentor.',
      'summary'
    );

    return res.json({
      success: true,
      summary: result.text,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error generating summary:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate summary.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
