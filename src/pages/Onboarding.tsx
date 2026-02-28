import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Onboarding() {
  const { completeOnboarding, nickname: currentNickname } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [nickname, setNickname] = useState(currentNickname);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function onFinishOnboarding() {
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setError('Please enter a nickname before continuing.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await completeOnboarding(trimmedNickname);
    } catch {
      setError('We could not save your nickname. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-amber-50 px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        {step === 1 ? (
          <>
            <article className="prose prose-slate max-w-none">
              <h1>Welcome to Bloom</h1>
              <p>
                Bloom is tuned for focused reading. This onboarding walkthrough keeps setup short so
                you can start reading quickly.
              </p>
              <h2>How to use it</h2>
              <ol>
                <li>Switch themes and fonts with the floating controls to reduce eye strain.</li>
                <li>Use size controls to make dense writing easier to process.</li>
                <li>Keep reading. Bloom remembers where you left off.</li>
              </ol>
              <h2>Reader habits</h2>
              <p>
                Highlight short passages mentally and simplify them one concept at a time. This helps
                you avoid tangents and stay with the author&apos;s main argument.
              </p>
            </article>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Choose a nickname</h1>
              <p className="mt-2 text-sm text-slate-600">
                We&apos;ll use this to personalize your Bloom experience.
              </p>
              <label htmlFor="nickname" className="mt-5 block text-sm font-medium text-slate-800">
                Nickname
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="e.g. Mike"
                maxLength={32}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
            </div>
            <div className="mt-8 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={submitting}
                className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onFinishOnboarding}
                disabled={submitting}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
              >
                {submitting ? 'Saving...' : 'Finish Setup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
