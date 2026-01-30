import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { MENTOR_SYSTEM_PROMPT, PERSONA_PROMPTS } from './prompts.js';

const app = express();
const port = Number(process.env.PORT) || 8787;
const corsOrigin = process.env.CORS_ORIGIN || '*';
const model = process.env.OPENAI_MODEL || 'gpt-4.1';

app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((value) => value.trim())
  })
);
app.use(express.json({ limit: '1mb' }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function sendEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildContext(anchor, viewportText) {
  const lines = [];
  if (anchor?.bookTitle) {
    const author = anchor.author ? ` by ${anchor.author}` : '';
    lines.push(`Book: ${anchor.bookTitle}${author}`);
  }
  if (anchor?.chapterTitle) {
    lines.push(`Chapter: ${anchor.chapterTitle}`);
  }
  if (anchor?.chapterSummary) {
    lines.push(`Chapter summary: ${anchor.chapterSummary}`);
  }
  if (viewportText) {
    lines.push(`Visible text: ${viewportText}`);
  }
  if (anchor?.text) {
    lines.push(`Anchor passage: ${anchor.text}`);
  }
  return lines.join('\n');
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message.content === 'string')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content.trim()
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);
}

async function streamResponse(res, { input, temperature }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  const stream = await client.responses.create({
    model,
    input,
    temperature,
    stream: true
  });

  for await (const event of stream) {
    if (res.writableEnded) {
      break;
    }
    if (event.type === 'response.output_text.delta') {
      sendEvent(res, { type: 'delta', delta: event.delta });
    }
    if (event.type === 'error' || event.type === 'response.error') {
      sendEvent(res, { type: 'error', message: event.error?.message || 'Streaming error.' });
    }
  }

  if (!res.writableEnded) {
    sendEvent(res, { type: 'done' });
    res.end();
  }
}

function ensureApiKey(res) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'Missing OPENAI_API_KEY.' });
    return false;
  }
  return true;
}

app.post('/api/mentor', async (req, res) => {
  if (!ensureApiKey(res)) return;
  try {
    const { messages, anchor, viewportText } = req.body ?? {};
    const context = buildContext(anchor, viewportText);
    const input = [
      { role: 'system', content: MENTOR_SYSTEM_PROMPT },
      { role: 'developer', content: context },
      ...normalizeMessages(messages)
    ];
    await streamResponse(res, { input, temperature: 0.4 });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Server error.' });
  }
});

app.post('/api/roundtable', async (req, res) => {
  if (!ensureApiKey(res)) return;
  try {
    const { persona, messages, anchor, viewportText } = req.body ?? {};
    const prompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.skeptic;
    const context = buildContext(anchor, viewportText);
    const input = [
      { role: 'system', content: prompt },
      { role: 'developer', content: context },
      ...normalizeMessages(messages)
    ];
    await streamResponse(res, { input, temperature: 0.7 });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Server error.' });
  }
});

app.listen(port, () => {
  console.log(`Reimagine Reading API running on http://localhost:${port}`);
});
