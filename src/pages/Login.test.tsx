import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  sendMagicLink: vi.fn(),
  signInWithGoogle: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth
}));

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendMagicLink.mockResolvedValue(undefined);
    mocks.signInWithGoogle.mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({
      sendMagicLink: mocks.sendMagicLink,
      signInWithGoogle: mocks.signInWithGoogle
    });
  });

  it('renders login controls and only Google OAuth option', () => {
    render(<Login />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Magic Link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
    expect(screen.queryByText(/GitHub/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/LinkedIn/i)).not.toBeInTheDocument();
  });

  it('sends magic link and shows success state', async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText('Email'), '  user@example.com  ');
    await user.click(screen.getByRole('button', { name: 'Send Magic Link' }));

    await waitFor(() => {
      expect(mocks.sendMagicLink).toHaveBeenCalledWith('user@example.com');
    });
    expect(screen.getByText(/Check your inbox for a sign-in link/i)).toBeInTheDocument();
  });

  it('shows an error message when magic link send fails', async () => {
    const user = userEvent.setup();
    mocks.sendMagicLink.mockRejectedValue(new Error('send failed'));
    render(<Login />);

    await user.type(screen.getByLabelText('Email'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send Magic Link' }));

    expect(await screen.findByText(/We could not send the link/i)).toBeInTheDocument();
  });

  it('starts Google sign-in when Google button is clicked', async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.click(screen.getByRole('button', { name: /Continue with Google/i }));

    await waitFor(() => {
      expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1);
    });
  });
});
