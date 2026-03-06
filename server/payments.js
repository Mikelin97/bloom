import express from 'express';
import Stripe from 'stripe';
import { getPrismaClient } from './prisma.js';

const JSON_BODY = express.json({ limit: '1mb' });
const TIER_VALUES = new Set(['FREE', 'SCHOLAR', 'INSTITUTION']);

let stripeClient = null;

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function getAppBaseUrl(req) {
  return process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`;
}

function normalizeTier(value) {
  if (typeof value !== 'string') return 'FREE';
  const normalized = value.trim().toUpperCase();
  return TIER_VALUES.has(normalized) ? normalized : 'FREE';
}

function getPriceIdByTier(tier) {
  if (tier === 'SCHOLAR') {
    return process.env.STRIPE_PRICE_SCHOLAR || '';
  }
  if (tier === 'INSTITUTION') {
    return process.env.STRIPE_PRICE_INSTITUTION || '';
  }
  return '';
}

function inferTierFromPriceId(priceId) {
  if (!priceId) return 'FREE';
  if (priceId === process.env.STRIPE_PRICE_INSTITUTION) return 'INSTITUTION';
  if (priceId === process.env.STRIPE_PRICE_SCHOLAR) return 'SCHOLAR';
  return 'FREE';
}

function inferTierFromSubscription(subscription) {
  const subscriptionTier = normalizeTier(subscription?.metadata?.tier);
  if (subscriptionTier !== 'FREE') {
    return subscriptionTier;
  }

  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const priceIds = items
    .map((item) => item?.price?.id)
    .filter((priceId) => typeof priceId === 'string' && priceId.length > 0);

  if (priceIds.includes(process.env.STRIPE_PRICE_INSTITUTION)) {
    return 'INSTITUTION';
  }
  if (priceIds.includes(process.env.STRIPE_PRICE_SCHOLAR)) {
    return 'SCHOLAR';
  }
  return inferTierFromPriceId(priceIds[0]);
}

function getCustomerIdFromSubscription(subscription) {
  if (typeof subscription?.customer === 'string') {
    return subscription.customer;
  }
  if (subscription?.customer?.id && typeof subscription.customer.id === 'string') {
    return subscription.customer.id;
  }
  return '';
}

function getUserIdentity(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};

  const userId =
    req.get('x-user-id') ||
    body.userId ||
    body.hostId ||
    query.userId ||
    query.hostId ||
    '';
  const email = req.get('x-user-email') || body.email || query.email || '';
  const name = body.name || query.name || '';

  return {
    userId: typeof userId === 'string' ? userId.trim() : '',
    email: typeof email === 'string' ? email.trim().toLowerCase() : '',
    name: typeof name === 'string' ? name.trim() : ''
  };
}

async function findUserByIdentity(prisma, identity) {
  if (identity.userId) {
    const byId = await prisma.user.findUnique({ where: { id: identity.userId } });
    if (byId) {
      return byId;
    }
  }
  if (identity.email) {
    return prisma.user.findUnique({ where: { email: identity.email } });
  }
  return null;
}

async function ensureUser(prisma, identity) {
  const existing = await findUserByIdentity(prisma, identity);
  if (existing) {
    const updates = {};
    if (identity.name && identity.name !== existing.name) {
      updates.name = identity.name;
    }
    if (!existing.email && identity.email) {
      updates.email = identity.email;
    }
    if (Object.keys(updates).length > 0) {
      return prisma.user.update({ where: { id: existing.id }, data: updates });
    }
    return existing;
  }

  if (!identity.userId || !identity.email) {
    throw new Error('New users require both userId and email.');
  }

  return prisma.user.create({
    data: {
      id: identity.userId,
      email: identity.email,
      name: identity.name || null,
      subscriptionTier: 'FREE'
    }
  });
}

async function ensureCustomerId({ prisma, stripe, user, identity }) {
  if (user.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      if (customer && !customer.deleted) {
        return user.stripeCustomerId;
      }
    } catch {
      // Fall through and create a new customer id.
    }
  }

  const customer = await stripe.customers.create({
    email: identity.email || user.email,
    name: identity.name || user.name || undefined,
    metadata: { userId: user.id }
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id }
  });

  return customer.id;
}

async function syncSubscriptionRecord(subscription) {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const stripeCustomerId = getCustomerIdFromSubscription(subscription);
  const metadataUserId =
    typeof subscription?.metadata?.userId === 'string' ? subscription.metadata.userId : '';

  const user = stripeCustomerId
    ? await prisma.user.findUnique({ where: { stripeCustomerId } })
    : metadataUserId
      ? await prisma.user.findUnique({ where: { id: metadataUserId } })
      : null;

  if (!user) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: stripeCustomerId || user.stripeCustomerId,
      subscriptionTier: inferTierFromSubscription(subscription),
      subscriptionId: subscription?.id || null
    }
  });
}

async function clearSubscriptionRecord(subscription) {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const stripeCustomerId = getCustomerIdFromSubscription(subscription);
  const metadataUserId =
    typeof subscription?.metadata?.userId === 'string' ? subscription.metadata.userId : '';

  const user = stripeCustomerId
    ? await prisma.user.findUnique({ where: { stripeCustomerId } })
    : metadataUserId
      ? await prisma.user.findUnique({ where: { id: metadataUserId } })
      : null;

  if (!user) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: 'FREE',
      subscriptionId: null
    }
  });
}

async function handleStripeWebhook(req, res) {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured.' });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing Stripe signature.' });
    return;
  }

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: 'Stripe webhook payload must be a raw body.' });
    return;
  }

  let event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(req.body, signature, webhookSecret)
      : JSON.parse(req.body.toString('utf8'));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Invalid Stripe webhook payload.'
    });
    return;
  }

  try {
    const normalizedType = typeof event?.type === 'string' ? event.type.replace(/^customer\./, '') : '';
    const subscription = event?.data?.object;

    if (normalizedType === 'subscription.created' || normalizedType === 'subscription.updated') {
      await syncSubscriptionRecord(subscription);
    } else if (normalizedType === 'subscription.deleted') {
      await clearSubscriptionRecord(subscription);
    }

    res.json({ received: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Stripe webhook processing failed.'
    });
  }
}

async function createCheckoutSession(req, res) {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured.' });
    return;
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    res.status(500).json({ error: 'DATABASE_URL is required for billing.' });
    return;
  }

  try {
    const identity = getUserIdentity(req);
    if (!identity.userId && !identity.email) {
      res.status(400).json({ error: 'userId or email is required.' });
      return;
    }

    const tier = normalizeTier(req.body?.tier);
    if (tier === 'FREE') {
      res.status(400).json({ error: 'Checkout is only available for paid tiers.' });
      return;
    }

    const priceId = getPriceIdByTier(tier);
    if (!priceId) {
      res.status(500).json({ error: `Missing Stripe price configuration for ${tier}.` });
      return;
    }

    const user = await ensureUser(prisma, identity);
    const customerId = await ensureCustomerId({ prisma, stripe, user, identity });

    const appBaseUrl = getAppBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appBaseUrl}/pricing?checkout=success`,
      cancel_url: `${appBaseUrl}/pricing?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        tier
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          tier
        }
      }
    });

    res.status(201).json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to create checkout session.'
    });
  }
}

async function getSubscription(req, res) {
  const prisma = getPrismaClient();
  if (!prisma) {
    res.status(500).json({ error: 'DATABASE_URL is required for billing.' });
    return;
  }

  try {
    const identity = getUserIdentity(req);
    if (!identity.userId && !identity.email) {
      res.status(400).json({ error: 'userId or email is required.' });
      return;
    }

    const user = await findUserByIdentity(prisma, identity);
    if (!user) {
      res.json({
        subscription: {
          tier: 'FREE',
          subscriptionId: null,
          stripeCustomerId: null
        }
      });
      return;
    }

    res.json({
      subscription: {
        tier: normalizeTier(user.subscriptionTier),
        subscriptionId: user.subscriptionId || null,
        stripeCustomerId: user.stripeCustomerId || null
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to fetch subscription.'
    });
  }
}

async function createBillingPortalSession(req, res) {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY is not configured.' });
    return;
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    res.status(500).json({ error: 'DATABASE_URL is required for billing.' });
    return;
  }

  try {
    const identity = getUserIdentity(req);
    if (!identity.userId && !identity.email) {
      res.status(400).json({ error: 'userId or email is required.' });
      return;
    }

    const user = await findUserByIdentity(prisma, identity);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (!user.stripeCustomerId) {
      res.status(400).json({ error: 'No billing profile found for this user.' });
      return;
    }

    const appBaseUrl = getAppBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appBaseUrl}/pricing`
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to create billing portal session.'
    });
  }
}

export function registerPaymentRoutes(app) {
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);
  app.post('/api/checkout', JSON_BODY, createCheckoutSession);
  app.get('/api/subscription', getSubscription);
  app.post('/api/billing-portal', JSON_BODY, createBillingPortalSession);
}

