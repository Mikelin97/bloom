import { getPrismaClient } from '../prisma.js';

const TIER_ORDER = {
  FREE: 0,
  SCHOLAR: 1,
  INSTITUTION: 2
};

function normalizeTier(value) {
  if (typeof value !== 'string') return 'FREE';
  const tier = value.trim().toUpperCase();
  if (tier === 'SCHOLAR' || tier === 'INSTITUTION') {
    return tier;
  }
  return 'FREE';
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function getRequestIdentifiers(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};

  const userId =
    req.get('x-user-id') ||
    body.userId ||
    body.hostId ||
    body.participantId ||
    query.userId ||
    query.hostId ||
    query.participantId ||
    '';
  const email = req.get('x-user-email') || body.email || query.email || '';

  return {
    userId: typeof userId === 'string' ? userId.trim() : '',
    email: typeof email === 'string' ? email.trim().toLowerCase() : ''
  };
}

export function hasRequiredTier(currentTier, requiredTier) {
  const normalizedCurrentTier = normalizeTier(currentTier);
  const normalizedRequiredTier = normalizeTier(requiredTier);
  return TIER_ORDER[normalizedCurrentTier] >= TIER_ORDER[normalizedRequiredTier];
}

export async function resolveTierForRequest(req) {
  const prisma = getPrismaClient();
  if (!prisma) {
    return {
      error: 'DATABASE_URL is required to validate subscription features.',
      status: 503
    };
  }

  const { userId, email } = getRequestIdentifiers(req);
  if (!userId && !email) {
    return {
      error: 'userId or email is required for subscription checks.',
      status: 401
    };
  }

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, subscriptionTier: true }
      })
    : await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, subscriptionTier: true }
      });

  return {
    tier: normalizeTier(user?.subscriptionTier),
    userId: user?.id || userId,
    email: user?.email || email
  };
}

export function requireTier(requiredTier) {
  const normalizedRequiredTier = normalizeTier(requiredTier);

  return async (req, res, next) => {
    try {
      const result = await resolveTierForRequest(req);
      if (result.error) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }

      if (!hasRequiredTier(result.tier, normalizedRequiredTier)) {
        res.status(403).json({
          error: `${normalizedRequiredTier} tier required for this feature.`,
          requiredTier: normalizedRequiredTier,
          currentTier: result.tier
        });
        return;
      }

      req.subscriptionTier = result.tier;
      req.subscriptionUserId = result.userId;
      req.subscriptionEmail = result.email;
      next();
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Tier validation failed.'
      });
    }
  };
}

export async function requireScholarForPrivateRooms(req, res, next) {
  const wantsPrivateRoom = parseBoolean(req.body?.isPrivate);
  if (!wantsPrivateRoom) {
    next();
    return;
  }

  const middleware = requireTier('SCHOLAR');
  await middleware(req, res, next);
}

