export interface Participant {
  id: string;
  displayName: string;
  avatarColor: string;
  isHost: boolean;
  joinedAt: string;
  online: boolean;
  currentParagraph: string | null;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  participantName: string;
  content: string;
  timestamp: string;
  anchorParagraph?: string | null;
  type?: 'chat' | 'system' | 'moderator';
}

export interface ReadingRoom {
  id: string;
  bookId: string;
  inviteCode?: string | null;
  isPrivate?: boolean;
  participants: Participant[];
  messages: ChatMessage[];
  createdAt: string;
  status: 'active' | 'archived';
  participantCount: number;
  onlineCount: number;
  maxParticipants: number;
  book: {
    id: string;
    title: string;
    author: string;
    chapterTitle: string;
    chapterSummary: string;
  } | null;
}

export interface RoomInvite {
  id?: string;
  roomId?: string;
  code: string;
  link?: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  remainingUses?: number;
}

export interface InviteRoomPreview {
  id: string;
  bookId: string;
  participantCount: number;
  maxParticipants: number;
  isPrivate: boolean;
  createdAt: string;
  host: {
    id: string;
    displayName: string;
    avatarColor: string;
  } | null;
  book: {
    id: string;
    title: string;
    author: string;
    chapterTitle: string;
    chapterSummary: string;
  } | null;
}

export interface ReadingBook {
  id: string;
  title: string;
  author: string;
  chapterTitle: string;
  chapterSummary: string;
}
