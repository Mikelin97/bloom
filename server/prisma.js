import { PrismaClient } from '@prisma/client';

let prismaClient = null;

export function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }

  return prismaClient;
}

export async function checkDatabaseReadiness() {
  const prisma = getPrismaClient();
  if (!prisma) {
    return {
      name: 'database',
      status: 'skipped',
      reason: 'DATABASE_URL is not configured.'
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'database', status: 'ok' };
  } catch (error) {
    return {
      name: 'database',
      status: 'error',
      error: error instanceof Error ? error.message : 'Database connectivity check failed.'
    };
  }
}
