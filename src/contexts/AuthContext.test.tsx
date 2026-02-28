import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { AuthProvider, useAuth } from './AuthContext';

const mocks = vi.hoisted(() => ({
  auth: { app: 'mock-auth' },
  GoogleAuthProvider: vi.fn(),
  isSignInWithEmailLink: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInWithEmailLink: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
  getUserMeta: vi.fn(),
  setUserMeta: vi.fn()
}));

vi.mock('../lib/firebase', () => ({
  auth: mocks.auth
}));

vi.mock('../lib/storage', () => ({
  getUserMeta: mocks.getUserMeta,
  setUserMeta: mocks.setUserMeta
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: mocks.GoogleAuthProvider,
  isSignInWithEmailLink: mocks.isSignInWithEmailLink,
  onAuthStateChanged: mocks.onAuthStateChanged,
  sendSignInLinkToEmail: mocks.sendSignInLinkToEmail,
  signInWithEmailLink: mocks.signInWithEmailLink,
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
  updateProfile: mocks.updateProfile
}));

function AuthProbe() {
  const { loading, onboardingCompleted, nickname, sendMagicLink, signInWithGoogle, completeOnboarding } =
    useAuth();

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="onboarding">{String(onboardingCompleted)}</span>
      <span data-testid="nickname">{nickname}</span>
      <button type="button" onClick={() => void sendMagicLink('user@example.com')}>
        send-magic
      </button>
      <button type="button" onClick={() => void signInWithGoogle()}>
        sign-in-google
      </button>
      <button type="button" onClick={() => void completeOnboarding('Neo')}>
        complete-onboarding
      </button>
    </div>
  );
}

function renderAuthProvider() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    mocks.isSignInWithEmailLink.mockReturnValue(false);
    mocks.signInWithEmailLink.mockResolvedValue(undefined);
    mocks.sendSignInLinkToEmail.mockResolvedValue(undefined);
    mocks.signInWithPopup.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.getUserMeta.mockReturnValue(null);
    mocks.GoogleAuthProvider.mockImplementation(function MockGoogleAuthProvider() {
      return { providerId: 'google.com' };
    });
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (nextUser: User | null) => void) => {
        callback(null);
        return vi.fn();
      }
    );
  });

  it('initializes user metadata for a newly authenticated user', () => {
    const authenticatedUser = {
      uid: 'uid-1',
      displayName: 'Alice'
    } as unknown as User;
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (nextUser: User | null) => void) => {
        callback(authenticatedUser);
        return vi.fn();
      }
    );

    renderAuthProvider();

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('onboarding')).toHaveTextContent('false');
    expect(screen.getByTestId('nickname')).toHaveTextContent('Alice');
    expect(mocks.getUserMeta).toHaveBeenCalledWith('uid-1');
    expect(mocks.setUserMeta).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({
        onboarding_completed: false,
        nickname: 'Alice'
      })
    );
  });

  it('sends magic link and stores the sign-in email in localStorage', async () => {
    const user = userEvent.setup();
    renderAuthProvider();

    await user.click(screen.getByRole('button', { name: 'send-magic' }));

    await waitFor(() => {
      expect(mocks.sendSignInLinkToEmail).toHaveBeenCalledWith(mocks.auth, 'user@example.com', {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true
      });
    });
    expect(window.localStorage.getItem('bloom_email_for_sign_in')).toBe('user@example.com');
  });

  it('uses Google provider for popup sign-in', async () => {
    const user = userEvent.setup();
    renderAuthProvider();

    await user.click(screen.getByRole('button', { name: 'sign-in-google' }));

    await waitFor(() => {
      expect(mocks.GoogleAuthProvider).toHaveBeenCalledTimes(1);
      expect(mocks.signInWithPopup).toHaveBeenCalledWith(
        mocks.auth,
        expect.objectContaining({ providerId: 'google.com' })
      );
    });
  });

  it('completes onboarding by updating Firebase profile and local metadata', async () => {
    const user = userEvent.setup();
    const authenticatedUser = {
      uid: 'uid-2',
      displayName: ''
    } as unknown as User;
    mocks.getUserMeta.mockReturnValue({
      onboarding_completed: false,
      created_at: '2026-02-28T00:00:00.000Z',
      nickname: ''
    });
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (nextUser: User | null) => void) => {
        callback(authenticatedUser);
        return vi.fn();
      }
    );

    renderAuthProvider();
    await user.click(screen.getByRole('button', { name: 'complete-onboarding' }));

    await waitFor(() => {
      expect(mocks.updateProfile).toHaveBeenCalledWith(authenticatedUser, { displayName: 'Neo' });
      expect(mocks.setUserMeta).toHaveBeenCalledWith(
        'uid-2',
        expect.objectContaining({
          onboarding_completed: true,
          nickname: 'Neo'
        })
      );
    });
    expect(screen.getByTestId('onboarding')).toHaveTextContent('true');
    expect(screen.getByTestId('nickname')).toHaveTextContent('Neo');
  });

  it('completes sign-in when current URL is an email sign-in link', async () => {
    mocks.isSignInWithEmailLink.mockReturnValue(true);
    window.localStorage.setItem('bloom_email_for_sign_in', 'magic@example.com');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');

    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mocks.signInWithEmailLink).toHaveBeenCalledWith(
        mocks.auth,
        'magic@example.com',
        window.location.href
      );
    });
    expect(window.localStorage.getItem('bloom_email_for_sign_in')).toBeNull();
    expect(replaceSpy).toHaveBeenCalled();

    replaceSpy.mockRestore();
  });
});
