import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  createBillingPortalSession,
  createCheckoutSession,
  fetchSubscription,
  type SubscriptionTier
} from '../lib/readingClubApi';
import { useUiTheme } from '../hooks/useUiTheme';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

const TIERS: Array<{
  id: SubscriptionTier;
  name: string;
  price: string;
  subtitle: string;
  featured?: boolean;
  features: string[];
}> = [
  {
    id: 'FREE',
    name: 'Free',
    price: '$0/mo',
    subtitle: 'For thoughtful starters',
    features: ['Join rooms', 'Basic text chat', '1 room creation/month']
  },
  {
    id: 'SCHOLAR',
    name: 'Scholar',
    price: '$9.99/mo',
    subtitle: 'For serious reading circles',
    featured: true,
    features: ['Unlimited room creation', 'Voice chat', 'AI moderator', 'Private rooms']
  },
  {
    id: 'INSTITUTION',
    name: 'Institution',
    price: '$49.99/mo',
    subtitle: 'For clubs, schools, and teams',
    features: [
      'Everything in Scholar',
      'Custom branding',
      'Reading analytics',
      'Priority support'
    ]
  }
];

function isPaidTier(tier: SubscriptionTier): tier is 'SCHOLAR' | 'INSTITUTION' {
  return tier === 'SCHOLAR' || tier === 'INSTITUTION';
}

export default function Pricing() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useUiTheme();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string>('');
  const [error, setError] = useState('');
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('FREE');
  const [hasBillingProfile, setHasBillingProfile] = useState(false);

  const checkoutState = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('checkout');
    if (value === 'success') return 'Checkout successful. Your subscription is updating now.';
    if (value === 'cancelled') return 'Checkout cancelled. No changes were made.';
    return '';
  }, []);

  useEffect(() => {
    const loadSubscription = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        const payload = await fetchSubscription({
          userId: user.uid,
          email: user.email || undefined
        });
        setSubscriptionTier(payload.subscription.tier);
        setHasBillingProfile(Boolean(payload.subscription.stripeCustomerId));
        setError('');
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load subscription status.');
      } finally {
        setLoading(false);
      }
    };

    void loadSubscription();
  }, [user?.email, user?.uid]);

  const onCheckout = async (tier: 'SCHOLAR' | 'INSTITUTION') => {
    if (!user?.uid || !user.email) {
      setError('A verified account email is required for checkout.');
      return;
    }

    setActionLoading(tier);
    setError('');
    try {
      const session = await createCheckoutSession({
        userId: user.uid,
        email: user.email,
        name: user.displayName || '',
        tier
      });

      if (STRIPE_PUBLISHABLE_KEY) {
        await loadStripe(STRIPE_PUBLISHABLE_KEY);
      }

      if (session.url) {
        window.location.assign(session.url);
        return;
      }

      throw new Error('Missing checkout redirect URL.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to start checkout.');
      setActionLoading('');
    }
  };

  const onManageBilling = async () => {
    if (!user?.uid) {
      setError('You must be signed in to access billing.');
      return;
    }

    setActionLoading('billing-portal');
    setError('');
    try {
      const session = await createBillingPortalSession({
        userId: user.uid,
        email: user.email || undefined
      });
      window.location.assign(session.url);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to open billing portal.');
      setActionLoading('');
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 text-[var(--app-text)]">
      <div className="mx-auto max-w-6xl">
        <div className="salon-shell rounded-[1.9rem] p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="salon-kicker">Bloom Social Membership</p>
              <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Choose your reading tier</h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--app-text-muted)] md:text-base">
                Unlock premium collaboration and advanced social reading tools.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/rooms" className="salon-btn-ghost rounded-xl px-4 py-2 text-sm font-semibold">
                Back to rooms
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="salon-btn-ghost rounded-xl px-4 py-2 text-sm font-semibold"
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </div>

        {(checkoutState || error) && (
          <div className="mt-5 space-y-3">
            {checkoutState && (
              <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--app-text-muted)]">
                {checkoutState}
              </p>
            )}
            {error && (
              <p
                className="rounded-xl border px-3 py-2 text-sm"
                style={{
                  borderColor: 'color-mix(in srgb, var(--danger) 55%, var(--border-subtle))',
                  background: 'color-mix(in srgb, var(--danger) 13%, transparent)',
                  color: 'var(--danger)'
                }}
              >
                {error}
              </p>
            )}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const isCurrent = subscriptionTier === tier.id;
            const isIncluded = subscriptionTier === 'INSTITUTION' && tier.id === 'SCHOLAR';
            const canCheckout = isPaidTier(tier.id) && !isCurrent && !isIncluded;
            const checkoutTier = tier.id === 'SCHOLAR' || tier.id === 'INSTITUTION' ? tier.id : null;

            return (
              <article
                key={tier.id}
                className={`salon-card rounded-2xl p-6 ${
                  tier.featured
                    ? 'border-[var(--accent-brass)] shadow-[0_22px_52px_-34px_rgba(194,151,86,0.48)]'
                    : ''
                }`}
              >
                <p className="salon-kicker">{tier.name}</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--app-text)]">{tier.price}</p>
                <p className="mt-2 text-sm text-[var(--app-text-muted)]">{tier.subtitle}</p>
                <ul className="mt-5 space-y-2 text-sm text-[var(--app-text)]">
                  {tier.features.map((feature) => (
                    <li key={feature}>✓ {feature}</li>
                  ))}
                </ul>
                <div className="mt-6">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="salon-btn-ghost w-full rounded-xl px-4 py-2 text-sm font-semibold opacity-70"
                    >
                      Current plan
                    </button>
                  ) : canCheckout ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (checkoutTier) {
                          void onCheckout(checkoutTier);
                        }
                      }}
                      disabled={actionLoading === tier.id || loading}
                      className="salon-btn-primary w-full rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-70"
                    >
                      {actionLoading === tier.id ? 'Redirecting…' : `Upgrade to ${tier.name}`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="salon-btn-ghost w-full rounded-xl px-4 py-2 text-sm font-semibold opacity-70"
                    >
                      {isIncluded ? 'Included in current plan' : 'No checkout needed'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {isPaidTier(subscriptionTier) && hasBillingProfile && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => void onManageBilling()}
              disabled={actionLoading === 'billing-portal' || loading}
              className="salon-btn-ghost rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-70"
            >
              {actionLoading === 'billing-portal' ? 'Opening billing portal…' : 'Manage billing'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
