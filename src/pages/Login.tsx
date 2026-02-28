import { FormEvent, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.6 0 6.9 1.2 9.4 3.6l7-7C36.2 2.2 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8.1 6.2C12.6 13.4 17.8 9.5 24 9.5z"
      />
      <path
        fill="#34A853"
        d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.8c-.6 2.9-2.2 5.3-4.6 7l7.1 5.5c4.1-3.8 6.5-9.3 6.5-16.8z"
      />
      <path
        fill="#4A90E2"
        d="M10.7 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-8.1-6.2C.9 16.5 0 20.2 0 24s.9 7.5 2.6 10.8l8.1-6.2z"
      />
      <path
        fill="#FBBC05"
        d="M24 48c6.4 0 11.8-2.1 15.7-5.8l-7.1-5.5c-2 1.3-4.5 2-8.6 2-6.2 0-11.4-3.9-13.3-9.2l-8.1 6.2C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export default function Login() {
  const { sendMagicLink, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [busyProvider, setBusyProvider] = useState<'none' | 'magic' | 'google'>('none');
  const [errorMessage, setErrorMessage] = useState('');

  async function onMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setBusyProvider('magic');
    try {
      await sendMagicLink(email.trim());
      setStatus('sent');
    } catch {
      setStatus('error');
      setErrorMessage('We could not send the link. Check your Firebase email-link configuration.');
    } finally {
      setBusyProvider('none');
    }
  }

  async function onOAuthClick() {
    setErrorMessage('');
    setBusyProvider('google');

    try {
      await signInWithGoogle();
    } catch {
      setErrorMessage('Sign in with Google failed. Check your Firebase OAuth provider settings.');
    } finally {
      setBusyProvider('none');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Welcome to Bloom</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to save your reading setup and continue where you left off.
        </p>

        <form className="mt-6 space-y-3" onSubmit={onMagicLinkSubmit}>
          <label htmlFor="email" className="text-sm font-medium text-slate-800">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            disabled={busyProvider !== 'none'}
            className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {busyProvider === 'magic' ? 'Sending...' : 'Send Magic Link'}
          </button>
        </form>

        {status === 'sent' && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Check your inbox for a sign-in link.
          </p>
        )}

        {status === 'error' && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        )}

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={busyProvider !== 'none'}
            onClick={onOAuthClick}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </div>

        {status !== 'error' && errorMessage && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}
