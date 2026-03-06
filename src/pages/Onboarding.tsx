import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AVATAR_COLORS = ['#7C3AED', '#0EA5E9', '#14B8A6', '#F97316', '#F43F5E', '#84CC16'];
const INTEREST_OPTIONS = [
  'Metaphysics',
  'Ethics',
  'Epistemology',
  'Existentialism',
  'Political Philosophy',
  'Philosophy of Mind'
];

export default function Onboarding() {
  const { completeOnboarding, nickname: currentNickname, avatarColor: currentAvatarColor } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [nickname, setNickname] = useState(currentNickname);
  const [avatarColor, setAvatarColor] = useState(currentAvatarColor);
  const [interests, setInterests] = useState<string[]>([]);
  const [selectedAnchor, setSelectedAnchor] = useState('p-1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSkip = Boolean(currentNickname.trim());
  const progress = useMemo(() => [1, 2, 3, 4], []);

  async function onFinishOnboarding(tutorialCompleted = true) {
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setError('Please enter a nickname before continuing.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await completeOnboarding({
        nickname: trimmedNickname,
        avatarColor,
        interests,
        tutorialCompleted
      });
    } catch {
      setError('We could not save your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const toggleInterest = (value: string) => {
    setInterests((previous) =>
      previous.includes(value) ? previous.filter((entry) => entry !== value) : [...previous, value]
    );
  };

  return (
    <div className="min-h-screen px-4 py-10 text-[var(--app-text)]">
      <div className="salon-shell mx-auto max-w-3xl rounded-[1.9rem] p-6 md:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="salon-kicker">Bloom Reading Club</div>
            <p className="mt-2 text-sm text-[var(--app-text-muted)]">A private library for living ideas.</p>
          </div>
          {canSkip && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => onFinishOnboarding(false)}
              className="salon-btn-ghost rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-60"
            >
              Skip for now
            </button>
          )}
        </div>

        <div className="mb-8 flex items-center gap-2">
          {progress.map((item) => (
            <div
              key={item}
              className={`h-2 flex-1 rounded-full transition ${
                step >= item ? 'bg-[var(--accent-brass)]' : 'bg-[var(--surface-soft)]'
              }`}
            />
          ))}
          <span className="ml-2 text-xs text-[var(--app-text-muted)]">{step}/4</span>
        </div>

        {step === 1 ? (
          <>
            <article className="reader-prose prose max-w-none">
              <h1>Welcome to Bloom Social Reading Club</h1>
              <p>
                Read philosophy in small, thoughtful groups. Every room combines deep reading,
                paragraph-linked chat, and a facilitator AI for richer discussion.
              </p>
              <h2>What makes this different</h2>
              <ol>
                <li>Anchor messages directly to exact paragraphs while you read.</li>
                <li>See participant presence and where others are currently focused.</li>
                <li>Invite Bloom Moderator to unlock deeper, more probing questions.</li>
              </ol>
              <h2>Your first room takes under 2 minutes</h2>
              <p>
                We&apos;ll quickly set your display profile and interest areas so people can discover
                great conversation partners.
              </p>
            </article>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="salon-btn-primary rounded-xl px-5 py-2 text-sm font-semibold"
              >
                Continue
              </button>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <div>
              <h1 className="text-3xl font-semibold text-[var(--app-text)]">Quick tutorial: paragraph anchoring</h1>
              <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                Tap a paragraph in the reader, then write your message. Other readers can click your
                message to jump to the same location.
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              {[
                {
                  id: 'p-1',
                  text: 'Man is a rope, tied between beast and overman — a rope over an abyss.'
                },
                {
                  id: 'p-2',
                  text: 'What is great in man is that he is a bridge and not an end.'
                }
              ].map((item) => {
                const active = selectedAnchor === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedAnchor(item.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? 'border-[var(--accent-brass)] bg-[var(--surface-soft)] shadow-[var(--shadow-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                      {item.id}
                    </div>
                    <p className="text-sm text-[var(--app-text)]">{item.text}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="salon-btn-ghost rounded-xl px-5 py-2 text-sm font-semibold"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="salon-btn-primary rounded-xl px-5 py-2 text-sm font-semibold"
              >
                Next
              </button>
            </div>
          </>
        ) : step === 3 ? (
          <>
            <div>
              <h1 className="text-3xl font-semibold text-[var(--app-text)]">Set your profile</h1>
              <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                Pick a display name and avatar color so others recognize you in room chat.
              </p>
              <label htmlFor="nickname" className="mt-5 block text-sm font-medium text-[var(--app-text)]">
                Display name
              </label>
              <input
                id="nickname"
                name="nickname"
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="e.g. Mike"
                maxLength={32}
                className="salon-input mt-2 w-full rounded-xl px-3 py-2"
              />
            </div>

            <div className="mt-5">
              <p className="text-sm font-medium text-[var(--app-text)]">Avatar color</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {AVATAR_COLORS.map((color) => {
                  const selected = avatarColor === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAvatarColor(color)}
                      className={`h-9 w-9 rounded-full border-2 transition ${selected ? 'scale-110' : 'hover:scale-105'}`}
                      style={{
                        backgroundColor: color,
                        borderColor: selected ? 'var(--accent-brass)' : 'var(--border-subtle)'
                      }}
                      aria-label={`Choose avatar color ${color}`}
                    />
                  );
                })}
              </div>
            </div>

            {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

            <div className="mt-8 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={submitting}
                className="salon-btn-ghost rounded-xl px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={submitting}
                className="salon-btn-primary rounded-xl px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-3xl font-semibold text-[var(--app-text)]">Choose your interests</h1>
              <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                Select philosophy branches you care about. This helps with room recommendations.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {INTEREST_OPTIONS.map((interest) => {
                  const selected = interests.includes(interest);
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                        selected
                          ? 'border-[var(--accent-forest)] bg-[rgba(87,117,80,0.24)] text-[var(--app-text)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--app-text)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {interest}
                    </button>
                  );
                })}
              </div>
              {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
            </div>
            <div className="mt-8 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={submitting}
                className="salon-btn-ghost rounded-xl px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => onFinishOnboarding(true)}
                disabled={submitting}
                className="salon-btn-primary rounded-xl px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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
