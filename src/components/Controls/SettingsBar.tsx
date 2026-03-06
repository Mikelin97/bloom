import { useState } from 'react';
import { READER_CONTENTS, isReaderContentId } from '../../content/library';
import { useReader } from '../../context/ReaderContext';

const THEMES = [
  { id: 'light', label: 'Light', swatch: '#FFFFFF', ring: '#CBD5E1' },
  { id: 'dark', label: 'Black', swatch: '#000000', ring: '#737373' },
  { id: 'sepia', label: 'Sepia', swatch: '#F4ECD8', ring: '#C2A88A' }
] as const;

const FONTS = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans' },
  { id: 'mono', label: 'Mono' }
] as const;

export default function SettingsBar() {
  const { state, dispatch } = useReader();
  const [open, setOpen] = useState(false);
  const handleContentChange = (value: string) => {
    if (!isReaderContentId(value)) return;
    dispatch({ type: 'SET_CONTENT', value });
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end md:top-4 md:bottom-auto">
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--panel-border)] bg-[var(--panel)] text-sm font-semibold text-[var(--text)] shadow-[0_10px_24px_rgba(36,24,16,0.24)] transition"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Open reading controls"
        aria-expanded={open}
      >
        Aa
      </button>

      {open && (
        <div className="mt-3 w-64 space-y-4 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 text-sm text-[var(--text)] shadow-[0_16px_34px_rgba(28,18,12,0.3)]">
          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--text)] opacity-70">
              Text
            </span>
            <select
              className="w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
              value={state.settings.contentId}
              onChange={(event) => handleContentChange(event.target.value)}
              aria-label="Select reading text"
            >
              {READER_CONTENTS.map((content) => (
                <option key={content.id} value={content.id}>
                  {content.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--text)] opacity-70">
              Theme
            </span>
            <div className="flex items-center gap-2">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_THEME', value: theme.id })}
                  aria-label={theme.label}
                  className={`h-6 w-6 rounded-full border transition ${
                    state.settings.theme === theme.id
                      ? 'ring-2 ring-[var(--text)]'
                      : 'ring-0'
                  }`}
                  style={{
                    backgroundColor: theme.swatch,
                    borderColor: theme.ring
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--text)] opacity-70">
              Font
            </span>
            <div className="flex gap-2">
              {FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_FONT_FAMILY', value: font.id })}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    state.settings.fontFamily === font.id
                      ? 'border-[var(--text)] bg-[var(--text)] text-[var(--bg)]'
                      : 'border-[var(--panel-border)] text-[var(--text)] opacity-80'
                  }`}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--text)] opacity-70">
              Size
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'SET_FONT_SIZE',
                    value: state.settings.fontSizeStep - 1
                  })
                }
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--panel-border)] text-base"
                aria-label="Decrease font size"
              >
                −
              </button>
              <span className="text-xs font-semibold">
                {state.settings.fontSizeStep}
              </span>
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'SET_FONT_SIZE',
                    value: state.settings.fontSizeStep + 1
                  })
                }
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--panel-border)] text-base"
                aria-label="Increase font size"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
