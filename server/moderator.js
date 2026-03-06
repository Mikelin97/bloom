import { getBookById, getBookParagraphs } from './books.js';

const embeddingCache = new Map();
const moderatorRateLimits = new Map();

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function keywordScore(query, text) {
  const queryTokens = tokenize(query);
  const textTokens = tokenize(text);
  let matches = 0;
  queryTokens.forEach((token) => {
    if (textTokens.has(token)) {
      matches += 1;
    }
  });
  return matches;
}

function formatConversation(conversation) {
  if (!Array.isArray(conversation)) return '';
  return conversation
    .slice(-8)
    .map((entry) => `${entry.participantName || entry.role || 'Reader'}: ${entry.content || ''}`)
    .join('\n');
}

export async function ensureBookEmbeddings({ bookId, client, apiKey, embeddingModel }) {
  const cached = embeddingCache.get(bookId);
  if (cached) {
    return cached;
  }

  const passages = getBookParagraphs(bookId);
  const base = {
    bookId,
    generatedAt: new Date().toISOString(),
    passages: passages.map((passage) => ({
      paragraphId: passage.id,
      text: passage.text,
      embedding: null
    }))
  };

  if (!apiKey || !client || passages.length === 0) {
    embeddingCache.set(bookId, base);
    return base;
  }

  const embeddings = await client.embeddings.create({
    model: embeddingModel,
    input: passages.map((passage) => passage.text)
  });

  base.passages = base.passages.map((passage, index) => ({
    ...passage,
    embedding: embeddings.data[index]?.embedding || null
  }));

  embeddingCache.set(bookId, base);
  return base;
}

export async function queryRelevantPassages({
  bookId,
  conversationText,
  topK = 3,
  client,
  apiKey,
  embeddingModel
}) {
  const store = await ensureBookEmbeddings({ bookId, client, apiKey, embeddingModel });
  if (!store.passages.length) return [];

  if (apiKey && client && store.passages[0]?.embedding) {
    const queryEmbedding = await client.embeddings.create({
      model: embeddingModel,
      input: conversationText || 'philosophy discussion'
    });
    const queryVector = queryEmbedding.data[0]?.embedding;
    return store.passages
      .map((passage) => ({
        ...passage,
        score: cosineSimilarity(queryVector, passage.embedding)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  return store.passages
    .map((passage) => ({
      ...passage,
      score: keywordScore(conversationText || '', passage.text)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export function checkModeratorRateLimit(roomId, cooldownMs = 30_000) {
  const now = Date.now();
  const last = moderatorRateLimits.get(roomId) || 0;
  const remaining = cooldownMs - (now - last);
  if (remaining > 0) {
    return { allowed: false, remainingMs: remaining };
  }
  moderatorRateLimits.set(roomId, now);
  return { allowed: true, remainingMs: 0 };
}

export async function generateModeratorResponse({
  room,
  conversation,
  passages,
  client,
  apiKey,
  chatModel
}) {
  const book = getBookById(room.bookId);
  const context = passages
    .map(
      (passage, index) =>
        `(${index + 1}) [${passage.paragraphId}] ${passage.text.slice(0, 360)}${
          passage.text.length > 360 ? '…' : ''
        }`
    )
    .join('\n');
  const conversationText = formatConversation(conversation);

  if (!apiKey || !client) {
    const suggestion = passages[0]
      ? `Consider paragraph ${passages[0].paragraphId}: "${passages[0].text.slice(0, 160)}…"`
      : 'Can someone share which passage feels most surprising right now?';
    return {
      content: `I hear a rich thread emerging. ${suggestion} What assumption is being challenged for each of you?`,
      anchorParagraph: passages[0]?.paragraphId || null
    };
  }

  const response = await client.responses.create({
    model: chatModel,
    temperature: 0.6,
    input: [
      {
        role: 'system',
        content:
          'You are Bloom Moderator, a wise facilitator in a social reading club. Keep responses under 120 words, cite one relevant paragraph id from context, and ask one probing follow-up question.'
      },
      {
        role: 'developer',
        content: `Book: ${book?.title || room.bookId} by ${book?.author || 'Unknown'}\nContext passages:\n${context}`
      },
      {
        role: 'user',
        content: `Conversation:\n${conversationText}`
      }
    ]
  });

  const content = response.output_text || 'What deeper tension do you all notice in this passage?';
  const matchedAnchor = passages.find((passage) => content.includes(passage.paragraphId));

  return {
    content,
    anchorParagraph: matchedAnchor?.paragraphId || passages[0]?.paragraphId || null
  };
}
