import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

export type Role = 'Admin' | 'Management' | 'Finance' | 'Company Manager' | 'Auditor';

export interface TokenPayload {
  userId: number;
  email: string;
  role: Role;
  companyIds: readonly number[] | number[];
}

/**
 * Generate a signed JWT token for a user.
 * Centralises token creation so every auth path (register, login, Google)
 * produces tokens with the same shape and expiry.
 */
export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};
