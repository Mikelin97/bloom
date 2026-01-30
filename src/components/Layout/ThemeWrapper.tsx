import React from 'react';
import { useReader } from '../../context/ReaderContext';

const THEMES = {
  light: {
    bg: '#FFFFFF',
    text: '#1A202C',
    muted: '#A0AEC0',
    panel: 'rgba(255, 255, 255, 0.85)',
    panelBorder: 'rgba(15, 23, 42, 0.08)'
  },
  dark: {
    bg: '#000000',
    text: '#A3A3A3',
    muted: '#5B5B5B',
    panel: 'rgba(10, 10, 10, 0.72)',
    panelBorder: 'rgba(163, 163, 163, 0.2)'
  },
  sepia: {
    bg: '#F4ECD8',
    text: '#5C4B37',
    muted: '#A08C74',
    panel: 'rgba(244, 236, 216, 0.85)',
    panelBorder: 'rgba(92, 75, 55, 0.18)'
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
