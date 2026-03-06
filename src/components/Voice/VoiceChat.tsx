import { useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type Participant } from 'livekit-client';
import { requestVoiceToken } from '../../lib/readingClubApi';

type VoicePhase = 'connecting' | 'connected' | 'mock' | 'error';

interface VoiceChatProps {
  roomId: string;
  participantId: string;
  participantName: string;
  avatarColor: string;
}

interface VoiceParticipantCard {
  id: string;
  displayName: string;
  isLocal: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  muted: boolean;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join('');
}

function hashColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 48% 42%)`;
}

function isPermissionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /notallowederror|permission|denied/i.test(error.name) || /permission|denied/i.test(error.message);
}

function toParticipantCards(room: Room): VoiceParticipantCard[] {
  const local = room.localParticipant;
  const remote = Array.from(room.remoteParticipants.values());
  const source: Participant[] = [local, ...remote];

  return source.map((participant) => {
    const publication = Array.from(participant.audioTrackPublications.values())[0];
    return {
      id: participant.identity,
      displayName: participant.name || participant.identity,
      isLocal: participant.identity === local.identity,
      isSpeaking: participant.isSpeaking,
      audioLevel: participant.audioLevel || 0,
      muted: publication?.isMuted ?? true
    };
  });
}

export default function VoiceChat({
  roomId,
  participantId,
  participantName,
  avatarColor
}: VoiceChatProps) {
  const [phase, setPhase] = useState<VoicePhase>('connecting');
  const [participants, setParticipants] = useState<VoiceParticipantCard[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting voice channel...');
  const [errorMessage, setErrorMessage] = useState('');
  const roomRef = useRef<Room | null>(null);
  const audioSinkRef = useRef<HTMLDivElement | null>(null);
  const attachedAudioElements = useRef<Map<string, HTMLMediaElement>>(new Map());

  useEffect(() => {
    let active = true;

    const connect = async () => {
      setPhase('connecting');
      setStatusMessage('Connecting voice channel...');
      setErrorMessage('');

      try {
        const tokenPayload = await requestVoiceToken({
          roomId,
          participantId,
          participantName
        });
        if (!active) return;

        if (tokenPayload.mock || !tokenPayload.token || !tokenPayload.wsUrl) {
          setPhase('mock');
          setStatusMessage(tokenPayload.reason || 'Voice chat is in mock mode.');
          setParticipants([
            {
              id: participantId,
              displayName: participantName,
              isLocal: true,
              isSpeaking: false,
              audioLevel: 0,
              muted: true
            },
            {
              id: 'bloom-moderator',
              displayName: 'Bloom Voice',
              isLocal: false,
              isSpeaking: false,
              audioLevel: 0,
              muted: false
            }
          ]);
          return;
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true
        });
        roomRef.current = room;

        const syncParticipants = () => {
          if (!active) return;
          setParticipants(toParticipantCards(room));
        };

        room.on(RoomEvent.ParticipantConnected, syncParticipants);
        room.on(RoomEvent.ParticipantDisconnected, syncParticipants);
        room.on(RoomEvent.ActiveSpeakersChanged, syncParticipants);
        room.on(RoomEvent.LocalTrackPublished, syncParticipants);
        room.on(RoomEvent.LocalTrackUnpublished, syncParticipants);
        room.on(RoomEvent.TrackMuted, syncParticipants);
        room.on(RoomEvent.TrackUnmuted, syncParticipants);
        room.on(RoomEvent.TrackSubscribed, (track, publication) => {
          if (track.kind !== Track.Kind.Audio || !audioSinkRef.current) {
            return;
          }
          const trackKey = publication.trackSid;
          if (!trackKey) return;
          const element = track.attach();
          element.autoplay = true;
          element.setAttribute('playsinline', 'true');
          element.volume = 1;
          audioSinkRef.current.appendChild(element);
          attachedAudioElements.current.set(trackKey, element);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
          const trackKey = publication.trackSid;
          if (!trackKey) return;
          const attached = attachedAudioElements.current.get(trackKey);
          if (!attached) return;
          track.detach(attached);
          attached.remove();
          attachedAudioElements.current.delete(trackKey);
        });

        await room.connect(tokenPayload.wsUrl, tokenPayload.token);
        if (!active) return;
        setPhase('connected');
        setStatusMessage('Connected');
        syncParticipants();

        try {
          await room.startAudio();
          setAudioBlocked(false);
        } catch (_error) {
          setAudioBlocked(true);
          setStatusMessage('Tap enable audio to hear voices.');
        }

        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMicDenied(false);
          setIsMuted(false);
        } catch (error) {
          if (isPermissionError(error)) {
            setMicDenied(true);
            setIsMuted(true);
            setStatusMessage('Microphone permission blocked. You can still listen.');
          } else {
            throw error;
          }
        }

        syncParticipants();
      } catch (error) {
        if (!active) return;
        setPhase('error');
        setErrorMessage(error instanceof Error ? error.message : 'Unable to start voice chat.');
      }
    };

    connect();

    return () => {
      active = false;
      attachedAudioElements.current.forEach((element) => {
        element.remove();
      });
      attachedAudioElements.current.clear();
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, [participantId, participantName, roomId]);

  useEffect(() => {
    if (!pushToTalk) {
      setSpaceHeld(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }
      if (event.code !== 'Space') {
        return;
      }
      event.preventDefault();
      if (!event.repeat) {
        setSpaceHeld(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      event.preventDefault();
      setSpaceHeld(false);
    };

    const onBlur = () => setSpaceHeld(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [pushToTalk]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected' || micDenied) {
      return;
    }

    const shouldEnableMic = !isMuted && (!pushToTalk || spaceHeld);
    room.localParticipant.setMicrophoneEnabled(shouldEnableMic).catch((error) => {
      if (isPermissionError(error)) {
        setMicDenied(true);
        setIsMuted(true);
        setStatusMessage('Microphone permission blocked. You can still listen.');
      }
    });
  }, [isMuted, micDenied, phase, pushToTalk, spaceHeld]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => Number(b.isSpeaking) - Number(a.isSpeaking));
  }, [participants]);

  const toggleMute = () => {
    setIsMuted((previous) => !previous);
  };

  const retryMic = async () => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') {
      return;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicDenied(false);
      setIsMuted(false);
      setStatusMessage('Microphone connected.');
    } catch (error) {
      if (isPermissionError(error)) {
        setMicDenied(true);
        setStatusMessage('Microphone permission still blocked.');
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to access microphone.');
      }
    }
  };

  const enableAudio = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(false);
      setStatusMessage('Audio enabled.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Audio playback blocked.');
    }
  };

  return (
    <section className="salon-panel animate-room-message mx-4 mt-3 rounded-2xl border border-[var(--border-subtle)] p-3 md:mx-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="salon-kicker" style={{ color: 'var(--accent-forest)' }}>
            Voice Channel
          </p>
          <p className="text-xs text-[var(--app-text-muted)]">
            {phase === 'connecting' ? 'Joining…' : statusMessage}
          </p>
        </div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-muted)]">
          {phase === 'connected' ? 'Live' : phase === 'mock' ? 'Mock' : phase}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sortedParticipants.map((participant) => {
          const color = participant.isLocal ? avatarColor : hashColor(participant.id);
          const ringOpacity = Math.max(0.22, Math.min(0.9, participant.audioLevel * 3));
          return (
            <article
              key={participant.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2 py-2 transition-all duration-200"
              style={
                participant.isSpeaking
                  ? {
                      borderColor: 'color-mix(in srgb, var(--success) 55%, var(--border-subtle))',
                      boxShadow: `0 0 0 2px color-mix(in srgb, var(--success) ${Math.round(
                        ringOpacity * 70
                      )}%, transparent)`
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  {getInitials(participant.displayName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--app-text)]">
                    {participant.displayName}
                    {participant.isLocal ? ' (You)' : ''}
                  </p>
                  <p className="text-[11px] text-[var(--app-text-muted)]">
                    {participant.muted ? 'Muted' : participant.isSpeaking ? 'Speaking' : 'Listening'}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleMute}
          disabled={phase !== 'connected' || micDenied}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            isMuted || micDenied ? 'salon-btn-ghost' : 'salon-btn-primary'
          } disabled:cursor-not-allowed disabled:opacity-55`}
        >
          {micDenied ? 'Mic Blocked' : isMuted ? 'Unmute' : 'Mute'}
        </button>

        <button
          type="button"
          disabled={phase !== 'connected' || micDenied}
          onClick={() => setPushToTalk((value) => !value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            pushToTalk ? 'salon-btn-primary' : 'salon-btn-ghost'
          } disabled:cursor-not-allowed disabled:opacity-55`}
        >
          {pushToTalk ? (spaceHeld ? 'Talking (Space)' : 'Push-to-Talk On') : 'Push-to-Talk'}
        </button>

        {audioBlocked && (
          <button
            type="button"
            onClick={enableAudio}
            className="salon-btn-wine rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Enable Audio
          </button>
        )}

        {micDenied && (
          <button
            type="button"
            onClick={retryMic}
            className="salon-btn-wine rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Retry Microphone
          </button>
        )}
      </div>

      {phase === 'mock' && (
        <p className="mt-2 text-xs text-[var(--app-text-muted)]">
          Running in mock mode. Configure LiveKit credentials to enable real voice transport.
        </p>
      )}

      {errorMessage && (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {errorMessage}
        </p>
      )}

      <div ref={audioSinkRef} className="hidden" aria-hidden />
    </section>
  );
}
