import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import { fetchRoom, requestModeratorReply } from '../lib/readingClubApi';
import { createReadingClubSocket } from '../lib/readingClubSocket';
import type { ChatMessage, Participant, ReadingRoom } from '../types/readingSession';
import { useAuth } from '../contexts/AuthContext';
import { getReaderContentById } from '../content/library';
import { useUiTheme } from '../hooks/useUiTheme';

type MobilePanel = 'reader' | 'chat';

function formatClock(value: string) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ReadingRoom() {
  const { roomId = '' } = useParams();
  const { user, nickname, avatarColor } = useAuth();

  const [room, setRoom] = useState<ReadingRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [leftWidth, setLeftWidth] = useState(60);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('reader');

  const [messageInput, setMessageInput] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [moderatorLoading, setModeratorLoading] = useState(false);
  const [lastModeratorCallAt, setLastModeratorCallAt] = useState(0);
  const [showModeratorSuggestion, setShowModeratorSuggestion] = useState(false);
  const { theme, toggleTheme } = useUiTheme();

  const socketRef = useRef<ReturnType<typeof createReadingClubSocket> | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const paragraphRefs = useRef<Map<string, HTMLParagraphElement>>(new Map());
  const visibleParagraphs = useRef<Set<string>>(new Set());
  const lastSharedParagraph = useRef<string | null>(null);
  const lastActivityAt = useRef(Date.now());

  const me = useMemo(
    () => ({
      id: user?.uid || '',
      name: nickname || user?.displayName || 'Reader',
      avatarColor
    }),
    [avatarColor, nickname, user]
  );

  const content = useMemo(() => getReaderContentById(room?.bookId), [room?.bookId]);
  const moderatorCooldownMs = Math.max(0, 30_000 - (Date.now() - lastModeratorCallAt));

  const updateMessages = (nextMessage: ChatMessage) => {
    setMessages((previous) => {
      if (previous.some((message) => message.id === nextMessage.id)) {
        return previous;
      }
      return [...previous, nextMessage];
    });
    lastActivityAt.current = Date.now();
    setShowModeratorSuggestion(false);
  };

  useEffect(() => {
    if (!roomId) {
      setError('Missing room id.');
      setLoading(false);
      return;
    }

    let active = true;

    const loadRoom = async () => {
      setLoading(true);
      try {
        const payload = await fetchRoom(roomId);
        if (!active) return;
        setRoom(payload.room);
        setMessages(payload.room.messages || []);
        setParticipants(payload.room.participants || []);
        setError('');
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load room.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    loadRoom();
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !me.id) {
      return;
    }

    const socket = createReadingClubSocket();
    socketRef.current = socket;

    socket.on('room:state', (payload: { room: ReadingRoom }) => {
      setRoom(payload.room);
      setParticipants(payload.room.participants || []);
      setMessages(payload.room.messages || []);
    });

    socket.on('presence:update', (payload: { participants: Participant[] }) => {
      setParticipants(payload.participants || []);
    });

    socket.on('chat:message', (payload: ChatMessage) => {
      updateMessages(payload);
    });

    socket.on('chat:typing', (payload: { participantId: string; participantName: string; isTyping: boolean }) => {
      if (!payload?.participantId || payload.participantId === me.id) {
        return;
      }

      setTypingUsers((previous) => {
        const next = { ...previous };
        if (payload.isTyping) {
          next[payload.participantId] = payload.participantName;
        } else {
          delete next[payload.participantId];
        }
        return next;
      });
    });

    socket.emit(
      'room:join',
      {
        roomId,
        participantId: me.id,
        displayName: me.name,
        avatarColor: me.avatarColor
      },
      (ack?: { error?: string }) => {
        if (ack?.error) {
          setError(ack.error);
        }
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [me.avatarColor, me.id, me.name, roomId]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return;
      }
      const width = window.innerWidth;
      const nextWidth = (event.clientX / width) * 100;
      setLeftWidth(Math.max(35, Math.min(75, nextWidth)));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const inactiveFor = Date.now() - lastActivityAt.current;
      if (inactiveFor > 120_000 && !moderatorLoading) {
        setShowModeratorSuggestion(true);
      }
    }, 12_000);

    return () => window.clearInterval(timer);
  }, [moderatorLoading]);

  useEffect(() => {
    const elements = Array.from(paragraphRefs.current.values());
    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const paragraphId = (entry.target as HTMLElement).dataset.paragraphId;
          if (!paragraphId) return;
          if (entry.isIntersecting) {
            visibleParagraphs.current.add(paragraphId);
          } else {
            visibleParagraphs.current.delete(paragraphId);
          }
        });

        const current = Array.from(visibleParagraphs.current)[0] || null;
        if (!current || current === lastSharedParagraph.current || !socketRef.current || !me.id) {
          return;
        }

        lastSharedParagraph.current = current;
        socketRef.current.emit('reader:position', {
          roomId,
          participantId: me.id,
          paragraphId: current
        });
      },
      { threshold: [0.6] }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [content.id, me.id, roomId]);

  const sendTyping = (isTyping: boolean) => {
    if (!socketRef.current || !roomId || !me.id) {
      return;
    }
    socketRef.current.emit('chat:typing', {
      roomId,
      participantId: me.id,
      participantName: me.name,
      isTyping
    });
  };

  const onInputChange = (value: string) => {
    setMessageInput(value);
    sendTyping(value.trim().length > 0);

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => sendTyping(false), 900);
  };

  const onSendMessage = () => {
    const contentText = messageInput.trim();
    if (!contentText || !socketRef.current || !roomId || !me.id) {
      return;
    }

    socketRef.current.emit('chat:send', {
      roomId,
      participantId: me.id,
      participantName: me.name,
      content: contentText,
      anchorParagraph: selectedAnchor
    });

    setMessageInput('');
    sendTyping(false);
  };

  const scrollToParagraph = (paragraphId: string | null | undefined) => {
    if (!paragraphId) return;
    const target = paragraphRefs.current.get(paragraphId);
    if (!target) return;
    setSelectedAnchor(paragraphId);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const onSummonModerator = async () => {
    if (!roomId || moderatorCooldownMs > 0) {
      return;
    }
    setModeratorLoading(true);
    setLastModeratorCallAt(Date.now());

    try {
      await requestModeratorReply({
        roomId,
        conversation: messages.slice(-12)
      });
      setShowModeratorSuggestion(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to summon moderator.');
    } finally {
      setModeratorLoading(false);
    }
  };

  const typingLabel = Object.values(typingUsers).join(', ');

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-10 text-[var(--app-text)]">
        <div className="salon-panel mx-auto max-w-3xl rounded-2xl p-8 text-[var(--app-text-muted)]">
          <p>Loading reading room…</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen px-6 py-10 text-[var(--app-text)]">
        <div className="salon-panel mx-auto max-w-3xl rounded-2xl p-8">
          <p className="text-[var(--app-text-muted)]">{error || 'Room unavailable.'}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-[var(--accent-brass)]" to="/rooms">
            Back to rooms
          </Link>
        </div>
      </div>
    );
  }

  const readerPanelStyle = chatCollapsed ? { width: '100%' } : { width: `${leftWidth}%` };

  let paragraphIndex = 0;

  return (
    <div className="min-h-screen text-[var(--app-text)]">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-strong)] px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/rooms" className="salon-kicker" style={{ color: 'var(--accent-brass)' }}>
              ← Rooms
            </Link>
            <h1 className="text-2xl font-semibold text-[var(--app-text)]">{room.book?.title || room.bookId}</h1>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="salon-btn-ghost hidden rounded-lg px-3 py-1 text-xs md:block"
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>

          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              className={`rounded-lg px-3 py-1 text-sm ${
                mobilePanel === 'reader'
                  ? 'salon-btn-primary'
                  : 'salon-btn-ghost text-[var(--app-text-muted)]'
              }`}
              onClick={() => setMobilePanel('reader')}
            >
              Reader
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1 text-sm ${
                mobilePanel === 'chat'
                  ? 'salon-btn-primary'
                  : 'salon-btn-ghost text-[var(--app-text-muted)]'
              }`}
              onClick={() => setMobilePanel('chat')}
            >
              Chat
            </button>
          </div>
        </div>
      </header>

      {error && (
        <p
          className="mx-4 mt-3 rounded-xl border px-3 py-2 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--danger) 55%, var(--border-subtle))',
            background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
            color: 'var(--danger)'
          }}
        >
          {error}
        </p>
      )}

      <main className="flex h-[calc(100vh-77px)] overflow-hidden">
        <section
          className={`${mobilePanel === 'chat' ? 'hidden md:block' : 'block'} custom-scrollbar overflow-y-auto px-4 py-6 md:px-8`}
          style={readerPanelStyle}
        >
          <article className="reader-prose prose max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => {
                  paragraphIndex += 1;
                  const id = `p-${paragraphIndex}`;
                  const active = selectedAnchor === id;

                  return (
                    <p
                      data-paragraph-id={id}
                      ref={(element) => {
                        if (element) {
                          paragraphRefs.current.set(id, element);
                        } else {
                          paragraphRefs.current.delete(id);
                        }
                      }}
                      className={`group relative cursor-pointer rounded-lg px-2 py-1 transition ${
                        active
                          ? 'bg-[rgba(191,149,96,0.16)] shadow-[0_0_0_1px_var(--accent-brass)]'
                          : 'hover:bg-[var(--surface-soft)]'
                      }`}
                      onClick={() => setSelectedAnchor(active ? null : id)}
                    >
                      <span
                        className={`absolute -left-4 top-2 h-2 w-2 rounded-full ${
                          active
                            ? 'bg-[var(--accent-brass)]'
                            : 'bg-[var(--app-text-muted)] opacity-0 group-hover:opacity-100'
                        }`}
                      />
                      {children}
                    </p>
                  );
                }
              }}
            >
              {content.markdown}
            </ReactMarkdown>
          </article>
        </section>

        {!chatCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            className="hidden w-1 cursor-col-resize bg-[var(--border-subtle)] md:block"
            onMouseDown={() => {
              draggingRef.current = true;
              document.body.style.cursor = 'col-resize';
            }}
          />
        )}

        <aside
          className={`${mobilePanel === 'reader' ? 'hidden md:flex' : 'flex'} flex-col border-l border-[var(--border-subtle)] bg-[var(--surface)]`}
          style={chatCollapsed ? { width: '52px' } : { width: `${100 - leftWidth}%` }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-3">
            {!chatCollapsed && <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--app-text-muted)]">Discussion</h2>}
            <button
              type="button"
              onClick={() => setChatCollapsed((value) => !value)}
              className="salon-btn-ghost rounded-md px-2 py-1 text-xs"
            >
              {chatCollapsed ? '←' : '→'}
            </button>
          </div>

          {!chatCollapsed && (
            <>
              <div className="border-b border-[var(--border-subtle)] px-3 py-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2 py-1 text-xs"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: participant.avatarColor }}
                      />
                      <span>{participant.displayName}</span>
                      {participant.isHost && <span style={{ color: 'var(--accent-brass)' }}>HOST</span>}
                      <span
                        style={{
                          color: participant.online ? 'var(--success)' : 'var(--app-text-muted)'
                        }}
                      >
                        {participant.online ? 'online' : 'offline'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 text-xs text-[var(--app-text-muted)]">
                  {participants.map((participant) => (
                    <p key={`${participant.id}-position`}>
                      {participant.displayName}: {participant.currentParagraph || 'not tracking position yet'}
                    </p>
                  ))}
                </div>
              </div>

              <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
                {messages.map((message) => {
                  const mine = message.participantId === me.id;
                  const system = message.type === 'system';
                  const moderator = message.type === 'moderator';
                  return (
                    <article
                      key={message.id}
                      className={`animate-room-message rounded-xl px-3 py-2 text-sm ${
                        system
                          ? 'border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--app-text-muted)]'
                          : moderator
                            ? 'border border-[var(--accent-wine)] bg-[var(--accent-wine-soft)] text-[var(--app-text)]'
                            : mine
                              ? 'border border-[var(--accent-brass)] bg-[rgba(191,149,96,0.2)] text-[var(--app-text)]'
                              : 'border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--app-text)]'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-[var(--app-text-muted)]">
                        <span>{moderator ? 'Bloom Moderator' : message.participantName}</span>
                        <span>{formatClock(message.timestamp)}</span>
                      </div>
                      <p>{message.content}</p>
                      {message.anchorParagraph && (
                        <button
                          type="button"
                          onClick={() => scrollToParagraph(message.anchorParagraph)}
                          className="mt-2 rounded-md border border-[var(--accent-brass)] px-2 py-1 text-xs text-[var(--accent-brass)] transition hover:bg-[var(--surface-soft)]"
                        >
                          Anchored to {message.anchorParagraph}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="border-t border-[var(--border-subtle)] px-3 py-3">
                {typingLabel && (
                  <p className="mb-2 text-xs text-[var(--app-text-muted)]">
                    {typingLabel} typing<span className="typing-dot">.</span>
                    <span className="typing-dot" style={{ animationDelay: '0.2s' }}>
                      .
                    </span>
                    <span className="typing-dot" style={{ animationDelay: '0.4s' }}>
                      .
                    </span>
                  </p>
                )}

                {selectedAnchor && (
                  <p className="mb-2 text-xs text-[var(--accent-brass)]">Message anchor: {selectedAnchor}</p>
                )}

                {showModeratorSuggestion && (
                  <button
                    type="button"
                    onClick={onSummonModerator}
                    className="salon-btn-wine mb-2 w-full rounded-lg px-3 py-2 text-xs font-semibold"
                  >
                    Conversation seems quiet — invite Bloom Moderator?
                  </button>
                )}

                <div className="flex gap-2">
                  <input
                    value={messageInput}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        onSendMessage();
                      }
                    }}
                    className="salon-input flex-1 rounded-xl px-3 py-2 text-sm"
                    placeholder="Share your thought..."
                  />
                  <button
                    type="button"
                    onClick={onSendMessage}
                    className="salon-btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    Send
                  </button>
                </div>

                <button
                  type="button"
                  disabled={moderatorLoading || moderatorCooldownMs > 0}
                  onClick={onSummonModerator}
                  className="salon-btn-wine mt-2 w-full rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {moderatorLoading
                    ? 'Moderator is thinking…'
                    : moderatorCooldownMs > 0
                      ? `Summon Moderator (${Math.ceil(moderatorCooldownMs / 1000)}s)`
                      : 'Summon Moderator'}
                </button>
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
