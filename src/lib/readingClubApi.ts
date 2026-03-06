import type {
  ChatMessage,
  InviteRoomPreview,
  ReadingBook,
  ReadingRoom,
  RoomInvite
} from '../types/readingSession';

export type SubscriptionTier = 'FREE' | 'SCHOLAR' | 'INSTITUTION';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  subscriptionId: string | null;
  stripeCustomerId: string | null;
}

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
  isPrivate?: boolean;
}) {
  return request<{ room: ReadingRoom }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function requestModeratorReply(payload: {
  roomId: string;
  conversation: ChatMessage[];
  userId: string;
  email?: string;
}) {
  return request<{ message: ChatMessage; passages: Array<{ paragraphId: string; text: string }> }>(
    '/api/moderator/respond',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function generateRoomInvite(
  roomId: string,
  payload: { userId: string; maxUses?: number; expiresInHours?: number }
) {
  return request<{ invite: RoomInvite; room: ReadingRoom }>(`/api/rooms/${roomId}/invite`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchInvitePreview(code: string) {
  return request<{ invite: RoomInvite; room: InviteRoomPreview }>(`/api/invite/${code}`);
}

export async function joinRoomByInvite(
  code: string,
  payload: { participantId: string; displayName: string; avatarColor: string }
) {
  return request<{ room: ReadingRoom; alreadyMember: boolean }>(`/api/invite/${code}/join`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createCheckoutSession(payload: {
  userId: string;
  email: string;
  name?: string;
  tier: Exclude<SubscriptionTier, 'FREE'>;
}) {
  return request<{ sessionId: string; url: string }>('/api/checkout', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchSubscription(payload: { userId: string; email?: string }) {
  const params = new URLSearchParams();
  params.set('userId', payload.userId);
  if (payload.email) {
    params.set('email', payload.email);
  }
  return request<{ subscription: SubscriptionStatus }>(`/api/subscription?${params.toString()}`);
}

export async function createBillingPortalSession(payload: { userId: string; email?: string }) {
  return request<{ url: string }>('/api/billing-portal', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
