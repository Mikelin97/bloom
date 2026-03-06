import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth
}));

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner while auth is loading', () => {
    mocks.useAuth.mockReturnValue({
      user: null,
      loading: true,
      onboardingCompleted: false
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute>
          <div>Dashboard Protected</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    mocks.useAuth.mockReturnValue({
      user: null,
      loading: false,
      onboardingCompleted: false
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard Protected</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={
              <ProtectedRoute>
                <div>Login Protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Protected')).toBeInTheDocument();
  });

  it('allows unauthenticated access on /login', () => {
    mocks.useAuth.mockReturnValue({
      user: null,
      loading: false,
      onboardingCompleted: false
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <ProtectedRoute>
                <div>Login Protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Protected')).toBeInTheDocument();
  });

  it('redirects authenticated users without onboarding to /onboarding', () => {
    mocks.useAuth.mockReturnValue({
      user: { uid: 'u1' },
      loading: false,
      onboardingCompleted: false
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard Protected</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <div>Onboarding Protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Onboarding Protected')).toBeInTheDocument();
  });

  it('redirects onboarded users from /onboarding to /rooms', () => {
    mocks.useAuth.mockReturnValue({
      user: { uid: 'u1' },
      loading: false,
      onboardingCompleted: true
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <div>Onboarding Protected</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms"
            element={
              <ProtectedRoute>
                <div>Rooms Protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Rooms Protected')).toBeInTheDocument();
  });
});
