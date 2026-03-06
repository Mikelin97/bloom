import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchInvitePreview, joinRoomByInvite } from '../lib/readingClubApi';
import type { InviteRoomPreview, RoomInvite } from '../types/readingSession';
import { useAuth } from '../contexts/AuthContext';

export default function JoinRoomInvite() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { user, nickname, avatarColor } = useAuth();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [room, setRoom] = useState<InviteRoomPreview | null>(null);
  const [invite, setInvite] = useState<RoomInvite | null>(null);

  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const displayName = nickname || user?.displayName || 'Reader';

  useEffect(() => {
    if (!normalizedCode) {
      setError('Invalid invite code.');
      setLoading(false);
      return;
    }

    let active = true;

    const loadPreview = async () => {
      try {
        const payload = await fetchInvitePreview(normalizedCode);
        if (!active) return;
        setRoom(payload.room);
        setInvite(payload.invite);
        setError('');
      } catch (nextError) {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load invite preview.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    loadPreview();

    return () => {
      active = false;
    };
  }, [normalizedCode]);

  const onJoinRoom = async () => {
    if (!user?.uid || !room || !normalizedCode) {
      return;
    }

    setJoining(true);
    try {
      const payload = await joinRoomByInvite(normalizedCode, {
        participantId: user.uid,
        displayName,
        avatarColor
      });
      navigate(`/room/${payload.room.id}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to join room.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 text-[var(--app-text)]">
      <div className="mx-auto max-w-3xl">
        <div className="salon-shell rounded-3xl p-6 md:p-8">
          <p className="salon-kicker">Invite Code</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--app-text)]">{normalizedCode || 'Join Room'}</h1>

          {loading ? (
            <p className="mt-4 text-sm text-[var(--app-text-muted)]">Loading invite preview…</p>
          ) : error ? (
            <p
              className="mt-4 rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--danger) 55%, var(--border-subtle))',
                background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
                color: 'var(--danger)'
              }}
            >
              {error}
            </p>
          ) : room && invite ? (
            <div className="mt-5 space-y-4 text-sm text-[var(--app-text-muted)]">
              <p>
                Book: <span className="text-[var(--app-text)]">{room.book?.title || room.bookId}</span>
              </p>
              <p>
                Host: <span className="text-[var(--app-text)]">{room.host?.displayName || 'Unknown'}</span>
              </p>
              <p>
                Participants: <span className="text-[var(--app-text)]">{room.participantCount}/{room.maxParticipants}</span>
              </p>
              <p>
                Expires: <span className="text-[var(--app-text)]">{new Date(invite.expiresAt).toLocaleString()}</span>
              </p>
              <p>
                Remaining uses: <span className="text-[var(--app-text)]">{invite.remainingUses ?? Math.max(0, invite.maxUses - invite.uses)}</span>
              </p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onJoinRoom}
              disabled={loading || !!error || !room || joining}
              className="salon-btn-primary rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {joining ? 'Joining…' : 'Join Reading Room'}
            </button>
            <Link to="/rooms" className="salon-btn-ghost rounded-xl px-5 py-2 text-sm font-semibold">
              Back to Rooms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
