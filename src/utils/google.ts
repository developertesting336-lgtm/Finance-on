import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  console.warn('⚠️  GOOGLE_CLIENT_ID is not set — Google auth will reject all tokens.');
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface GoogleUserPayload {
  email: string;
  name: string | null;
  picture: string | null;
  googleId: string;          // Google's `sub` claim
}

/**
 * Verify a Google ID token received from the frontend.
 *
 * Uses Google's `verifyIdToken` which checks signature, expiry,
 * audience (must match GOOGLE_CLIENT_ID), and issuer automatically.
 *
 * @returns The decoded user info on success.
 * @throws  An error with a human-readable message on failure.
 */
export const verifyGoogleToken = async (idToken: string): Promise<GoogleUserPayload> => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth is not configured — GOOGLE_CLIENT_ID env var is missing.');
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    throw new Error('Google token payload is missing required email claim.');
  }

  return {
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    googleId: payload.sub,
  };
};
