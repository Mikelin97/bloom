export interface UserMeta {
  onboarding_completed: boolean;
  created_at: string;
  nickname: string;
  avatar_color?: string;
  interests?: string[];
  tutorial_completed?: boolean;
}

const STORAGE_PREFIX = 'bloom_user_meta';

function getStorageKey(uid: string) {
  return `${STORAGE_PREFIX}:${uid}`;
}

export function getUserMeta(uid: string): UserMeta | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(getStorageKey(uid));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserMeta>;
    if (
      typeof parsed.onboarding_completed === 'boolean' &&
      typeof parsed.created_at === 'string' &&
      (typeof parsed.nickname === 'string' || typeof parsed.nickname === 'undefined') &&
      (typeof parsed.avatar_color === 'string' || typeof parsed.avatar_color === 'undefined') &&
      (Array.isArray(parsed.interests) || typeof parsed.interests === 'undefined') &&
      (typeof parsed.tutorial_completed === 'boolean' ||
        typeof parsed.tutorial_completed === 'undefined')
    ) {
      return {
        onboarding_completed: parsed.onboarding_completed,
        created_at: parsed.created_at,
        nickname: parsed.nickname ?? '',
        avatar_color: parsed.avatar_color,
        interests: parsed.interests,
        tutorial_completed: parsed.tutorial_completed
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function setUserMeta(uid: string, data: UserMeta) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getStorageKey(uid), JSON.stringify(data));
}
