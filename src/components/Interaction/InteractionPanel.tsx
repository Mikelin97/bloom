import { FormEvent, MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildConversationIndexEntries,
  buildConversationIndexText,
  InteractionMode,
  Message,
  Persona,
  PERSONA_DISPLAY,
  useInteraction
} from '../../context/InteractionContext';
import { stripSectionMarkers } from '../../utils/parseStructuredResponse';
import StructuredCard from './StructuredCard';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const PERSONA_STYLES: Record<
  Persona,
  { label: string; accent: string; bubble: string; ring: string; avatar: string }
> = {
  mentor: {
    label: PERSONA_DISPLAY.mentor.name,
    accent: 'text-emerald-500',
    bubble:
      'border-emerald-500/35 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent shadow-[0_10px_28px_-24px_rgba(16,185,129,0.95)]',
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

function createLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isNotAllowedError(error: unknown) {
  return (error as { name?: string })?.name === 'NotAllowedError';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PERSONA_PREFIX_PATTERN = new RegExp(
  `^\\s*(?:${Object.values(PERSONA_DISPLAY)
    .flatMap((persona) => [persona.name, persona.role])
    .map(escapeRegExp)
    .join('|')})\\s*[:\\-–—]\\s*`,
  'i'
);

function sanitizeSpeechText(text: string, mode: InteractionMode) {
  let cleaned = stripSectionMarkers(text);
  if (!cleaned) return '';
  if (mode !== 'ROUND_TABLE') return cleaned;
  return cleaned.replace(PERSONA_PREFIX_PATTERN, '').trim();
}

type SpeechQueueItem = {
  text: string;
  persona: Persona;
  mode: InteractionMode;
  audioUrl?: string;
  audioPromise?: Promise<string>;
  abortController?: AbortController;
};

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
        {message.role !== 'user' && message.status === 'done' ? (
          <StructuredCard content={message.content} persona={message.persona} />
        ) : (
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content}
            {message.status === 'typing' && !message.content && <TypingDots />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InteractionPanel() {
  const { state, actions } = useInteraction();
  const [draft, setDraft] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioUnlockRequired, setAudioUnlockRequired] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const speechQueueRef = useRef<SpeechQueueItem[]>([]);
  const isSpeakingRef = useRef(false);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const inputItemIdRef = useRef<string | null>(null);
  const outputItemIdRef = useRef<string | null>(null);
  const inputMessageMapRef = useRef<Map<string, string>>(new Map());
  const outputMessageMapRef = useRef<Map<string, string>>(new Map());
  const audioUnlockRef = useRef(false);
  const voiceMode = state.voiceMode;
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'listening' | 'responding'>(
    'idle'
  );
  const [voiceInputTranscript, setVoiceInputTranscript] = useState('');
  const [voiceOutputTranscript, setVoiceOutputTranscript] = useState('');
  const stateRef = useRef(state);

  const panelOpen = state.mode !== 'IDLE' && !voiceMode;
  const anchor = state.anchor;
  const activeAnchorId = state.anchor?.id || null;
  const activeMessages = useMemo(() => {
    if (!activeAnchorId) {
      return state.messages.filter((message) => !message.anchorId);
    }
    return state.messages.filter((message) => message.anchorId === activeAnchorId);
  }, [state.messages, activeAnchorId]);
  const conversationIndexEntries = useMemo(
    () =>
      buildConversationIndexEntries({
        messages: state.messages,
        anchorsById: state.anchors,
        activeAnchorId
      }),
    [state.messages, state.anchors, activeAnchorId]
  );
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
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (state.mode === 'ROUND_TABLE') {
      actions.setMode('MENTOR');
    }
  }, [state.mode]);

  useEffect(() => {
    audioUnlockRef.current = audioUnlockRequired;
  }, [audioUnlockRequired]);

  useEffect(() => {
    if (!panelOpen) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
  }, [activeMessages.length, state.roundTable.isOrchestrating, panelOpen, state.mode]);

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
    stopSpeech();
  }, [state.anchor?.id]);

  useEffect(() => {
    if (!voiceEnabled) {
      stopSpeech();
    }
    setVoiceError(null);
    setAudioUnlockRequired(false);
    audioUnlockRef.current = false;
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
    actions.sendMessage(text);
    setDraft('');
  };

  const handleAudioUnlock = () => {
    setAudioUnlockRequired(false);
    audioUnlockRef.current = false;
    setVoiceError(null);
    if (remoteAudioRef.current && voiceMode) {
      remoteAudioRef.current.muted = !voiceEnabled;
      remoteAudioRef.current
        .play()
        .catch((error) => setVoiceError(error?.message || 'Audio playback failed.'));
    }
    void playNextSpeech();
  };

  const stopSpeech = () => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    speechQueueRef.current.forEach((item) => {
      item.abortController?.abort();
      if (item.audioUrl) {
        URL.revokeObjectURL(item.audioUrl);
      }
    });
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
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.muted = !voiceEnabled;
      remoteAudioRef.current = audio;
    }
    return remoteAudioRef.current;
  };

  const resetVoiceTranscripts = () => {
    inputItemIdRef.current = null;
    outputItemIdRef.current = null;
    inputMessageMapRef.current.clear();
    outputMessageMapRef.current.clear();
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

  const ensureVoiceMessage = (
    mapRef: MutableRefObject<Map<string, string>>,
    itemId: string,
    role: Message['role'],
    persona: Persona
  ) => {
    let messageId = mapRef.current.get(itemId);
    if (!messageId) {
      messageId = createLocalId();
      mapRef.current.set(itemId, messageId);
      const mode = stateRef.current.mode === 'IDLE' ? 'MENTOR' : stateRef.current.mode;
      actions.addMessage({
        id: messageId,
        role,
        persona,
        content: '',
        status: 'typing',
        anchorId: stateRef.current.anchor?.id,
        mode,
        timestamp: new Date().toISOString()
      });
    }
    return messageId;
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

    const currentMode = stateRef.current.mode === 'IDLE' ? 'MENTOR' : stateRef.current.mode;
    const allowRealtimeResponses = currentMode !== 'ROUND_TABLE';

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
        setVoiceInputTranscript((prev) => {
          const nextTranscript = prev + payload.delta;
          if (allowRealtimeResponses) {
            const messageId = ensureVoiceMessage(inputMessageMapRef, itemId, 'user', 'mentor');
            actions.updateMessage(messageId, { content: nextTranscript, status: 'typing' });
          }
          return nextTranscript;
        });
      }
      return;
    }
    if (type === 'conversation.item.input_audio_transcription.completed') {
      const itemId = payload.item_id || 'input';
      inputItemIdRef.current = itemId;
      if (payload.transcript) {
        setVoiceInputTranscript(payload.transcript);
        const transcript = String(payload.transcript).trim();
        if (transcript) {
          if (!allowRealtimeResponses) {
            actions.sendMessage(transcript);
          } else {
            const messageId = ensureVoiceMessage(inputMessageMapRef, itemId, 'user', 'mentor');
            actions.updateMessage(messageId, { content: transcript, status: 'done' });
          }
        }
      }
      return;
    }
    if (type === 'response.output_text.delta') {
      if (!allowRealtimeResponses) return;
      const outputId = payload.response_id || payload.item_id || 'output';
      if (outputItemIdRef.current !== outputId) {
        outputItemIdRef.current = outputId;
        setVoiceOutputTranscript('');
      }
      if (payload.delta) {
        setVoiceOutputTranscript((prev) => {
          const nextTranscript = prev + payload.delta;
          const messageId = ensureVoiceMessage(outputMessageMapRef, outputId, 'ai', 'mentor');
          actions.updateMessage(messageId, { content: nextTranscript, status: 'typing' });
          return nextTranscript;
        });
      }
      setVoiceStatus('responding');
      return;
    }
    if (type === 'response.output_text.done') {
      if (!allowRealtimeResponses) return;
      const outputId = payload.response_id || payload.item_id || outputItemIdRef.current || 'output';
      if (payload.text) {
        setVoiceOutputTranscript(payload.text);
        const messageId = ensureVoiceMessage(outputMessageMapRef, outputId, 'ai', 'mentor');
        actions.updateMessage(messageId, { content: payload.text, status: 'done' });
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
          anchor: stateRef.current.anchor,
          viewportText: stateRef.current.viewportText,
          mode: stateRef.current.mode,
          conversationIndex: buildConversationIndexText({
            messages: stateRef.current.messages,
            anchorsById: stateRef.current.anchors,
            activeAnchorId: stateRef.current.anchor?.id
          })
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
          audio
            .play()
            .catch((error) => {
              if (isNotAllowedError(error)) {
                audioUnlockRef.current = true;
                setAudioUnlockRequired(true);
                setVoiceError('Audio playback is blocked. Tap "Enable audio" to continue.');
              }
            });
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
      if (isNotAllowedError(error)) {
        setVoiceError('Microphone or audio access blocked. Check Safari permissions and tap "Enable audio".');
        audioUnlockRef.current = true;
        setAudioUnlockRequired(true);
      } else {
        setVoiceError(error?.message || 'Unable to start voice mode.');
      }
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
        audioRef.current.setAttribute('playsinline', 'true');
        audioRef.current.setAttribute('webkit-playsinline', 'true');
      }
      const audio = audioRef.current;
      audio.src = url;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed.'));
      audio.play().catch(reject);
    });

  const fetchSpeechAudio = async (
    text: string,
    persona: Persona,
    controller?: AbortController
  ) => {
    if (!voiceEnabled) {
      throw new Error('Voice disabled.');
    }
    const response = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, persona }),
      signal: controller?.signal
    });

    if (!response.ok) {
      throw new Error(`Voice request failed with status ${response.status}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  };

  const prefetchSpeechItem = (item: SpeechQueueItem) => {
    if (item.audioPromise || item.audioUrl || !voiceEnabled) {
      return;
    }
    const controller = new AbortController();
    item.abortController = controller;
    item.audioPromise = fetchSpeechAudio(item.text, item.persona, controller)
      .then((url) => {
        item.audioUrl = url;
        return url;
      })
      .catch((error) => {
        item.abortController = undefined;
        item.audioPromise = undefined;
        throw error;
      });
  };

  const playSpeechItem = async (item: SpeechQueueItem) => {
    let url: string | undefined;
    let controller: AbortController | null = null;
    try {
      if (item.audioUrl) {
        url = item.audioUrl;
      } else if (item.audioPromise) {
        url = await item.audioPromise;
      } else {
        controller = new AbortController();
        ttsAbortRef.current = controller;
        url = await fetchSpeechAudio(item.text, item.persona, controller);
      }
      if (!url) return;
      await playAudio(url);
    } finally {
      if (controller && ttsAbortRef.current === controller) {
        ttsAbortRef.current = null;
      }
      if (url) {
        URL.revokeObjectURL(url);
      }
      if (item.audioUrl === url) {
        item.audioUrl = undefined;
      }
    }
  };

  const playNextSpeech = async () => {
    if (isSpeakingRef.current || !voiceEnabled || audioUnlockRef.current) {
      return;
    }
    const next = speechQueueRef.current.shift();
    if (!next) {
      return;
    }
    isSpeakingRef.current = true;
    try {
      await playSpeechItem(next);
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        if (isNotAllowedError(error)) {
          speechQueueRef.current.unshift(next);
          audioUnlockRef.current = true;
          setAudioUnlockRequired(true);
          setVoiceError('Audio playback is blocked. Tap "Enable audio" to continue.');
        } else {
          setVoiceError(error?.message || 'Voice playback failed.');
        }
      }
    } finally {
      isSpeakingRef.current = false;
      if (speechQueueRef.current.length > 0 && !audioUnlockRef.current) {
        void playNextSpeech();
      }
    }
  };

  useEffect(() => {
    const shouldPlayTts = voiceEnabled && (!voiceMode || state.mode === 'ROUND_TABLE');
    if (!shouldPlayTts) return;
    const newMessages = activeMessages.filter(
      (message) =>
        message.role === 'ai' &&
        message.status === 'done' &&
        !spokenIdsRef.current.has(message.id)
    );
    if (!newMessages.length) return;
    newMessages.forEach((message) => {
      spokenIdsRef.current.add(message.id);
      const cleaned = sanitizeSpeechText(message.content, message.mode);
      if (!cleaned) {
        return;
      }
      const item: SpeechQueueItem = {
        text: cleaned,
        persona: message.persona,
        mode: message.mode
      };
      speechQueueRef.current.push(item);
      if (message.mode === 'ROUND_TABLE') {
        prefetchSpeechItem(item);
      }
    });
    void playNextSpeech();
  }, [activeMessages, voiceEnabled, voiceMode, state.mode]);

  const startRecording = async () => {
    if (!supportsRecording || isRecording || isTranscribing || voiceMode) return;
    setVoiceError(null);
    stopSpeech();
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
    if (!panelOpen && isRecording) {
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
  }, [voiceMode, supportsVoiceMode, state.anchor?.id, state.mode]);

  useEffect(() => {
    if (!voiceMode || state.mode !== 'ROUND_TABLE') {
      return;
    }
    if (state.roundTable.isOrchestrating) {
      setVoiceStatus('responding');
    } else if (voiceStatus !== 'connecting') {
      setVoiceStatus('listening');
    }
  }, [voiceMode, state.mode, state.roundTable.isOrchestrating, voiceStatus]);

  const panelClass = `fixed right-3 top-3 bottom-3 z-50 flex w-[min(94vw,390px)] flex-col rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-2xl backdrop-blur-xl transition-all duration-300 ${
    panelOpen ? 'translate-x-0 opacity-100' : 'translate-x-[110%] opacity-0 pointer-events-none'
  }`;

  const emptyState =
    'Select a paragraph to anchor the conversation, then ask Catherine for interpretation, context, or critique.';

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
          {audioUnlockRequired && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
              <p>Audio playback is blocked by the browser.</p>
              <button
                type="button"
                onClick={handleAudioUnlock}
                className="mt-2 rounded-full border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:opacity-80"
              >
                Enable audio
              </button>
            </div>
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
          className="fixed bottom-20 right-4 z-40 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600 shadow-lg backdrop-blur-md transition hover:-translate-y-0.5"
        >
          Mentor
        </button>
      )}

      <section className={panelClass} aria-live="polite">
        <header className="flex items-start justify-between border-b border-[var(--panel-border)] bg-[var(--panel)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-xs font-semibold text-emerald-600">
              {PERSONA_STYLES.mentor.avatar}
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Mentor Mode
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--text)]">{PERSONA_STYLES.mentor.label}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {anchor
                  ? 'Anchored to your selected passage.'
                  : 'Select a highlighted paragraph to ground the reply.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
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
              onClick={() => actions.setVoiceMode(!voiceMode)}
              disabled={!supportsVoiceMode}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                !supportsVoiceMode
                  ? 'border-[var(--panel-border)] text-[var(--text-muted)] opacity-60'
                  : voiceMode
                    ? 'border-sky-500/70 bg-sky-500/20 text-sky-700'
                    : 'border-sky-500/60 bg-sky-500/10 text-sky-600'
              }`}
            >
              {voiceMode ? 'Voice Mode On' : 'Voice Mode'}
            </button>
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
          <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent p-4 text-sm text-[var(--text)]">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Active Anchor
            </p>
            {anchor ? (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--text)]">
                  {anchor.text}
                </p>
                <div className="mt-3 text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  {anchor.bookTitle} | {anchor.chapterTitle}
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {anchor.chapterSummary}
                </p>
                {conversationIndexEntries.length > 0 && (
                  <div className="mt-4 border-t border-[var(--panel-border)] pt-3">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Prior Anchors
                    </p>
                    <div className="mt-2 space-y-2 text-xs text-[var(--text-muted)]">
                      {conversationIndexEntries.map((entry) => (
                        <div key={entry.anchorId}>
                          <p className="text-[var(--text)]">{entry.anchorSnippet}</p>
                          {entry.lastUserMessage && (
                            <p className="mt-1">You: {entry.lastUserMessage}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-[var(--text-muted)]">{emptyState}</p>
            )}
          </div>

          {!voiceMode && audioUnlockRequired && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
              <p>Audio playback is blocked by the browser.</p>
              <button
                type="button"
                onClick={handleAudioUnlock}
                className="mt-2 rounded-full border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:opacity-80"
              >
                Enable audio
              </button>
            </div>
          )}

          <div className="space-y-3">
            {activeMessages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel)] p-4 text-xs text-[var(--text-muted)]">
                Ask Catherine for interpretation, challenge the argument, or connect this idea to another passage.
              </div>
            )}
            {activeMessages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>

          {voiceError && !voiceMode && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700">
              {voiceError}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-[var(--panel-border)] px-5 py-4"
        >
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-sm">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              placeholder="Ask the mentor about this passage..."
              className="w-full resize-none bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {anchor ? 'Grounded response enabled' : 'General response mode'}
              </p>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={!supportsRecording || isTranscribing || voiceMode}
                  onPointerDown={startRecording}
                  onPointerUp={endRecording}
                  onPointerLeave={endRecording}
                  className={`rounded-full border px-3 py-1 font-semibold transition ${
                    !supportsRecording || isTranscribing || voiceMode
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
