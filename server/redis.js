import { createClient } from 'redis';

let redisClient = null;
let connectPromise = null;
let lastRedisError = null;

async function connectRedis() {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (error) => {
      lastRedisError = error;
    });
  }

  if (redisClient.isOpen) {
    return redisClient;
  }

  if (!connectPromise) {
    connectPromise = redisClient
      .connect()
      .then(() => redisClient)
      .catch((error) => {
        lastRedisError = error;
        return null;
      })
      .finally(() => {
        connectPromise = null;
      });
  }

  return connectPromise;
}

async function pingWithTimeout(client, timeoutMs) {
  let timeoutId;
  try {
    const timeout = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Redis ping timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    });

    return await Promise.race([client.ping(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkRedisReadiness() {
  if (!process.env.REDIS_URL) {
    return {
      name: 'redis',
      status: 'skipped',
      reason: 'REDIS_URL is not configured.'
    };
  }

  const client = await connectRedis();
  if (!client || !client.isOpen) {
    return {
      name: 'redis',
      status: 'error',
      error:
        lastRedisError instanceof Error
          ? lastRedisError.message
          : 'Redis client is unavailable.'
    };
  }

  try {
    const pong = await pingWithTimeout(client, 2_000);
    if (pong !== 'PONG') {
      return {
        name: 'redis',
        status: 'error',
        error: `Unexpected ping response: ${pong}`
      };
    }

    return { name: 'redis', status: 'ok' };
  } catch (error) {
    return {
      name: 'redis',
      status: 'error',
      error: error instanceof Error ? error.message : 'Redis connectivity check failed.'
    };
  }
}
