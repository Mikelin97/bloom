import React from 'react';
import { useReader } from '../../context/ReaderContext';

const THEMES = {
  light: {
    bg: '#F2E6D2',
    text: '#35261F',
    muted: '#7A6350',
    panel: 'rgba(247, 238, 223, 0.88)',
    panelBorder: 'rgba(124, 92, 63, 0.3)'
  },
  dark: {
    bg: '#18120F',
    text: '#F2E6D1',
    muted: '#B8A387',
    panel: 'rgba(52, 39, 33, 0.88)',
    panelBorder: 'rgba(185, 150, 107, 0.32)'
  },
  sepia: {
    bg: '#E9DDC8',
    text: '#4F3E30',
    muted: '#8D755E',
    panel: 'rgba(236, 223, 198, 0.88)',
    panelBorder: 'rgba(118, 91, 66, 0.28)'
  }
} as const;

const FONT_CLASSES = {
  serif: 'font-serif',
  sans: 'font-sans',
  mono: 'font-mono'
} as const;

const FONT_SIZES: Record<number, { fontSize: string; lineHeight: string }> = {
  1: { fontSize: 'clamp(1rem, 0.95rem + 0.4vw, 1.15rem)', lineHeight: '1.6' },
  2: { fontSize: 'clamp(1.05rem, 0.98rem + 0.45vw, 1.2rem)', lineHeight: '1.62' },
  3: { fontSize: 'clamp(1.1rem, 1rem + 0.5vw, 1.3rem)', lineHeight: '1.68' },
  4: { fontSize: 'clamp(1.15rem, 1.05rem + 0.55vw, 1.4rem)', lineHeight: '1.72' },
  5: { fontSize: 'clamp(1.2rem, 1.1rem + 0.6vw, 1.5rem)', lineHeight: '1.78' }
};

export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { state } = useReader();
  const theme = THEMES[state.settings.theme];
  const size = FONT_SIZES[state.settings.fontSizeStep] ?? FONT_SIZES[3];
  const fontClass = FONT_CLASSES[state.settings.fontFamily];

  return (
    <div
      className={`min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 ${fontClass}`}
      style={{
        '--bg': theme.bg,
        '--text': theme.text,
        '--text-muted': theme.muted,
        '--panel': theme.panel,
        '--panel-border': theme.panelBorder,
        fontSize: size.fontSize,
        lineHeight: size.lineHeight
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
