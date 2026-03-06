import { beforeEach, describe, expect, it } from 'vitest';
import { getUserMeta, setUserMeta, type UserMeta } from './storage';

describe('storage helpers', () => {
  beforeEach(() => {
    const storage = window.localStorage as Storage & { clear?: () => void };
    if (typeof storage.clear === 'function') {
      storage.clear();
      return;
    }
    Object.keys(storage).forEach((key) => storage.removeItem(key));
  });

  it('sets and gets user metadata', () => {
    const meta: UserMeta = {
      onboarding_completed: false,
      created_at: '2026-02-28T00:00:00.000Z',
      nickname: 'ReaderOne'
    };

    setUserMeta('uid-1', meta);

    expect(getUserMeta('uid-1')).toEqual(meta);
  });

  it('returns null when metadata is missing', () => {
    expect(getUserMeta('unknown')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    window.localStorage.setItem('bloom_user_meta:uid-2', '{not-valid-json}');

    expect(getUserMeta('uid-2')).toBeNull();
  });

  it('falls back to empty nickname for legacy metadata without nickname', () => {
    window.localStorage.setItem(
      'bloom_user_meta:uid-3',
      JSON.stringify({
        onboarding_completed: true,
        created_at: '2026-02-27T00:00:00.000Z'
      })
    );

    expect(getUserMeta('uid-3')).toEqual({
      onboarding_completed: true,
      created_at: '2026-02-27T00:00:00.000Z',
      nickname: ''
    });
  });
});
