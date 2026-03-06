import { customAlphabet } from 'nanoid';

const MAX_PARTICIPANTS = 6;
const DEFAULT_INVITE_MAX_USES = 50;
const DEFAULT_INVITE_TTL_HOURS = 72;
const INVITE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map();
const invites = new Map();
const roomInviteIndex = new Map();
const socketMembership = new Map();
const createInviteCode = customAlphabet(INVITE_ALPHABET, 8);

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addHoursToNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function isInviteExpired(invite) {
  return new Date(invite.expiresAt).getTime() <= Date.now();
}

function hasInviteCapacity(invite) {
  return invite.uses < invite.maxUses;
}

function cleanupInvite(code) {
  const invite = invites.get(code);
  if (!invite) return;

  invites.delete(code);
  roomInviteIndex.delete(invite.roomId);

  const room = rooms.get(invite.roomId);
  if (room && room.inviteCode === code) {
    room.inviteCode = null;
  }
}

function getActiveInvite(code) {
  const invite = invites.get(code);
  if (!invite) {
    return null;
  }

  if (isInviteExpired(invite) || !hasInviteCapacity(invite)) {
    cleanupInvite(code);
    return null;
  }

  return invite;
}

function upsertParticipant({
  room,
  participantId,
  displayName,
  avatarColor,
  online,
  preserveExistingOnline = false
}) {
  let participant = room.participants.find((entry) => entry.id === participantId);
  const created = !participant;

  if (!participant) {
    if (room.participants.length >= MAX_PARTICIPANTS) {
      return { error: 'Room is full.' };
    }
    participant = {
      id: participantId,
      displayName,
      avatarColor,
      isHost: false,
      joinedAt: nowIso(),
      online,
      currentParagraph: null
    };
    room.participants.push(participant);
  } else {
    participant.displayName = displayName;
    participant.avatarColor = avatarColor;
    if (!preserveExistingOnline) {
      participant.online = online;
    }
  }

  return { participant, created };
}

function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createInviteCode();
    if (!invites.has(code)) {
      return code;
    }
  }
  throw new Error('Failed to generate a unique invite code.');
}

export function createRoom({ bookId, hostId, hostName, hostAvatarColor, isPrivate = false }) {
  const createdAt = nowIso();
  const room = {
    id: createId('room'),
    bookId,
    inviteCode: null,
    isPrivate: Boolean(isPrivate),
    participants: [
      {
        id: hostId,
        displayName: hostName,
        avatarColor: hostAvatarColor,
        isHost: true,
        joinedAt: createdAt,
        online: false,
        currentParagraph: null
      }
    ],
    messages: [],
    createdAt,
    status: 'active'
  };
  rooms.set(room.id, room);
  return room;
}

export function listRooms() {
  return Array.from(rooms.values());
}

export function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

export function isRoomHost({ roomId, userId }) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const host = room.participants.find((entry) => entry.isHost);
  return host?.id === userId;
}

export function createRoomInvite({ roomId, maxUses, expiresInHours } = {}) {
  const room = rooms.get(roomId);
  if (!room) {
    return { error: 'Room not found.' };
  }

  const activeCode = roomInviteIndex.get(roomId);
  if (activeCode) {
    cleanupInvite(activeCode);
  }

  const normalizedMaxUses = Number(maxUses);
  const normalizedExpiryHours = Number(expiresInHours);

  const invite = {
    id: createId('invite'),
    roomId,
    code: generateUniqueInviteCode(),
    expiresAt: addHoursToNow(
      Number.isFinite(normalizedExpiryHours) && normalizedExpiryHours > 0
        ? normalizedExpiryHours
        : DEFAULT_INVITE_TTL_HOURS
    ),
    maxUses:
      Number.isFinite(normalizedMaxUses) && normalizedMaxUses > 0
        ? Math.floor(normalizedMaxUses)
        : DEFAULT_INVITE_MAX_USES,
    uses: 0,
    createdAt: nowIso()
  };

  invites.set(invite.code, invite);
  roomInviteIndex.set(roomId, invite.code);
  room.inviteCode = invite.code;

  return { invite, room };
}

export function getInvitePreview(code) {
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!normalized) {
    return { error: 'Invite code is required.' };
  }

  const invite = getActiveInvite(normalized);
  if (!invite) {
    return { error: 'Invite is invalid or expired.' };
  }

  const room = rooms.get(invite.roomId);
  if (!room) {
    cleanupInvite(normalized);
    return { error: 'Room not found.' };
  }

  return {
    invite,
    room,
    remainingUses: Math.max(0, invite.maxUses - invite.uses)
  };
}

export function joinRoomViaInvite({ code, participantId, displayName, avatarColor }) {
  if (!participantId || !displayName || !avatarColor) {
    return { error: 'Missing participant fields.' };
  }

  const preview = getInvitePreview(code);
  if (preview.error || !preview.invite || !preview.room) {
    return { error: preview.error || 'Invite is invalid or expired.' };
  }

  const { participant, created, error } = upsertParticipant({
    room: preview.room,
    participantId,
    displayName,
    avatarColor,
    online: false,
    preserveExistingOnline: true
  });

  if (error || !participant) {
    return { error: error || 'Unable to join room via invite.' };
  }

  if (created) {
    preview.invite.uses += 1;
    if (!hasInviteCapacity(preview.invite)) {
      cleanupInvite(preview.invite.code);
    }
  }

  return {
    room: preview.room,
    participant,
    invite: preview.invite,
    alreadyMember: !created
  };
}

export function joinRoom({ roomId, participantId, displayName, avatarColor, socketId }) {
  const room = rooms.get(roomId);
  if (!room) {
    return { error: 'Room not found.' };
  }

  const { participant, error } = upsertParticipant({
    room,
    participantId,
    displayName,
    avatarColor,
    online: true
  });

  if (error || !participant) {
    return { error: error || 'Unable to join room.' };
  }

  if (socketId) {
    socketMembership.set(socketId, { roomId, participantId });
  }

  return { room, participant };
}

export function leaveBySocket(socketId) {
  const membership = socketMembership.get(socketId);
  if (!membership) {
    return null;
  }
  socketMembership.delete(socketId);

  const room = rooms.get(membership.roomId);
  if (!room) {
    return null;
  }

  const participant = room.participants.find((entry) => entry.id === membership.participantId);
  if (!participant) {
    return null;
  }

  participant.online = false;

  return {
    room,
    participant,
    roomId: membership.roomId,
    participantId: membership.participantId
  };
}

export function addMessage({
  roomId,
  participantId,
  content,
  anchorParagraph,
  type = 'chat',
  participantName
}) {
  const room = rooms.get(roomId);
  if (!room) {
    return null;
  }

  const message = {
    id: createId('msg'),
    participantId,
    participantName,
    content,
    type,
    anchorParagraph: anchorParagraph || null,
    timestamp: nowIso()
  };

  room.messages.push(message);
  if (room.messages.length > 300) {
    room.messages.splice(0, room.messages.length - 300);
  }

  return message;
}

export function updateReadingPosition({ roomId, participantId, paragraphId }) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const participant = room.participants.find((entry) => entry.id === participantId);
  if (!participant) return null;
  participant.currentParagraph = paragraphId || null;
  return participant;
}

export function upsertRoom(room) {
  rooms.set(room.id, room);
}

export function maxParticipants() {
  return MAX_PARTICIPANTS;
}
