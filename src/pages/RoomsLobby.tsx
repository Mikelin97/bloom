import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createReadingRoom, fetchBooks, fetchRooms } from '../lib/readingClubApi';
import type { ReadingBook, ReadingRoom } from '../types/readingSession';
import { useAuth } from '../contexts/AuthContext';
import { useUiTheme } from '../hooks/useUiTheme';

export default function RoomsLobby() {
  const navigate = useNavigate();
  const { user, nickname, avatarColor, signOutUser } = useAuth();
  const [rooms, setRooms] = useState<ReadingRoom[]>([]);
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [creating, setCreating] = useState(false);
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const { theme, toggleTheme } = useUiTheme();

  const displayName = useMemo(() => nickname || user?.displayName || 'Reader', [nickname, user]);

  const loadData = async () => {
    try {
      const [roomPayload, bookPayload] = await Promise.all([fetchRooms(), fetchBooks()]);
      setRooms(roomPayload.rooms);
      setBooks(bookPayload.books);
      if (!selectedBookId && bookPayload.books.length > 0) {
        setSelectedBookId(bookPayload.books[0].id);
      }
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load rooms.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const onCreateRoom = async () => {
    if (!user?.uid || !selectedBookId) {
      return;
    }
    setCreating(true);
    try {
      const payload = await createReadingRoom({
        bookId: selectedBookId,
        hostId: user.uid,
        hostName: displayName,
        hostAvatarColor: avatarColor,
        isPrivate: isPrivateRoom
      });
      setCreateOpen(false);
      setIsPrivateRoom(false);
      navigate(`/room/${payload.room.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to create room.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 text-[var(--app-text)]">
      <div className="mx-auto max-w-6xl">
        <div className="salon-shell mb-8 rounded-[1.9rem] p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="salon-kicker">Bloom Social</p>
              <h1 className="mt-2 text-3xl font-semibold text-[var(--app-text)] md:text-4xl">Reading Rooms</h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--app-text-muted)] md:text-base">
                Join live philosophy sessions with paragraph-linked real-time chat.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                className="salon-btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="salon-btn-primary rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Create Room
              </button>
              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className="salon-btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => signOutUser()}
                className="salon-btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p
            className="mb-4 rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--danger) 55%, var(--border-subtle))',
              background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
              color: 'var(--danger)'
            }}
          >
            {error}
          </p>
        )}

        {loading ? (
          <div className="salon-panel rounded-3xl p-10 text-center text-[var(--app-text-muted)]">
            Loading rooms…
          </div>
        ) : rooms.length === 0 ? (
          <div className="salon-panel rounded-3xl p-10 text-center text-[var(--app-text-muted)]">
            No active rooms yet. Create one and invite readers.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => {
              const host = room.participants.find((participant) => participant.isHost);
              return (
                <article
                  key={room.id}
                  className="salon-card group rounded-2xl p-5"
                >
                  <p className="salon-kicker" style={{ color: 'var(--accent-forest)' }}>
                    Reading Session
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--app-text)]">
                    {room.book?.title || room.bookId}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--app-text-muted)]">Host: {host?.displayName || 'Unknown'}</p>
                  <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                    Participants: {room.participantCount}/{room.maxParticipants}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(`/room/${room.id}`)}
                    className="mt-5 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--app-text)] transition group-hover:border-[var(--accent-brass)] group-hover:text-[var(--accent-brass)]"
                  >
                    Join Room
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(12,8,7,0.78)] p-4">
          <div className="salon-shell w-full max-w-md rounded-2xl p-6">
            <h2 className="text-3xl font-semibold text-[var(--app-text)]">Create Reading Room</h2>
            <p className="mt-2 text-sm text-[var(--app-text-muted)]">Choose a book to begin a new session.</p>

            <label htmlFor="book-select" className="mt-4 block text-sm font-medium text-[var(--app-text)]">
              Book
            </label>
            <select
              id="book-select"
              className="salon-input mt-2 w-full rounded-xl px-3 py-2"
              value={selectedBookId}
              onChange={(event) => setSelectedBookId(event.target.value)}
            >
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setIsPrivateRoom(false);
                }}
                className="salon-btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCreateRoom}
                disabled={creating}
                className="salon-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-70"
              >
                {creating ? 'Creating…' : 'Create Room'}
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-[var(--app-text-muted)]">
              <input
                type="checkbox"
                checked={isPrivateRoom}
                onChange={(event) => setIsPrivateRoom(event.target.checked)}
              />
              Private room (Scholar tier required)
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
