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
      avatarColor: '#7C3AED',
      completeOnboarding: mocks.completeOnboarding
    });
  });

  it('renders onboarding tutorial and transitions to profile step', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    expect(screen.getByRole('heading', { name: /Welcome to Bloom Social Reading Club/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByRole('heading', { name: /Quick tutorial: paragraph anchoring/i })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: /Set your profile/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
  });

  it('requires nickname before finishing setup', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }));

    expect(screen.getByText(/Please enter a nickname before continuing/i)).toBeInTheDocument();
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });

  it('submits profile payload on finish', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByLabelText('Display name'), '  Neo  ');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: /Ethics/i }));
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }));

    await waitFor(() => {
      expect(mocks.completeOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          nickname: 'Neo',
          avatarColor: '#7C3AED',
          tutorialCompleted: true,
          interests: ['Ethics']
        })
      );
    });
  });

  it('shows error when nickname save fails', async () => {
    const user = userEvent.setup();
    mocks.completeOnboarding.mockRejectedValue(new Error('save failed'));
    render(<Onboarding />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(screen.getByLabelText('Display name'), 'Neo');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Finish Setup' }));

    expect(await screen.findByText(/We could not save your profile/i)).toBeInTheDocument();
  });
});
