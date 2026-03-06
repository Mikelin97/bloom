import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import OpenAI from 'openai';
import { Server as SocketIOServer } from 'socket.io';
import { MENTOR_SYSTEM_PROMPT, MENTOR_PROMPTS, PERSONA_PROMPTS } from './prompts.js';
import { classifyTurn } from './classify.js';
import {
  addMessage,
  createRoom,
  createRoomInvite,
  getRoom,
  getInvitePreview,
  isRoomHost,
  joinRoomViaInvite,
  joinRoom,
  leaveBySocket,
  listRooms,
  maxParticipants,
  updateReadingPosition
} from './rooms.js';
import { getBookById, listBooks } from './books.js';
import {
  checkModeratorRateLimit,
  ensureBookEmbeddings,
  generateModeratorResponse,
  queryRelevantPassages
} from './moderator.js';
import { registerVoiceRoutes } from './voice.js';
import { checkDatabaseReadiness } from './prisma.js';
import { checkRedisReadiness } from './redis.js';
import { registerPaymentRoutes } from './payments.js';
import { requireScholarForPrivateRooms, requireTier } from './middleware/requireTier.js';

const app = express();
const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST;
const corsOrigin = process.env.CORS_ORIGIN || '*';
const chatModel = process.env.OPENAI_MODEL || 'gpt-4.1';
const ttsModel = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const ttsFormat = process.env.OPENAI_TTS_FORMAT || 'mp3';
const ttsSpeed = Number(process.env.OPENAI_TTS_SPEED || '1.2') || 1.2;
const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
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
registerPaymentRoutes(app);
app.use(express.json({ limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
registerVoiceRoutes(app);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(3))
  });
});

app.get('/ready', async (_req, res) => {
  const checks = await Promise.all([checkDatabaseReadiness(), checkRedisReadiness()]);
  const hasFailure = checks.some((check) => check.status === 'error');

  res.status(hasFailure ? 503 : 200).json({
    status: hasFailure ? 'not_ready' : 'ready',
    timestamp: new Date().toISOString(),
    checks
  });
});

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

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

function buildContext(anchor, viewportText, conversationIndex) {
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
  if (typeof conversationIndex === 'string' && conversationIndex.trim()) {
    lines.push(`Prior conversation index (use only if relevant):\n${conversationIndex.trim()}`);
  }
  return lines.join('\n');
}

function buildRealtimeInstructions(anchor, viewportText, conversationIndex) {
  const context = buildContext(anchor, viewportText, conversationIndex);
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
  if (!process.env.OPENAI_API_KEY || !client) {
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

function getRoomPayload(room) {
  const book = getBookById(room.bookId);
  return {
    ...room,
    book: book || null,
    participantCount: room.participants.length,
    onlineCount: room.participants.filter((participant) => participant.online).length,
    maxParticipants: maxParticipants()
  };
}

function sanitizeMessageContent(content) {
  if (typeof content !== 'string') return '';
  return content.trim().slice(0, 1200);
}

function getAppBaseUrl(req) {
  return process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`;
}

app.get('/api/books', (_req, res) => {
  res.json({ books: listBooks() });
});

app.get('/api/rooms', (_req, res) => {
  const rooms = listRooms().map((room) => getRoomPayload(room));
  res.json({ rooms });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return;
  }
  res.json({ room: getRoomPayload(room) });
});

app.post('/api/rooms', requireScholarForPrivateRooms, (req, res) => {
  const { bookId, hostId, hostName, hostAvatarColor, isPrivate } = req.body ?? {};
  if (!bookId || !hostId || !hostName || !hostAvatarColor) {
    res.status(400).json({ error: 'Missing required room fields.' });
    return;
  }
  const book = getBookById(bookId);
  if (!book) {
    res.status(400).json({ error: 'Invalid bookId.' });
    return;
  }

  const room = createRoom({
    bookId,
    hostId,
    hostName,
    hostAvatarColor,
    isPrivate: isPrivate === true || isPrivate === 'true'
  });
  res.status(201).json({ room: getRoomPayload(room) });
});

app.post('/api/rooms/:roomId/invite', (req, res) => {
  const roomId = req.params.roomId;
  const requesterId = req.body?.userId;
  if (!requesterId) {
    res.status(401).json({ error: 'userId is required.' });
    return;
  }

  if (!isRoomHost({ roomId, userId: requesterId })) {
    res.status(403).json({ error: 'Only the room host can generate invite links.' });
    return;
  }

  const result = createRoomInvite({
    roomId,
    maxUses: req.body?.maxUses,
    expiresInHours: req.body?.expiresInHours
  });

  if (result.error || !result.invite) {
    res.status(404).json({ error: result.error || 'Unable to generate invite.' });
    return;
  }

  const appBaseUrl = getAppBaseUrl(req);
  res.status(201).json({
    invite: {
      ...result.invite,
      link: `${appBaseUrl}/join/${result.invite.code}`
    },
    room: getRoomPayload(result.room)
  });
});

app.get('/api/invite/:code', (req, res) => {
  const preview = getInvitePreview(req.params.code);
  if (preview.error || !preview.room || !preview.invite) {
    res.status(404).json({ error: preview.error || 'Invite not found.' });
    return;
  }

  const book = getBookById(preview.room.bookId);
  const host = preview.room.participants.find((participant) => participant.isHost);

  res.json({
    invite: {
      code: preview.invite.code,
      expiresAt: preview.invite.expiresAt,
      maxUses: preview.invite.maxUses,
      uses: preview.invite.uses,
      remainingUses: preview.remainingUses
    },
    room: {
      id: preview.room.id,
      bookId: preview.room.bookId,
      book: book || null,
      host: host
        ? {
            id: host.id,
            displayName: host.displayName,
            avatarColor: host.avatarColor
          }
        : null,
      participantCount: preview.room.participants.length,
      maxParticipants: maxParticipants(),
      isPrivate: preview.room.isPrivate,
      createdAt: preview.room.createdAt
    }
  });
});

app.post('/api/invite/:code/join', (req, res) => {
  const { participantId, displayName, avatarColor } = req.body ?? {};
  const joined = joinRoomViaInvite({
    code: req.params.code,
    participantId,
    displayName,
    avatarColor
  });

  if (joined.error || !joined.room || !joined.participant) {
    const status =
      joined.error === 'Room is full.'
        ? 409
        : joined.error === 'Invite is invalid or expired.'
          ? 404
          : 400;
    res.status(status).json({ error: joined.error || 'Failed to join via invite.' });
    return;
  }

  res.json({
    room: getRoomPayload(joined.room),
    participant: joined.participant,
    alreadyMember: joined.alreadyMember
  });
});

app.post('/api/moderator/embed', async (req, res) => {
  try {
    const { bookId } = req.body ?? {};
    if (!bookId) {
      res.status(400).json({ error: 'bookId is required.' });
      return;
    }

    const store = await ensureBookEmbeddings({
      bookId,
      client,
      apiKey: process.env.OPENAI_API_KEY,
      embeddingModel
    });

    res.json({
      bookId,
      generatedAt: store.generatedAt,
      passageCount: store.passages.length
    });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Embedding generation failed.' });
  }
});

app.post('/api/moderator/query', async (req, res) => {
  try {
    const { bookId, conversation, topK } = req.body ?? {};
    if (!bookId) {
      res.status(400).json({ error: 'bookId is required.' });
      return;
    }

    const passages = await queryRelevantPassages({
      bookId,
      conversationText: typeof conversation === 'string' ? conversation : '',
      topK: typeof topK === 'number' ? topK : 3,
      client,
      apiKey: process.env.OPENAI_API_KEY,
      embeddingModel
    });
    res.json({ passages });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Passage query failed.' });
  }
});

app.post('/api/moderator/respond', requireTier('SCHOLAR'), async (req, res) => {
  try {
    const { roomId, conversation } = req.body ?? {};
    if (!roomId) {
      res.status(400).json({ error: 'roomId is required.' });
      return;
    }

    const room = getRoom(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const limit = checkModeratorRateLimit(roomId, 30_000);
    if (!limit.allowed) {
      res.status(429).json({ error: 'Moderator is cooling down.', retryAfterMs: limit.remainingMs });
      return;
    }

    const conversationText = Array.isArray(conversation)
      ? conversation.map((item) => `${item.participantName || item.role || 'Reader'}: ${item.content || ''}`).join('\n')
      : '';

    const passages = await queryRelevantPassages({
      bookId: room.bookId,
      conversationText,
      topK: 3,
      client,
      apiKey: process.env.OPENAI_API_KEY,
      embeddingModel
    });

    const response = await generateModeratorResponse({
      room,
      conversation,
      passages,
      client,
      apiKey: process.env.OPENAI_API_KEY,
      chatModel
    });

    const message = addMessage({
      roomId,
      participantId: 'moderator',
      participantName: 'Bloom Moderator',
      content: response.content,
      anchorParagraph: response.anchorParagraph,
      type: 'moderator'
    });

    if (!message) {
      res.status(500).json({ error: 'Unable to append moderator message.' });
      return;
    }

    if (globalThis.__bloomIo) {
      globalThis.__bloomIo.to(roomId).emit('chat:message', message);
    }

    res.json({ message, passages });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Moderator response failed.' });
  }
});

app.post('/api/mentor', async (req, res) => {
  if (!ensureApiKey(res)) return;
  try {
    const { messages, anchor, viewportText, conversationIndex } = req.body ?? {};
    const normalized = normalizeMessages(messages);
    const lastUserMsg = [...normalized].reverse().find((m) => m.role === 'user')?.content || '';
    const turnType = classifyTurn(lastUserMsg, normalized.length);
    const systemPrompt = MENTOR_PROMPTS[turnType] || MENTOR_PROMPTS.explain;
    const context = buildContext(anchor, viewportText, conversationIndex);
    const input = [
      { role: 'system', content: systemPrompt },
      { role: 'developer', content: context },
      ...normalized
    ];
    await streamResponse(res, { input, temperature: 0.4 });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Server error.' });
  }
});

app.post('/api/roundtable', async (req, res) => {
  if (!ensureApiKey(res)) return;
  try {
    const { persona, messages, anchor, viewportText, conversationIndex } = req.body ?? {};
    const normalized = normalizeMessages(messages);
    const lastUserMsg = [...normalized].reverse().find((m) => m.role === 'user')?.content || '';
    const turnType = classifyTurn(lastUserMsg, normalized.length);
    const personaSet = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.skeptic;
    const prompt = turnType === 'explain' ? personaSet.explain : personaSet.conversational;
    const context = buildContext(anchor, viewportText, conversationIndex);
    const input = [
      { role: 'system', content: prompt },
      { role: 'developer', content: context },
      ...normalized
    ];
    await streamResponse(res, { input, temperature: 0.7 });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Server error.' });
  }
});

app.post('/api/realtime-token', requireTier('SCHOLAR'), async (req, res) => {
  if (!ensureApiKey(res)) return;
  try {
    const { anchor, viewportText, conversationIndex, mode } = req.body ?? {};
    const instructions = buildRealtimeInstructions(anchor, viewportText, conversationIndex);
    const allowResponses = mode !== 'ROUND_TABLE';
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
                create_response: allowResponses,
                interrupt_response: allowResponses
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

app.post('/api/tts', requireTier('SCHOLAR'), async (req, res) => {
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

app.post('/api/transcribe', requireTier('SCHOLAR'), upload.single('audio'), async (req, res) => {
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
const server = httpsOptions ? https.createServer(httpsOptions, app) : http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((value) => value.trim())
  }
});

globalThis.__bloomIo = io;

function emitPresence(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  io.to(roomId).emit('presence:update', {
    roomId,
    participants: room.participants,
    onlineCount: room.participants.filter((participant) => participant.online).length
  });
}

io.on('connection', (socket) => {
  socket.emit('socket:connected', {
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  socket.on('room:join', (payload, callback) => {
    const roomId = payload?.roomId;
    const participantId = payload?.participantId;
    const displayName = payload?.displayName;
    const avatarColor = payload?.avatarColor;

    if (!roomId || !participantId || !displayName || !avatarColor) {
      callback?.({ error: 'Missing join fields.' });
      return;
    }

    const joined = joinRoom({
      roomId,
      participantId,
      displayName,
      avatarColor,
      socketId: socket.id
    });

    if (joined.error || !joined.room || !joined.participant) {
      callback?.({ error: joined.error || 'Unable to join room.' });
      return;
    }

    socket.join(roomId);

    const joinedNotice = addMessage({
      roomId,
      participantId: 'system',
      participantName: 'System',
      content: `${joined.participant.displayName} joined the reading room.`,
      type: 'system'
    });

    socket.emit('room:state', {
      room: getRoomPayload(joined.room)
    });
    emitPresence(roomId);
    if (joinedNotice) {
      io.to(roomId).emit('chat:message', joinedNotice);
    }

    callback?.({ ok: true, room: getRoomPayload(joined.room), maxParticipants: maxParticipants() });
  });

  socket.on('chat:send', (payload, callback) => {
    const roomId = payload?.roomId;
    const participantId = payload?.participantId;
    const participantName = payload?.participantName;
    const content = sanitizeMessageContent(payload?.content);
    const anchorParagraph = payload?.anchorParagraph || null;

    if (!roomId || !participantId || !content) {
      callback?.({ error: 'Invalid message payload.' });
      return;
    }

    const room = getRoom(roomId);
    if (!room) {
      callback?.({ error: 'Room not found.' });
      return;
    }

    const message = addMessage({
      roomId,
      participantId,
      participantName,
      content,
      anchorParagraph,
      type: 'chat'
    });

    if (!message) {
      callback?.({ error: 'Unable to send message.' });
      return;
    }

    io.to(roomId).emit('chat:message', message);
    callback?.({ ok: true, message });
  });

  socket.on('chat:typing', (payload) => {
    const roomId = payload?.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('chat:typing', {
      roomId,
      participantId: payload?.participantId,
      participantName: payload?.participantName,
      isTyping: Boolean(payload?.isTyping)
    });
  });

  socket.on('reader:position', (payload) => {
    const roomId = payload?.roomId;
    const participantId = payload?.participantId;
    if (!roomId || !participantId) return;
    updateReadingPosition({
      roomId,
      participantId,
      paragraphId: payload?.paragraphId || null
    });
    emitPresence(roomId);
  });

  socket.on('disconnect', () => {
    const result = leaveBySocket(socket.id);
    if (!result?.roomId || !result.participant) {
      return;
    }

    const leftNotice = addMessage({
      roomId: result.roomId,
      participantId: 'system',
      participantName: 'System',
      content: `${result.participant.displayName} left the reading room.`,
      type: 'system'
    });

    emitPresence(result.roomId);
    if (leftNotice) {
      io.to(result.roomId).emit('chat:message', leftNotice);
    }
  });
});

server.listen(port, listenHost, () => {
  console.log(
    `Reimagine Reading API running on ${protocol}://${displayHost}:${port} (listening on ${
      listenHost || '0.0.0.0'
    })`
  );
});
