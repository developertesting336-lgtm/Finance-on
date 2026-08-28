import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../prisma/db.js';
import { generateToken } from '../utils/jwt.js';
import { verifyGoogleToken } from '../utils/google.js';
import { generateOtp, sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Format user payload for consistent API responses
 */
const formatUser = (user: any) => ({
  id: user.id,
  email: user.email,
  full_name: user.fullName ?? null,
  role: user.role,
  company_scope: user.companyIds ? [...user.companyIds] : [],
  isEmailVerified: user.isEmailVerified,
  createdAt: user.createdAt,
});

/**
 * 1. POST /api/auth/register
 * Request: { email, password, full_name? }
 * Response 201: { message: "OTP sent" }
 * Errors: 409 email already registered; 422 validation failed.
 */
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, fullName } = req.body;
    const nameToSave = full_name || fullName || null;

    if (!email || !password) {
      return res.status(422).json({ message: 'Email and password are required' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(422).json({ message: 'Invalid email format' });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(422).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if user already exists
    const existingUser = await db.orm.public.User
      .where({ email })
      .first();

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({ message: 'Email already registered' });
      }

      // User exists but unverified: update password, name, new OTP, and resend
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      await db.orm.public.User
        .where({ id: existingUser.id })
        .update({
          password: hashedPassword,
          fullName: nameToSave,
          verificationCode: otp,
          verificationExpiresAt: expiresAt,
        });

      await sendVerificationEmail(email, otp);

      return res.status(201).json({
        message: 'OTP sent',
        email,
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create unverified user
    const newUser = await db.orm.public.User.create({
      email,
      password: hashedPassword,
      fullName: nameToSave,
      role: 'Auditor',
      companyIds: [],
      isEmailVerified: false,
      verificationCode: otp,
      verificationExpiresAt: expiresAt,
    });

    await sendVerificationEmail(email, otp);

    return res.status(201).json({
      message: 'OTP sent',
      email: newUser.email,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

/**
 * 2. POST /api/auth/verify (and /api/auth/verify-otp)
 * Request: { email, otp } or { email, code }
 * Response 200: { token: "<jwt>", user: { id, email, full_name, role, company_scope } }
 * Errors: 400 invalid/expired OTP; 422 validation.
 */
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp, code } = req.body;
    const submittedOtp = (otp || code || '').toString().trim();

    if (!email || !submittedOtp) {
      return res.status(422).json({ message: 'Email and OTP are required' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(422).json({ message: 'Invalid email format' });
    }

    if (submittedOtp.length !== 6) {
      return res.status(422).json({ message: 'OTP must be exactly 6 digits' });
    }

    const user = await db.orm.public.User
      .where({ email })
      .first();

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified. Please log in.' });
    }

    if (!user.verificationCode || user.verificationCode !== submittedOtp) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    if (user.verificationExpiresAt && new Date(user.verificationExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Mark user as verified and clear the verification code
    await db.orm.public.User
      .where({ id: user.id })
      .update({
        isEmailVerified: true,
        verificationCode: null,
        verificationExpiresAt: null,
      });

    // Issue JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as any,
      companyIds: user.companyIds ? [...user.companyIds] : [],
    });

    return res.json({
      message: 'Email verified successfully',
      token,
      user: formatUser({ ...user, isEmailVerified: true }),
    });
  } catch (error: any) {
    console.error('OTP verification error:', error);
    return res.status(500).json({ message: 'Error verifying OTP', error: error.message });
  }
};

/**
 * 3. POST /api/auth/resend (and /api/auth/resend-otp)
 * Request: { email }
 * Response 200: { message: "OTP resent" } Always 200 (anti-enumeration).
 */
export const resendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(200).json({ message: 'OTP resent' });
    }

    const user = await db.orm.public.User
      .where({ email })
      .first();

    if (!user || user.isEmailVerified) {
      return res.status(200).json({ message: 'OTP resent' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.orm.public.User
      .where({ id: user.id })
      .update({
        verificationCode: otp,
        verificationExpiresAt: expiresAt,
      });

    await sendVerificationEmail(email, otp);

    return res.status(200).json({ message: 'OTP resent' });
  } catch (error: any) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ message: 'Error resending OTP', error: error.message });
  }
};

/**
 * 4. POST /api/auth/login
 * Request: { email, password }
 * Response 200: { token: "<jwt>", user: { id, email, full_name, role, company_scope } }
 * Errors: 401 invalid credentials; 403 email not verified.
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = await db.orm.public.User
      .where({ email })
      .first();

    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify email status
    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Please verify your email address before logging in.',
        isEmailVerified: false,
        email: user.email,
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as any,
      companyIds: user.companyIds ? [...user.companyIds] : [],
    });

    return res.json({
      message: 'Login successful',
      token,
      user: formatUser(user),
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};

/**
 * 5. POST /api/auth/google
 * Request: { id_token } or { idToken }
 * Response 200: { token: "<jwt>", user: { id, email, full_name, role, company_scope } }
 * Errors: 400 invalid token.
 */
export const googleLogin = async (req: Request, res: Response) => {
  try {
    const tokenInput = req.body.id_token || req.body.idToken;

    if (!tokenInput) {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    // Verify the token with Google
    let googleUser;
    try {
      googleUser = await verifyGoogleToken(tokenInput);
    } catch (err: any) {
      return res.status(400).json({ message: 'Invalid Google token', error: err.message });
    }

    // Check if user already exists
    let user = await db.orm.public.User
      .where({ email: googleUser.email })
      .first();

    if (!user) {
      // First-time Google sign-in
      user = await db.orm.public.User.create({
        email: googleUser.email,
        googleId: googleUser.googleId,
        password: null,
        fullName: googleUser.name,
        role: 'Auditor',
        companyIds: [],
        isEmailVerified: true,
      });
    } else {
      // Existing user: link googleId and set verified
      const updates: Record<string, any> = {};
      if (!user.googleId) updates.googleId = googleUser.googleId;
      if (!user.isEmailVerified) updates.isEmailVerified = true;
      if (!user.fullName && googleUser.name) updates.fullName = googleUser.name;

      if (Object.keys(updates).length > 0) {
        await db.orm.public.User
          .where({ id: user.id })
          .update(updates);
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as any,
      companyIds: user.companyIds ? [...user.companyIds] : [],
    });

    return res.json({
      message: 'Google login successful',
      token,
      user: formatUser({ ...user, isEmailVerified: true }),
    });
  } catch (error: any) {
    console.error('Google login error:', error);
    return res.status(400).json({ message: 'Error with Google login', error: error.message });
  }
};

/**
 * 6. GET /api/auth/me
 * Header: Authorization: Bearer <token>
 * Response 200: { user: { id, email, full_name, role, company_scope } }
 * Errors: 401 invalid/expired token.
 */
export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const user = await db.orm.public.User
      .where({ id: userId })
      .first();

    if (!user) {
      return res.status(401).json({ message: 'User not found or deleted' });
    }

    return res.json({
      user: formatUser(user),
    });
  } catch (error: any) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
};

/**
 * 7. POST /api/auth/forgot-password
 * Request: { email }
 * Response 200: { message: "If the email exists, a reset link has been sent" }
 */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const genericSuccessMessage = 'If the email exists, a reset link has been sent';

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(200).json({ message: genericSuccessMessage });
    }

    const user = await db.orm.public.User
      .where({ email })
      .first();

    if (!user) {
      return res.status(200).json({ message: genericSuccessMessage });
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    await db.orm.public.User
      .where({ id: user.id })
      .update({
        resetPasswordToken: resetToken,
        resetPasswordExpiresAt: resetExpiresAt,
      });

    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://finance-on-leyva.base44.app';
    const resetLink = `${frontendBaseUrl}/reset-password?token=${resetToken}`;

    await sendPasswordResetEmail(user.email, resetLink);

    return res.status(200).json({ message: genericSuccessMessage });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'Error processing password reset request', error: error.message });
  }
};

/**
 * 8. POST /api/auth/reset-password
 * Request: { token, new_password } (also accepts resetToken, newPassword)
 * Response 200: { message: "Password reset" }
 * Errors: 400 invalid/expired token; 422 validation.
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const token = req.body.token || req.body.resetToken;
    const newPassword = req.body.new_password || req.body.newPassword;

    if (!token) {
      return res.status(422).json({ message: 'Reset token is required' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(422).json({ message: 'Password must be at least 8 characters long' });
    }

    // Find user with this reset token
    const user = await db.orm.public.User
      .where({ resetPasswordToken: token })
      .first();

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    if (!user.resetPasswordExpiresAt || new Date(user.resetPasswordExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db.orm.public.User
      .where({ id: user.id })
      .update({
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiresAt: null,
        isEmailVerified: true,
      });

    return res.status(200).json({ message: 'Password reset' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Error resetting password', error: error.message });
  }
};

/**
 * 9. POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 * Response 200: { message: "Logged out" }
 */
export const logout = async (req: Request, res: Response) => {
  return res.status(200).json({ message: 'Logged out' });
};
