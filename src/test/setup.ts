import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const localStore = new Map<string, string>();

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem(key: string) {
      return localStore.has(key) ? localStore.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStore.set(key, String(value));
    },
    removeItem(key: string) {
      localStore.delete(key);
    },
    clear() {
      localStore.clear();
    },
    key(index: number) {
      return Array.from(localStore.keys())[index] ?? null;
    },
    get length() {
      return localStore.size;
    }
  }
});

afterEach(() => {
  cleanup();
});
