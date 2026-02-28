import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, onboardingCompleted } = useAuth();
  const location = useLocation();
  const path = location.pathname;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <svg
          className="h-10 w-10 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Loading"
        >
          <circle cx="12" cy="12" r="10" className="stroke-slate-300" strokeWidth="4" />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            className="stroke-slate-700"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (!user) {
    if (path === '/login') {
      return <>{children}</>;
    }
    return <Navigate to="/login" replace />;
  }

  if (!onboardingCompleted && path !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (onboardingCompleted && (path === '/login' || path === '/onboarding')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
