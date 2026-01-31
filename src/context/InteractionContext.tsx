import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type InteractionMode = 'IDLE' | 'MENTOR' | 'ROUND_TABLE';
export type Persona = 'mentor' | 'skeptic' | 'historian' | 'pragmatist';
export type MessageRole = 'user' | 'ai';

export interface AnchorContext {
  id: string;
  text: string;
  bookTitle: string;
  author: string;
  chapterTitle: string;
  chapterSummary: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  persona: Persona;
  content: string;
  status: 'typing' | 'done';
  anchorId?: string;
  mode: InteractionMode;
  timestamp: string;
}

interface RoundTableState {
  sessionId: string | null;
  turnCount: number;
  maxTurnsBeforePause: number;
  isOrchestrating: boolean;
  awaitingUser: boolean;
  nextPersonaIndex: number;
}

export interface InteractionState {
  mode: InteractionMode;
  anchor: AnchorContext | null;
  messages: Message[];
  viewportText: string;
  roundTable: RoundTableState;
}

interface InteractionActions {
  setMode: (mode: InteractionMode) => void;
  setAnchor: (id: string, text: string) => void;
  setViewportText: (text: string) => void;
  sendMessage: (text: string) => void;
  inviteRoundTable: () => void;
  continueRoundTable: () => void;
  raiseHand: () => void;
  clearConversation: () => void;
}

interface InteractionContextValue {
  state: InteractionState;
  actions: InteractionActions;
}

const InteractionContext = createContext<InteractionContextValue | undefined>(undefined);

const API_BASE = import.meta.env.VITE_API_BASE || '';
const MAX_HISTORY = 8;

const BOOK_META = {
  bookTitle: "Poor Charlie's Almanack",
  author: 'Charles T. Munger',
  chapterTitle: 'Praising Old Age',
  chapterSummary:
    "Reflections on Cicero's praise of old age and the enduring influence of ideas across time."
};

const PERSONA_ORDER: Persona[] = ['skeptic', 'historian', 'pragmatist'];

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function buildAnchor(text: string, id: string): AnchorContext {
  return {
    id,
    text,
    ...BOOK_META
  };
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function limitWords(value: string, limit: number) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= limit) {
    return words.join(' ');
  }
  return words.slice(0, limit).join(' ');
}

function buildHistory(
  sourceMessages: Message[],
  modeFilter?: InteractionMode,
  labelPersonas?: boolean
) {
  return sourceMessages
    .filter((message) => !modeFilter || message.mode === modeFilter)
    .slice(-MAX_HISTORY)
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content:
        labelPersonas && message.role === 'ai'
          ? `${message.persona.toUpperCase()}: ${message.content}`
          : message.content
    }))
    .filter((message) => message.content.length > 0);
}

export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InteractionState>({
    mode: 'IDLE',
    anchor: null,
    messages: [],
    viewportText: '',
    roundTable: {
      sessionId: null,
      turnCount: 0,
      maxTurnsBeforePause: 3,
      isOrchestrating: false,
      awaitingUser: false,
      nextPersonaIndex: 0
    }
  });

  const stateRef = useRef(state);
  const activeAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const appendMessage = (message: Message) => {
    setState((prev) => ({ ...prev, messages: [...prev.messages, message] }));
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((message) =>
        message.id === id ? { ...message, ...updates } : message
      )
    }));
  };

  const cancelActiveStream = () => {
    if (activeAbort.current) {
      activeAbort.current.abort();
      activeAbort.current = null;
    }
  };

  const streamFromApi = async ({
    endpoint,
    payload,
    persona,
    mode,
    anchorId
  }: {
    endpoint: string;
    payload: Record<string, unknown>;
    persona: Persona;
    mode: InteractionMode;
    anchorId?: string;
  }) => {
    const id = createId();
    appendMessage({
      id,
      role: 'ai',
      persona,
      content: '',
      status: 'typing',
      anchorId,
      mode,
      timestamp: new Date().toISOString()
    });

    let currentText = '';
    let aborted = false;
    const controller = new AbortController();
    activeAbort.current = controller;

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let dataPayload = '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              dataPayload += line.replace(/^data:\s*/, '');
            }
          }
          if (!dataPayload) {
            continue;
          }
          if (dataPayload === '[DONE]') {
            done = true;
            break;
          }
          let payloadData: { type?: string; delta?: string; message?: string };
          try {
            payloadData = JSON.parse(dataPayload);
          } catch {
            continue;
          }
          if (payloadData.type === 'delta' && payloadData.delta) {
            currentText += payloadData.delta;
            updateMessage(id, { content: currentText });
          }
          if (payloadData.type === 'error') {
            throw new Error(payloadData.message || 'Streaming error.');
          }
          if (payloadData.type === 'done') {
            done = true;
            break;
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        aborted = true;
      } else {
        const message = error?.message || 'Unable to stream response.';
        updateMessage(id, { content: currentText || `Error: ${message}` });
      }
    } finally {
      updateMessage(id, { status: 'done' });
      if (activeAbort.current === controller) {
        activeAbort.current = null;
      }
    }

    return { content: currentText, aborted };
  };

  const setMode = (mode: InteractionMode) => {
    if (mode !== 'ROUND_TABLE') {
      cancelActiveStream();
    }
    setState((prev) => ({
      ...prev,
      mode,
      roundTable:
        mode === 'ROUND_TABLE'
          ? prev.roundTable
          : { ...prev.roundTable, isOrchestrating: false }
    }));
  };

  const setAnchor = (id: string, text: string) => {
    cancelActiveStream();
    const anchor = buildAnchor(text, id);
    setState((prev) => ({ ...prev, anchor, mode: 'MENTOR' }));
  };

  const setViewportText = (text: string) => {
    const normalized = normalizeText(text);
    const capped = limitWords(normalized, 1000);
    setState((prev) =>
      prev.viewportText === capped ? prev : { ...prev, viewportText: capped }
    );
  };

  const sendMessage = (text: string) => {
    const trimmed = normalizeText(text);
    if (!trimmed) {
      return;
    }

    const anchorId = stateRef.current.anchor?.id;
    const mode = stateRef.current.mode === 'IDLE' ? 'MENTOR' : stateRef.current.mode;

    const userMessage: Message = {
      id: createId(),
      role: 'user',
      persona: 'mentor',
      content: trimmed,
      status: 'done',
      anchorId,
      mode,
      timestamp: new Date().toISOString()
    };
    appendMessage(userMessage);

    if (mode === 'ROUND_TABLE') {
      cancelActiveStream();
      setState((prev) => ({
        ...prev,
        mode,
        roundTable: { ...prev.roundTable, awaitingUser: false, turnCount: 0 }
      }));
      const messagesOverride = [...stateRef.current.messages, userMessage];
      void runRoundTableTurns(messagesOverride);
      return;
    }

    setState((prev) => ({ ...prev, mode }));
    const history = buildHistory([...stateRef.current.messages, userMessage], 'MENTOR');
    const payload = {
      messages: history,
      anchor: stateRef.current.anchor,
      viewportText: stateRef.current.viewportText
    };
    void streamFromApi({
      endpoint: '/api/mentor',
      payload,
      persona: 'mentor',
      mode: 'MENTOR',
      anchorId
    });
  };

  const inviteRoundTable = async () => {
    if (!stateRef.current.anchor) {
      return;
    }
    cancelActiveStream();
    setState((prev) => ({
      ...prev,
      mode: 'ROUND_TABLE',
      roundTable: {
        sessionId: createId(),
        turnCount: 0,
        maxTurnsBeforePause: prev.roundTable.maxTurnsBeforePause,
        isOrchestrating: false,
        awaitingUser: false,
        nextPersonaIndex: 0
      }
    }));

    const history = buildHistory(stateRef.current.messages, undefined, true);
    const introMessages = [
      ...history,
      {
        role: 'user',
        content:
          'Introduce the round-table panel (Skeptic, Historian, Pragmatist) and summarize the user question in 1-2 sentences.'
      }
    ];

    await streamFromApi({
      endpoint: '/api/mentor',
      payload: {
        messages: introMessages,
        anchor: stateRef.current.anchor,
        viewportText: stateRef.current.viewportText
      },
      persona: 'mentor',
      mode: 'ROUND_TABLE',
      anchorId: stateRef.current.anchor?.id
    });

    await runRoundTableTurns();
  };

  const runRoundTableTurns = async (messagesOverride?: Message[]) => {
    if (!stateRef.current.anchor) {
      return;
    }

    setState((prev) => ({
      ...prev,
      roundTable: {
        ...prev.roundTable,
        isOrchestrating: true,
        awaitingUser: false,
        turnCount: 0
      }
    }));

    const turnsToRun = Math.min(
      stateRef.current.roundTable.maxTurnsBeforePause,
      PERSONA_ORDER.length
    );

    let localNextPersonaIndex = stateRef.current.roundTable.nextPersonaIndex;
    let localTurnCount = 0;
    let rollingMessages = [...(messagesOverride ?? stateRef.current.messages)];

    for (let i = 0; i < turnsToRun; i += 1) {
      const persona = PERSONA_ORDER[localNextPersonaIndex % PERSONA_ORDER.length];
      const history = buildHistory(rollingMessages, undefined, true);
      const payload = {
        messages: history,
        anchor: stateRef.current.anchor,
        viewportText: stateRef.current.viewportText,
        persona
      };

      const result = await streamFromApi({
        endpoint: '/api/roundtable',
        payload,
        persona,
        mode: 'ROUND_TABLE',
        anchorId: stateRef.current.anchor?.id
      });

      if (result.aborted) {
        break;
      }

      const responseMessage: Message = {
        id: createId(),
        role: 'ai',
        persona,
        content: result.content,
        status: 'done',
        anchorId: stateRef.current.anchor?.id,
        mode: 'ROUND_TABLE',
        timestamp: new Date().toISOString()
      };
      rollingMessages = [...rollingMessages, responseMessage];

      localTurnCount += 1;
      localNextPersonaIndex += 1;
      setState((prev) => ({
        ...prev,
        roundTable: {
          ...prev.roundTable,
          turnCount: localTurnCount,
          nextPersonaIndex: localNextPersonaIndex
        }
      }));
    }

    setState((prev) => ({
      ...prev,
      roundTable: {
        ...prev.roundTable,
        isOrchestrating: false,
        awaitingUser: true
      }
    }));
  };

  const continueRoundTable = () => {
    if (state.roundTable.isOrchestrating) {
      return;
    }
    setState((prev) => ({
      ...prev,
      roundTable: { ...prev.roundTable, awaitingUser: false, turnCount: 0 }
    }));
    void runRoundTableTurns();
  };

  const raiseHand = () => {
    cancelActiveStream();
    setState((prev) => ({
      ...prev,
      roundTable: { ...prev.roundTable, isOrchestrating: false, awaitingUser: true }
    }));
  };

  const clearConversation = () => {
    cancelActiveStream();
    setState((prev) => ({
      ...prev,
      messages: [],
      roundTable: { ...prev.roundTable, sessionId: null, turnCount: 0, awaitingUser: false }
    }));
  };

  const actions: InteractionActions = {
    setMode,
    setAnchor,
    setViewportText,
    sendMessage,
    inviteRoundTable,
    continueRoundTable,
    raiseHand,
    clearConversation
  };

  return (
    <InteractionContext.Provider value={{ state, actions }}>
      {children}
    </InteractionContext.Provider>
  );
}

export function useInteraction() {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteraction must be used within InteractionProvider');
  }
  return context;
}
