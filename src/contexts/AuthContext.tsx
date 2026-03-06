import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  User,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getUserMeta, setUserMeta } from '../lib/storage';

const EMAIL_FOR_SIGN_IN_KEY = 'bloom_email_for_sign_in';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  onboardingCompleted: boolean;
  nickname: string;
  avatarColor: string;
  interests: string[];
  sendMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeOnboarding: (profile: {
    nickname: string;
    avatarColor: string;
    interests: string[];
    tutorialCompleted: boolean;
  }) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [nickname, setNickname] = useState('');
  const [avatarColor, setAvatarColor] = useState('#7C3AED');
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) {
      return;
    }

    const storedEmail = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);
    const email = storedEmail ?? window.prompt('Confirm your email to finish sign in');
    if (!email) {
      return;
    }

    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
        window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
        const sanitizedUrl = `${window.location.origin}/login`;
        window.history.replaceState({}, document.title, sanitizedUrl);
      })
      .catch(() => {
        window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const existingMeta = getUserMeta(nextUser.uid);
        if (existingMeta) {
          setOnboardingCompleted(existingMeta.onboarding_completed);
          setNickname(existingMeta.nickname || nextUser.displayName || '');
          setAvatarColor(existingMeta.avatar_color || '#7C3AED');
          setInterests(existingMeta.interests || []);
        } else {
          const initializedMeta = {
            onboarding_completed: false,
            created_at: new Date().toISOString(),
            nickname: nextUser.displayName || '',
            avatar_color: '#7C3AED',
            interests: [],
            tutorial_completed: false
          };
          setUserMeta(nextUser.uid, initializedMeta);
          setOnboardingCompleted(false);
          setNickname(nextUser.displayName || '');
          setAvatarColor('#7C3AED');
          setInterests([]);
        }
      } else {
        setOnboardingCompleted(false);
        setNickname('');
        setAvatarColor('#7C3AED');
        setInterests([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    const actionCodeSettings = {
      url: `${window.location.origin}/login`,
      handleCodeInApp: true
    };

    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  const completeOnboarding = useCallback(
    async (profile: {
      nickname: string;
      avatarColor: string;
      interests: string[];
      tutorialCompleted: boolean;
    }) => {
      if (!user) {
        return;
      }

      const sanitizedNickname = profile.nickname.trim();
      if (!sanitizedNickname) {
        throw new Error('Nickname is required');
      }

      await updateProfile(user, { displayName: sanitizedNickname });

      const currentMeta = getUserMeta(user.uid) ?? {
        onboarding_completed: false,
        created_at: new Date().toISOString(),
        nickname: '',
        avatar_color: '#7C3AED',
        interests: [],
        tutorial_completed: false
      };
      setUserMeta(user.uid, {
        ...currentMeta,
        onboarding_completed: true,
        nickname: sanitizedNickname,
        avatar_color: profile.avatarColor,
        interests: profile.interests,
        tutorial_completed: profile.tutorialCompleted
      });
      setOnboardingCompleted(true);
      setNickname(sanitizedNickname);
      setAvatarColor(profile.avatarColor);
      setInterests(profile.interests);
    },
    [user]
  );

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      onboardingCompleted,
      nickname,
      avatarColor,
      interests,
      sendMagicLink,
      signInWithGoogle,
      completeOnboarding,
      signOutUser
    }),
    [
      user,
      loading,
      onboardingCompleted,
      nickname,
      avatarColor,
      interests,
      sendMagicLink,
      signInWithGoogle,
      completeOnboarding,
      signOutUser
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
