import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Onboarding from './Onboarding';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  completeOnboarding: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth
}));

describe('Onboarding page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.completeOnboarding.mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({
      nickname: '',
      completeOnboarding: mocks.completeOnboarding
    });
  });

  it('renders onboarding tutorial and transitions to nickname step', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    expect(screen.getByRole('heading', { name: /Welcome to Bloom/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('heading', { name: /Choose a nickname/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Nickname')).toBeInTheDocument();
  });

  it('requires nickname before finishing setup', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }));

    expect(screen.getByText(/Please enter a nickname before continuing/i)).toBeInTheDocument();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it('submits trimmed nickname on finish', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Nickname'), '  Neo  ');
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }));

    await waitFor(() => {
      expect(mocks.completeOnboarding).toHaveBeenCalledWith('Neo');
    });
  });

  it('shows error when nickname save fails', async () => {
    const user = userEvent.setup();
    mocks.completeOnboarding.mockRejectedValue(new Error('save failed'));
    render(<Onboarding />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Nickname'), 'Neo');
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }));

    expect(await screen.findByText(/We could not save your nickname/i)).toBeInTheDocument();
  });
});
