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
  });
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
