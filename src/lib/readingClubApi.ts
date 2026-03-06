import type { ChatMessage, ReadingBook, ReadingRoom } from '../types/readingSession';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchBooks() {
  return request<{ books: ReadingBook[] }>('/api/books');
}

export async function fetchRooms() {
  return request<{ rooms: ReadingRoom[] }>('/api/rooms');
}

export async function fetchRoom(roomId: string) {
  return request<{ room: ReadingRoom }>(`/api/rooms/${roomId}`);
}

export async function createReadingRoom(payload: {
  bookId: string;
  hostId: string;
  hostName: string;
  hostAvatarColor: string;
}) {
  return request<{ room: ReadingRoom }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function requestModeratorReply(payload: {
  roomId: string;
  conversation: ChatMessage[];
}) {
  return request<{ message: ChatMessage; passages: Array<{ paragraphId: string; text: string }> }>(
    '/api/moderator/respond',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}
