import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import { MENTOR_SYSTEM_PROMPT, PERSONA_PROMPTS } from './prompts.js';

const app = express();
const port = Number(process.env.PORT) || 8787;
const corsOrigin = process.env.CORS_ORIGIN || '*';
const chatModel = process.env.OPENAI_MODEL || 'gpt-4.1';
const ttsModel = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const ttsFormat = process.env.OPENAI_TTS_FORMAT || 'mp3';
const ttsSpeed = Number(process.env.OPENAI_TTS_SPEED || '1') || 1;
const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

const VOICE_MAP = {
  mentor: process.env.OPENAI_VOICE_MENTOR || 'sage',
  skeptic: process.env.OPENAI_VOICE_SKEPTIC || 'onyx',
  historian: process.env.OPENAI_VOICE_HISTORIAN || 'ballad',
  pragmatist: process.env.OPENAI_VOICE_PRAGMATIST || 'nova'
};

const TTS_INSTRUCTIONS = {
  mentor:
    'Warm, academic mentor voice. Calm cadence, encouraging tone. End with a gentle inquisitive lift.',
  skeptic:
    'Crisp, analytical tone. Slightly skeptical, inquisitive, and direct. Keep it concise.',
  historian:
    'Measured, reflective tone with a scholarly cadence. Evoke historical context without dramatizing.',
  pragmatist:
    'Clear, practical tone. Confident and actionable, with a slight upbeat energy.'
};

app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((value) => value.trim())
  })
);
app.use(express.json({ limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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
    model: chatModel,
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

function getContentType(format) {
  if (format === 'wav') return 'audio/wav';
  if (format === 'aac') return 'audio/aac';
  if (format === 'flac') return 'audio/flac';
  if (format === 'opus') return 'audio/opus';
  return 'audio/mpeg';
}

async function writeTempFile(buffer, filename) {
  const tempPath = path.join(os.tmpdir(), filename);
  await fsp.writeFile(tempPath, buffer);
  return tempPath;
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

app.post('/api/tts', async (req, res) => {
  if (!ensureApiKey(res)) return;
  try {
    const { text, persona, voice } = req.body ?? {};
    const input = typeof text === 'string' ? text.trim() : '';
    if (!input) {
      res.status(400).json({ error: 'Missing text.' });
      return;
    }

    const selectedVoice = voice || VOICE_MAP[persona] || VOICE_MAP.mentor;
    const instructions = TTS_INSTRUCTIONS[persona] || TTS_INSTRUCTIONS.mentor;
    const clipped = input.slice(0, 4000);

    const speech = await client.audio.speech.create({
      model: ttsModel,
      voice: selectedVoice,
      input: clipped,
      response_format: ttsFormat,
      speed: ttsSpeed,
      instructions
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader('Content-Type', getContentType(ttsFormat));
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error?.message || 'TTS failed.' });
  }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!ensureApiKey(res)) return;
  let tempPath = '';
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing audio file.' });
      return;
    }
    const fileName = req.file.originalname || `audio-${Date.now()}.webm`;
    tempPath = await writeTempFile(req.file.buffer, fileName);
    const stream = fs.createReadStream(tempPath);

    const transcription = await client.audio.transcriptions.create({
      model: transcribeModel,
      file: stream,
      response_format: 'json'
    });

    res.json({ text: transcription?.text || '' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Transcription failed.' });
  } finally {
    if (tempPath) {
      await fsp.unlink(tempPath).catch(() => undefined);
    }
  }
});

app.listen(port, () => {
  console.log(`Reimagine Reading API running on http://localhost:${port}`);
});
