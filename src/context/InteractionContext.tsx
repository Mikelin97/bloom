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
  roundTable: RoundTableState;
}

interface InteractionActions {
  setMode: (mode: InteractionMode) => void;
  setAnchor: (id: string, text: string) => void;
  sendMessage: (text: string) => void;
  inviteRoundTable: () => void;
  continueRoundTable: (promptOverride?: string) => void;
  raiseHand: () => void;
  clearConversation: () => void;
}

interface InteractionContextValue {
  state: InteractionState;
  actions: InteractionActions;
}

const InteractionContext = createContext<InteractionContextValue | undefined>(undefined);

const BOOK_META = {
  bookTitle: "Poor Charlie's Almanack",
  author: 'Charles T. Munger',
  chapterTitle: 'Praising Old Age',
  chapterSummary:
    "Reflections on Cicero's praise of old age and the enduring influence of ideas across time."
};

const PERSONA_ORDER: Persona[] = ['skeptic', 'historian', 'pragmatist'];
const TYPE_SPEED_MS = 50;

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function pick<T>(options: T[]) {
  return options[Math.floor(Math.random() * options.length)];
}

function buildAnchor(text: string, id: string): AnchorContext {
  return {
    id,
    text,
    ...BOOK_META
  };
}

function trimSnippet(text: string, limit: number) {
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= limit ? words.join(' ') : `${words.slice(0, limit).join(' ')}...`;
}

function generateMentorResponse(prompt: string, anchor?: AnchorContext | null) {
  const validations = [
    'Great question - this is a subtle passage.',
    "You're noticing a real tension in the text.",
    'That line is doing more work than it first appears.'
  ];
  const explanations = [
    'A practical read is to treat it as a reminder that ideas outlive moments and people.',
    'The author is nudging you to weigh experience against received wisdom.',
    "It's a contrast between what is remembered and what is still useful."
  ];
  const hooks = [
    'Where else in this chapter do you see the same contrast?',
    'How does this idea show up in your own reading habits?',
    'What personal example would support or challenge this interpretation?'
  ];
  const anchorSnippet = anchor?.text ? `In the line beginning "${trimSnippet(anchor.text, 14)}", ` : '';
  return `${pick(validations)} ${anchorSnippet}${pick(explanations)} ${pick(hooks)}`;
}

function generatePersonaReply(
  persona: Persona,
  prompt: string,
  anchor?: AnchorContext | null
) {
  const anchorSnippet = anchor?.text ? `"${trimSnippet(anchor.text, 12)}"` : 'this passage';
  const topic = prompt || 'this idea';

  switch (persona) {
    case 'skeptic':
      return `I'm not convinced ${topic} fully follows from ${anchorSnippet}. What evidence does the author actually give, and what counterexample would weaken the claim?`;
    case 'historian':
      return `Placed in its era, ${anchorSnippet} echoes classical arguments about civic legacy and learning. How does that historical backdrop shift your interpretation of ${topic}?`;
    case 'pragmatist':
      return `If ${topic} is true, the takeaway is practical: test it in how you read or act today. What's one concrete behavior you would change after this section?`;
    default:
      return '';
  }
}

export function InteractionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InteractionState>({
    mode: 'IDLE',
    anchor: null,
    messages: [],
    roundTable: {
      sessionId: null,
      turnCount: 0,
      maxTurnsBeforePause: 4,
      isOrchestrating: false,
      awaitingUser: false,
      nextPersonaIndex: 0
    }
  });

  const typingIntervals = useRef<Set<number>>(new Set());
  const orchestrationToken = useRef<{ cancelled: boolean }>({ cancelled: false });
  const lastAnchorId = useRef<string | null>(null);
  const stateRef = useRef(state);

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

  const clearTypingIntervals = () => {
    typingIntervals.current.forEach((intervalId) => window.clearInterval(intervalId));
    typingIntervals.current.clear();
  };

  const typeMessage = (
    persona: Persona,
    content: string,
    mode: InteractionMode,
    anchorId?: string,
    cancelToken?: { cancelled: boolean }
  ) => {
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

    return new Promise<void>((resolve) => {
      let index = 0;
      const intervalId = window.setInterval(() => {
        if (cancelToken?.cancelled) {
          window.clearInterval(intervalId);
          typingIntervals.current.delete(intervalId);
          updateMessage(id, { status: 'done' });
          resolve();
          return;
        }
        index += 1;
        updateMessage(id, { content: content.slice(0, index) });
        if (index >= content.length) {
          window.clearInterval(intervalId);
          typingIntervals.current.delete(intervalId);
          updateMessage(id, { status: 'done' });
          resolve();
        }
      }, TYPE_SPEED_MS);
      typingIntervals.current.add(intervalId);
    });
  };

  const setMode = (mode: InteractionMode) => {
    if (mode !== 'ROUND_TABLE') {
      orchestrationToken.current.cancelled = true;
    }
    setState((prev) => ({
      ...prev,
      mode,
      roundTable: mode === 'ROUND_TABLE' ? prev.roundTable : { ...prev.roundTable, isOrchestrating: false }
    }));
  };

  const setAnchor = (id: string, text: string) => {
    const anchor = buildAnchor(text, id);
    setState((prev) => ({ ...prev, anchor, mode: 'MENTOR' }));
    if (lastAnchorId.current === anchor.id) {
      return;
    }
    lastAnchorId.current = anchor.id;
    const greeting = 'Want to unpack this passage together? What stands out to you?';
    void typeMessage('mentor', greeting, 'MENTOR', anchor.id);
  };

  const sendMessage = (text: string) => {
    if (!text.trim()) {
      return;
    }
    const anchorId = state.anchor?.id;
    appendMessage({
      id: createId(),
      role: 'user',
      persona: 'mentor',
      content: text.trim(),
      status: 'done',
      anchorId,
      mode: state.mode === 'IDLE' ? 'MENTOR' : state.mode,
      timestamp: new Date().toISOString()
    });

    if (state.mode === 'ROUND_TABLE') {
      if (state.roundTable.isOrchestrating) {
        orchestrationToken.current.cancelled = true;
      }
      setState((prev) => ({
        ...prev,
        roundTable: { ...prev.roundTable, awaitingUser: false, turnCount: 0 }
      }));
      void runRoundTableTurns(text.trim());
      return;
    }

    const response = generateMentorResponse(text, state.anchor);
    void typeMessage('mentor', response, 'MENTOR', anchorId);
  };

  const inviteRoundTable = async () => {
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
    const intro =
      "Let's bring in the panel. I'll keep time and make sure each perspective speaks.";
    const anchorId = stateRef.current.anchor?.id;
    await typeMessage('mentor', intro, 'ROUND_TABLE', anchorId);
    await runRoundTableTurns();
  };

  const runRoundTableTurns = async (promptOverride?: string) => {
    const currentState = stateRef.current;
    if (!currentState.anchor) {
      return;
    }
    orchestrationToken.current.cancelled = false;
    setState((prev) => ({
      ...prev,
      roundTable: { ...prev.roundTable, isOrchestrating: true }
    }));

    let localTurnCount = 0;
    let localNextPersonaIndex = currentState.roundTable.nextPersonaIndex;
    const availableTurns = currentState.roundTable.maxTurnsBeforePause;
    const turnsToRun = Math.min(3, Math.max(availableTurns, 0));

    setState((prev) => ({
      ...prev,
      roundTable: { ...prev.roundTable, turnCount: 0 }
    }));

    for (let i = 0; i < turnsToRun; i += 1) {
      if (orchestrationToken.current.cancelled) {
        break;
      }
      const persona = PERSONA_ORDER[localNextPersonaIndex % PERSONA_ORDER.length];
      const prompt =
        promptOverride ??
        currentState.messages.filter((message) => message.role === 'user').slice(-1)[0]?.content ??
        '';
      const reply = generatePersonaReply(persona, prompt, currentState.anchor);
      await typeMessage(persona, reply, 'ROUND_TABLE', currentState.anchor.id, orchestrationToken.current);

      localTurnCount += 1;
      localNextPersonaIndex += 1;
      setState((prev) => ({
        ...prev,
        roundTable: {
          ...prev.roundTable,
          turnCount: prev.roundTable.turnCount + 1,
          nextPersonaIndex: prev.roundTable.nextPersonaIndex + 1
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

  const continueRoundTable = (promptOverride?: string) => {
    if (state.roundTable.isOrchestrating) {
      return;
    }
    setState((prev) => ({
      ...prev,
      roundTable: { ...prev.roundTable, awaitingUser: false, turnCount: 0 }
    }));
    void runRoundTableTurns(promptOverride);
  };

  const raiseHand = () => {
    orchestrationToken.current.cancelled = true;
    setState((prev) => ({
      ...prev,
      roundTable: { ...prev.roundTable, isOrchestrating: false, awaitingUser: true }
    }));
  };

  const clearConversation = () => {
    clearTypingIntervals();
    setState((prev) => ({
      ...prev,
      messages: [],
      roundTable: { ...prev.roundTable, sessionId: null, turnCount: 0, awaitingUser: false }
    }));
  };

  const actions: InteractionActions = {
    setMode,
    setAnchor,
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
