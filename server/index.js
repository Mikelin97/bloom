import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import { MENTOR_SYSTEM_PROMPT, PERSONA_PROMPTS } from './prompts.js';

const app = express();
const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST;
const corsOrigin = process.env.CORS_ORIGIN || '*';
const chatModel = process.env.OPENAI_MODEL || 'gpt-4.1';
const ttsModel = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const ttsFormat = process.env.OPENAI_TTS_FORMAT || 'mp3';
const ttsSpeed = Number(process.env.OPENAI_TTS_SPEED || '1.2') || 1.2;
const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const realtimeModel =
  process.env.OPENAI_REALTIME_MODEL ||
  process.env.OPENAI_VOICE_MODEL ||
  'gpt-4o-realtime-preview';
const realtimeVoice =
  process.env.OPENAI_REALTIME_VOICE || process.env.OPENAI_VOICE_MENTOR || 'sage';
const realtimeSpeed =
  Number(process.env.OPENAI_REALTIME_SPEED || process.env.OPENAI_TTS_SPEED || '1.2') || 1.2;

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

function getHttpsOptions() {
  const keyPath = process.env.HTTPS_KEY;
  const certPath = process.env.HTTPS_CERT;
  if (!keyPath || !certPath) return null;
  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);
  const caPath = process.env.HTTPS_CA;
  const ca = caPath ? fs.readFileSync(caPath) : undefined;
  return ca ? { key, cert, ca } : { key, cert };
}

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

function buildRealtimeInstructions(anchor, viewportText) {
  const context = buildContext(anchor, viewportText);
  const englishGuide = 'Respond in English.';
  if (!context) return `${englishGuide}\n${MENTOR_SYSTEM_PROMPT}`;
  return `${englishGuide}\n${MENTOR_SYSTEM_PROMPT}\n\n${context}`;
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

app.post('/api/realtime-token', async (req, res) => {
  if (!ensureApiKey(res)) return;
  try {
    const { anchor, viewportText } = req.body ?? {};
    const instructions = buildRealtimeInstructions(anchor, viewportText);
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: realtimeModel,
          instructions,
          audio: {
            input: {
              transcription: {
                model: transcribeModel,
                language: 'en'
              },
              turn_detection: {
                type: 'server_vad',
                create_response: true,
                interrupt_response: true
              }
            },
            output: {
              voice: realtimeVoice,
              speed: realtimeSpeed
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(500).json({ error: `Realtime token failed: ${response.status} ${errorText}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Realtime token failed.' });
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

const httpsOptions = getHttpsOptions();
const protocol = httpsOptions ? 'https' : 'http';
const displayHost = host || 'localhost';
const listenHost = host || undefined;

if (httpsOptions) {
  https.createServer(httpsOptions, app).listen(port, listenHost, () => {
    console.log(
      `Reimagine Reading API running on ${protocol}://${displayHost}:${port} (listening on ${
        listenHost || '0.0.0.0'
      })`
    );
  });
} else {
  app.listen(port, listenHost, () => {
    console.log(
      `Reimagine Reading API running on ${protocol}://${displayHost}:${port} (listening on ${
        listenHost || '0.0.0.0'
      })`
    );
  });
}
