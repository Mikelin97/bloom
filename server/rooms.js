const MAX_PARTICIPANTS = 6;

const rooms = new Map();
const socketMembership = new Map();

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

export function createRoom({ bookId, hostId, hostName, hostAvatarColor }) {
  const createdAt = now();
  const room = {
    id: createId('room'),
    bookId,
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

export function joinRoom({ roomId, participantId, displayName, avatarColor, socketId }) {
  const room = rooms.get(roomId);
  if (!room) {
    return { error: 'Room not found.' };
  }

  let participant = room.participants.find((entry) => entry.id === participantId);
  if (!participant) {
    if (room.participants.length >= MAX_PARTICIPANTS) {
      return { error: 'Room is full.' };
    }
    participant = {
      id: participantId,
      displayName,
      avatarColor,
      isHost: false,
      joinedAt: now(),
      online: true,
      currentParagraph: null
    };
    room.participants.push(participant);
  } else {
    participant.displayName = displayName;
    participant.avatarColor = avatarColor;
    participant.online = true;
  }

  socketMembership.set(socketId, { roomId, participantId });
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
    timestamp: now()
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
