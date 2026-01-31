import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionMode,
  Message,
  Persona,
  PERSONA_DISPLAY,
  useInteraction
} from '../../context/InteractionContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const PERSONA_STYLES: Record<
  Persona,
  { label: string; accent: string; bubble: string; ring: string; avatar: string }
> = {
  mentor: {
    label: PERSONA_DISPLAY.mentor.name,
    accent: 'text-emerald-500',
    bubble: 'bg-emerald-500/10 border-emerald-500/30',
    ring: 'ring-emerald-500/30',
    avatar: PERSONA_DISPLAY.mentor.name.slice(0, 1)
  },
  skeptic: {
    label: PERSONA_DISPLAY.skeptic.name,
    accent: 'text-rose-500',
    bubble: 'bg-rose-500/10 border-rose-500/30',
    ring: 'ring-rose-500/30',
    avatar: PERSONA_DISPLAY.skeptic.name.slice(0, 1)
  },
  historian: {
    label: PERSONA_DISPLAY.historian.name,
    accent: 'text-amber-600',
    bubble: 'bg-amber-500/10 border-amber-500/30',
    ring: 'ring-amber-500/30',
    avatar: PERSONA_DISPLAY.historian.name.slice(0, 1)
  },
  pragmatist: {
    label: PERSONA_DISPLAY.pragmatist.name,
    accent: 'text-sky-500',
    bubble: 'bg-sky-500/10 border-sky-500/30',
    ring: 'ring-sky-500/30',
    avatar: PERSONA_DISPLAY.pragmatist.name.slice(0, 1)
  }
};

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/wav'
];

function pickAudioMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  return AUDIO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function getAudioExtension(mimeType: string) {
  const normalized = mimeType.split(';')[0].trim();
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  return 'webm';
}

function TypingDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-1">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current [animation-delay:0.2s]" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current [animation-delay:0.4s]" />
    </span>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const personaStyle = PERSONA_STYLES[message.persona];

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-sm ${
          isUser
            ? 'border-transparent bg-[var(--text)]/10 text-[var(--text)]'
            : `${personaStyle.bubble} text-[var(--text)]`
        }`}
      >
        {!isUser && (
          <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full bg-[var(--panel)] text-[10px] font-semibold ring-1 ${personaStyle.ring}`}
            >
              {personaStyle.avatar}
            </span>
            <span className={personaStyle.accent}>{personaStyle.label}</span>
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">
          {message.content}
          {message.status === 'typing' && !message.content && <TypingDots />}
        </div>
      </div>
    </div>
  );
}

function ModeToggle({
  label,
  active,
  onClick,
  disabled
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]'
          : 'border-[var(--panel-border)] text-[var(--text)] opacity-70 hover:opacity-100'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {label}
    </button>
  );
}

export default function InteractionPanel() {
  const { state, actions } = useInteraction();
  const [draft, setDraft] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const speechQueueRef = useRef<Array<{ text: string; persona: Persona }>>([]);
  const isSpeakingRef = useRef(false);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const inputItemIdRef = useRef<string | null>(null);
  const outputItemIdRef = useRef<string | null>(null);
  const voiceMode = state.voiceMode;
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'listening' | 'responding'>(
    'idle'
  );
  const [voiceInputTranscript, setVoiceInputTranscript] = useState('');
  const [voiceOutputTranscript, setVoiceOutputTranscript] = useState('');

  const panelOpen = state.mode !== 'IDLE' && !voiceMode;
  const anchor = state.anchor;
  const supportsRecording = useMemo(() => {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }, []);
  const supportsVoiceMode = useMemo(() => {
    return (
      typeof RTCPeerConnection !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length, state.roundTable.isOrchestrating, panelOpen, state.mode]);

  useEffect(() => {
    if (!panelOpen) {
      setDraft('');
    }
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen && !voiceMode) {
      stopSpeech();
    }
  }, [panelOpen, voiceMode]);

  useEffect(() => {
    if (!voiceEnabled) {
      stopSpeech();
    }
    setVoiceError(null);
  }, [voiceEnabled]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !voiceEnabled;
    }
  }, [voiceEnabled]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (state.mode === 'ROUND_TABLE' && state.roundTable.isOrchestrating) {
      actions.raiseHand();
    }
    actions.sendMessage(text);
    setDraft('');
  };

  const stopSpeech = () => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    speechQueueRef.current = [];
    isSpeakingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const ensureRemoteAudio = () => {
    if (!remoteAudioRef.current) {
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = !voiceEnabled;
      remoteAudioRef.current = audio;
    }
    return remoteAudioRef.current;
  };

  const resetVoiceTranscripts = () => {
    inputItemIdRef.current = null;
    outputItemIdRef.current = null;
    setVoiceInputTranscript('');
    setVoiceOutputTranscript('');
  };

  const cleanupRealtime = () => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setVoiceStatus('idle');
  };

  const handleRealtimeEvent = (event: MessageEvent) => {
    let payload: any;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    const { type } = payload || {};
    if (!type) return;

    if (type === 'input_audio_buffer.speech_started') {
      setVoiceStatus('listening');
      return;
    }
    if (type === 'input_audio_buffer.speech_stopped') {
      setVoiceStatus('responding');
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.delta') {
      const itemId = payload.item_id || 'input';
      if (inputItemIdRef.current !== itemId) {
        inputItemIdRef.current = itemId;
        setVoiceInputTranscript('');
      }
      if (payload.delta) {
        setVoiceInputTranscript((prev) => prev + payload.delta);
      }
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const itemId = payload.item_id || 'input';
      inputItemIdRef.current = itemId;
      if (payload.transcript) {
        setVoiceInputTranscript(payload.transcript);
      }
      return;
    }
    if (type === 'response.output_text.delta') {
      const outputId = payload.response_id || payload.item_id || 'output';
      if (outputItemIdRef.current !== outputId) {
        outputItemIdRef.current = outputId;
        setVoiceOutputTranscript('');
      }
      if (payload.delta) {
        setVoiceOutputTranscript((prev) => prev + payload.delta);
      }
      setVoiceStatus('responding');
      return;
    }
    if (type === 'response.output_text.done') {
      if (payload.text) {
        setVoiceOutputTranscript(payload.text);
      }
      setVoiceStatus('listening');
      return;
    }
    if (type === 'response.output_audio.done') {
      setVoiceStatus('listening');
      return;
    }
    if (type === 'error') {
      setVoiceError(payload?.message || 'Voice mode error.');
    }
  };

  const connectRealtime = async () => {
    if (peerRef.current) return;
    setVoiceStatus('connecting');
    setVoiceError(null);
    resetVoiceTranscripts();
    stopSpeech();
    if (isRecording) {
      endRecording();
    }

    try {
      const tokenResponse = await fetch(`${API_BASE}/api/realtime-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchor: state.anchor,
          viewportText: state.viewportText
        })
      });
      if (!tokenResponse.ok) {
        throw new Error(`Realtime token failed with status ${tokenResponse.status}`);
      }
      const tokenData = await tokenResponse.json();
      const clientSecret =
        tokenData?.value || tokenData?.client_secret?.value || tokenData?.client_secret;
      if (!clientSecret) {
        throw new Error('Missing realtime client secret.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection();
      peerRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const audio = ensureRemoteAudio();
        if (event.streams[0]) {
          audio.srcObject = event.streams[0];
          audio.play().catch(() => undefined);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setVoiceError('Voice mode connection lost.');
          actions.setVoiceMode(false);
        }
      };

      const dataChannel = pc.createDataChannel('oai-events');
      dataChannel.onmessage = handleRealtimeEvent;
      dataChannel.onopen = () => setVoiceStatus('listening');
      dataChannel.onerror = () => setVoiceError('Voice mode data channel error.');
      dataChannel.onclose = () => setVoiceStatus('idle');
      dataChannelRef.current = dataChannel;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) {
        throw new Error('Missing SDP offer.');
      }

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp'
        },
        body: sdp
      });

      if (!sdpResponse.ok) {
        throw new Error(`Realtime call failed with status ${sdpResponse.status}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (error: any) {
      cleanupRealtime();
      setVoiceError(error?.message || 'Unable to start voice mode.');
      actions.setVoiceMode(false);
    }
  };

  const disconnectRealtime = () => {
    cleanupRealtime();
    resetVoiceTranscripts();
  };

  const playAudio = (url: string) =>
    new Promise<void>((resolve, reject) => {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.src = url;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed.'));
      audio.play().catch(reject);
    });

  const speakText = async (text: string, persona: Persona) => {
    if (!voiceEnabled) return;
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    const response = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, persona }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Voice request failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      await playAudio(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const playNextSpeech = async () => {
    if (isSpeakingRef.current || !voiceEnabled) {
      return;
    }
    const next = speechQueueRef.current.shift();
    if (!next) {
      return;
    }
    isSpeakingRef.current = true;
    try {
      await speakText(next.text, next.persona);
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setVoiceError(error?.message || 'Voice playback failed.');
      }
    } finally {
      isSpeakingRef.current = false;
      if (speechQueueRef.current.length > 0) {
        void playNextSpeech();
      }
    }
  };

  useEffect(() => {
    if (!voiceEnabled) return;
    const newMessages = state.messages.filter(
      (message) =>
        message.role === 'ai' &&
        message.status === 'done' &&
        !spokenIdsRef.current.has(message.id)
    );
    if (!newMessages.length) return;
    newMessages.forEach((message) => {
      spokenIdsRef.current.add(message.id);
      if (message.content.trim()) {
        speechQueueRef.current.push({ text: message.content, persona: message.persona });
      }
    });
    void playNextSpeech();
  }, [state.messages, voiceEnabled]);

  const startRecording = async () => {
    if (!supportsRecording || isRecording || isTranscribing) return;
    setVoiceError(null);
    stopSpeech();
    if (state.mode === 'ROUND_TABLE' && state.roundTable.isOrchestrating) {
      actions.raiseHand();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferredMimeType = pickAudioMimeType();
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        const blobType = recorder.mimeType || preferredMimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: blobType });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        if (!blob.size) {
          setIsTranscribing(false);
          return;
        }
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          const extension = getAudioExtension(blob.type || blobType);
          formData.append('audio', blob, `speech.${extension}`);
          const response = await fetch(`${API_BASE}/api/transcribe`, {
            method: 'POST',
            body: formData
          });
          if (!response.ok) {
            throw new Error(`Transcription failed with status ${response.status}`);
          }
          const data = (await response.json()) as { text?: string };
          const transcript = data?.text?.trim();
          if (transcript) {
            actions.sendMessage(transcript);
          } else {
            setVoiceError('No speech detected.');
          }
        } catch (error: any) {
          setVoiceError(error?.message || 'Transcription failed.');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (error: any) {
      setVoiceError(error?.message || 'Microphone permission denied.');
      setIsRecording(false);
    }
  };

  const endRecording = () => {
    if (!mediaRecorderRef.current) {
      setIsRecording(false);
      return;
    }
    if (mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  useEffect(() => {
    if (!panelOpen && !voiceMode && isRecording) {
      endRecording();
    }
  }, [panelOpen, voiceMode, isRecording]);

  useEffect(() => {
    if (!voiceMode) {
      disconnectRealtime();
      return;
    }
    if (!supportsVoiceMode) {
      setVoiceError('Voice mode is not supported in this browser.');
      actions.setVoiceMode(false);
      return;
    }
    void connectRealtime();
    return () => {
      disconnectRealtime();
    };
  }, [voiceMode, supportsVoiceMode]);

  const handleRoundTableClick = () => {
    if (!anchor) {
      return;
    }
    if (state.mode === 'ROUND_TABLE') {
      actions.setMode('ROUND_TABLE');
      return;
    }
    actions.inviteRoundTable();
  };

  const hasRoundTable = state.roundTable.sessionId !== null;

  const panelClass = `fixed right-3 top-3 bottom-3 z-50 flex w-[min(94vw,380px)] flex-col rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl backdrop-blur-xl transition-all duration-300 ${
    panelOpen ? 'translate-x-0 opacity-100' : 'translate-x-[110%] opacity-0 pointer-events-none'
  }`;

  const emptyState =
    'Select a paragraph to anchor the conversation. Each highlighted passage becomes a precise context window.';

  const activeModeLabel: InteractionMode =
    state.mode === 'IDLE' ? 'MENTOR' : state.mode;

  return (
    <>
      {voiceMode && (
        <div className="fixed bottom-24 right-4 z-50 w-[min(92vw,260px)] rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 text-[var(--text)] shadow-xl backdrop-blur-lg">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Voice mode
          </p>
          <p className="mt-2 text-sm font-semibold">
            {voiceStatus === 'connecting'
              ? 'Connecting...'
              : voiceStatus === 'responding'
                ? 'Responding...'
                : voiceStatus === 'listening'
                  ? 'Listening...'
                  : 'Idle'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {voiceEnabled ? 'TTS playback on.' : 'TTS playback off.'}
          </p>
          {voiceInputTranscript && (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">You:</span> {voiceInputTranscript}
            </p>
          )}
          {voiceOutputTranscript && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">Mentor:</span>{' '}
              {voiceOutputTranscript}
            </p>
          )}
          {voiceError && (
            <p className="mt-2 text-xs text-rose-600">{voiceError}</p>
          )}
          <button
            type="button"
            onClick={() => actions.setVoiceMode(false)}
            className="mt-3 w-full rounded-full border border-[var(--panel-border)] px-3 py-1 text-xs font-semibold text-[var(--text)] transition hover:opacity-80"
          >
            Exit voice mode
          </button>
        </div>
      )}

      {!panelOpen && !voiceMode && (
        <button
          type="button"
          onClick={() => actions.setMode('MENTOR')}
          className="fixed bottom-20 right-4 z-40 rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)] shadow-lg backdrop-blur-md transition hover:-translate-y-0.5"
        >
          Mentor
        </button>
      )}

      <section className={panelClass} aria-live="polite">
        <header className="flex items-center justify-between border-b border-[var(--panel-border)] px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Mode</p>
            <p className="text-lg font-semibold text-[var(--text)]">{activeModeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVoiceEnabled((prev) => !prev)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                voiceEnabled
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600'
                  : 'border-[var(--panel-border)] text-[var(--text-muted)]'
              }`}
            >
              Voice {voiceEnabled ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              onClick={() => actions.setVoiceMode(true)}
              disabled={!supportsVoiceMode}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                supportsVoiceMode
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-600'
                  : 'border-[var(--panel-border)] text-[var(--text-muted)] opacity-60'
              }`}
            >
              Voice Mode
            </button>
            <ModeToggle
              label="Mentor"
              active={state.mode === 'MENTOR'}
              onClick={() => actions.setMode('MENTOR')}
            />
            <ModeToggle
              label="Round-Table"
              active={state.mode === 'ROUND_TABLE'}
              onClick={handleRoundTableClick}
              disabled={!anchor}
            />
            <button
              type="button"
              onClick={() => actions.setMode('IDLE')}
              className="ml-1 rounded-full border border-[var(--panel-border)] px-3 py-1 text-xs text-[var(--text)] opacity-70 transition hover:opacity-100"
              aria-label="Close panel"
            >
              Close
            </button>
          </div>
        </header>

        <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-4" ref={scrollRef}>
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 text-sm text-[var(--text)]">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Active Anchor
            </p>
            {anchor ? (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--text)]">
                  {anchor.text}
                </p>
                <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  {anchor.bookTitle} - {anchor.chapterTitle}
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {anchor.chapterSummary}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-[var(--text-muted)]">{emptyState}</p>
            )}
          </div>

          {state.mode === 'ROUND_TABLE' && (
            <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Participants
                </p>
                <span className="text-xs text-[var(--text-muted)]">
                  Turn {state.roundTable.turnCount}/{state.roundTable.maxTurnsBeforePause}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {(['mentor', 'skeptic', 'historian', 'pragmatist'] as Persona[]).map((persona) => (
                  <div
                    key={persona}
                    className={`flex h-8 w-8 items-center justify-center rounded-full bg-[var(--panel)] text-xs font-semibold ring-1 ${PERSONA_STYLES[persona].ring}`}
                    title={`${PERSONA_DISPLAY[persona].name} (${PERSONA_DISPLAY[persona].role})`}
                  >
                    {PERSONA_STYLES[persona].avatar}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {state.messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--panel-border)] p-4 text-xs text-[var(--text-muted)]">
                Ask a question, or tap a paragraph to seed the mentor.
              </div>
            )}
            {state.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>

          {state.mode === 'ROUND_TABLE' && state.roundTable.awaitingUser && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
              The panel is paused - add your take to continue.
            </div>
          )}

          {voiceError && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700">
              {voiceError}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-[var(--panel-border)] px-5 py-4"
        >
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              placeholder={
                state.mode === 'ROUND_TABLE'
                  ? 'Share your take or question the panel...'
                  : 'Ask the mentor about this passage...'
              }
              className="w-full resize-none bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                {state.mode === 'MENTOR' && (
                  <button
                    type="button"
                    onClick={actions.inviteRoundTable}
                    disabled={!anchor}
                    className={`rounded-full border px-3 py-1 transition ${
                      anchor
                        ? 'border-[var(--text)] text-[var(--text)]'
                        : 'border-[var(--panel-border)] text-[var(--text-muted)]'
                    }`}
                  >
                    Invite panel
                  </button>
                )}
                {state.mode === 'ROUND_TABLE' && (
                  <>
                    <button
                      type="button"
                      onClick={() => actions.continueRoundTable()}
                      disabled={state.roundTable.isOrchestrating}
                      className="rounded-full border border-[var(--text)] px-3 py-1 text-[var(--text)] transition disabled:opacity-50"
                    >
                      {hasRoundTable ? 'Continue' : 'Start'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopSpeech();
                        actions.raiseHand();
                      }}
                      className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-[var(--text)] transition"
                    >
                      Raise hand
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!supportsRecording || isTranscribing}
                  onPointerDown={startRecording}
                  onPointerUp={endRecording}
                  onPointerLeave={endRecording}
                  className={`rounded-full border px-3 py-1 font-semibold transition ${
                    !supportsRecording || isTranscribing
                      ? 'border-[var(--panel-border)] text-[var(--text-muted)]'
                      : isRecording
                        ? 'border-rose-500/60 bg-rose-500/10 text-rose-600 animate-pulse'
                        : 'border-[var(--panel-border)] text-[var(--text)]'
                  }`}
                >
                  {isTranscribing ? 'Transcribing...' : isRecording ? 'Listening...' : 'Hold to talk'}
                </button>
                <button
                  type="submit"
                  className="rounded-full border border-[var(--text)] bg-[var(--text)] px-4 py-1 font-semibold text-[var(--bg)] transition hover:-translate-y-0.5"
                >
                  Send
                </button>
              </div>
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Audio is AI-generated.
            </p>
          </div>
        </form>
      </section>
    </>
  );
}
