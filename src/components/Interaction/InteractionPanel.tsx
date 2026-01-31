import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionMode, Message, Persona, useInteraction } from '../../context/InteractionContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const PERSONA_STYLES: Record<
  Persona,
  { label: string; accent: string; bubble: string; ring: string; avatar: string }
> = {
  mentor: {
    label: 'Mentor',
    accent: 'text-emerald-500',
    bubble: 'bg-emerald-500/10 border-emerald-500/30',
    ring: 'ring-emerald-500/30',
    avatar: 'M'
  },
  skeptic: {
    label: 'Skeptic',
    accent: 'text-rose-500',
    bubble: 'bg-rose-500/10 border-rose-500/30',
    ring: 'ring-rose-500/30',
    avatar: 'S'
  },
  historian: {
    label: 'Historian',
    accent: 'text-amber-600',
    bubble: 'bg-amber-500/10 border-amber-500/30',
    ring: 'ring-amber-500/30',
    avatar: 'H'
  },
  pragmatist: {
    label: 'Pragmatist',
    accent: 'text-sky-500',
    bubble: 'bg-sky-500/10 border-sky-500/30',
    ring: 'ring-sky-500/30',
    avatar: 'P'
  }
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

  const panelOpen = state.mode !== 'IDLE';
  const anchor = state.anchor;
  const supportsRecording = useMemo(() => {
    return (
      typeof MediaRecorder !== 'undefined' &&
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
    if (!panelOpen) {
      stopSpeech();
    }
  }, [panelOpen]);

  useEffect(() => {
    if (!voiceEnabled) {
      stopSpeech();
    }
    setVoiceError(null);
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

  const beginRecording = async () => {
    if (!supportsRecording || isRecording || isTranscribing) return;
    setVoiceError(null);
    stopSpeech();
    if (state.mode === 'ROUND_TABLE' && state.roundTable.isOrchestrating) {
      actions.raiseHand();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
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
          formData.append('audio', blob, 'speech.webm');
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
  }, [panelOpen, isRecording]);

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
      {!panelOpen && (
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
                    title={PERSONA_STYLES[persona].label}
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
                  onPointerDown={beginRecording}
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
