import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  DEFAULT_READER_CONTENT_ID,
  type ReaderContentId,
  isReaderContentId
} from '../content/library';

export type ThemeMode = 'light' | 'dark' | 'sepia';
export type FontFamily = 'serif' | 'sans' | 'mono';

export interface AppState {
  settings: {
    theme: ThemeMode;
    fontFamily: FontFamily;
    fontSizeStep: number;
    scrollPosition: number;
    contentId: ReaderContentId;
  };
}

type Action =
  | { type: 'SET_THEME'; value: ThemeMode }
  | { type: 'SET_FONT_FAMILY'; value: FontFamily }
  | { type: 'SET_FONT_SIZE'; value: number }
  | { type: 'SET_CONTENT'; value: ReaderContentId }
  | { type: 'SET_SCROLL_POSITION'; value: number };

interface ReaderContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const STORAGE_KEY = 'zen_reader_state';

const defaultState: AppState = {
  settings: {
    theme: 'dark',
    fontFamily: 'serif',
    fontSizeStep: 3,
    scrollPosition: 0,
    contentId: DEFAULT_READER_CONTENT_ID
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, settings: { ...state.settings, theme: action.value } };
    case 'SET_FONT_FAMILY':
      return { ...state, settings: { ...state.settings, fontFamily: action.value } };
    case 'SET_FONT_SIZE':
      return {
        ...state,
        settings: { ...state.settings, fontSizeStep: clamp(action.value, 1, 5) }
      };
    case 'SET_CONTENT':
      if (state.settings.contentId === action.value) {
        return state;
      }
      return {
        ...state,
        settings: { ...state.settings, contentId: action.value, scrollPosition: 0 }
      };
    case 'SET_SCROLL_POSITION':
      return { ...state, settings: { ...state.settings, scrollPosition: action.value } };
    default:
      return state;
  }
}

function loadInitialState(): AppState {
  if (typeof window === 'undefined') {
    return defaultState;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState;
    }
    const parsed = JSON.parse(raw) as {
      settings?: Partial<AppState['settings']> & { contentId?: unknown };
    };
    const parsedSettings = parsed.settings ?? {};
    const { contentId: parsedContentId, ...restSettings } = parsedSettings;
    const contentId = isReaderContentId(parsedContentId)
      ? parsedContentId
      : DEFAULT_READER_CONTENT_ID;
    return {
      ...defaultState,
      settings: {
        ...defaultState.settings,
        ...restSettings,
        contentId
      }
    };
  } catch {
    return defaultState;
  }
}

const ReaderContext = createContext<ReaderContextValue | undefined>(undefined);

export function ReaderProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 500);
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>;
}

export function useReader() {
  const context = useContext(ReaderContext);
  if (!context) {
    throw new Error('useReader must be used within ReaderProvider');
  }
  return context;
}
