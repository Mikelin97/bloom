import { useEffect, useState } from 'react';

export type UiTheme = 'dark' | 'light';

const STORAGE_KEY = 'bloom_ui_theme';

function readTheme(): UiTheme {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function useUiTheme() {
  const [theme, setTheme] = useState<UiTheme>(() => readTheme());

  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'));
  };

  return { theme, setTheme, toggleTheme };
}
