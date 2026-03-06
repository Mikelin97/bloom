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

export interface ReadingBook {
  id: string;
  title: string;
  author: string;
  chapterTitle: string;
  chapterSummary: string;
}
