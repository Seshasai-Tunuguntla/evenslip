import { createHash } from 'node:crypto';

/** Invite links carry a random token; the database only ever sees its SHA-256. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** 32 random bytes in base64url. */
export const isInviteToken = (token: unknown): token is string => typeof token === 'string' && /^[\w-]{43}$/.test(token);
