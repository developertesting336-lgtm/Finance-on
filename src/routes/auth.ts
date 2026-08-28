import { Router } from 'express';
import {
  register,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  login,
  googleLogin,
  getProfile,
  logout,
} from '../controllers/auth.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// 1. POST /api/auth/register - Register a new user & send OTP
router.post('/register', register);

// 2. POST /api/auth/verify (and alias /verify-otp) - Verify email with 6-digit OTP
router.post('/verify', verifyOtp);
router.post('/verify-otp', verifyOtp);

// 3. POST /api/auth/resend (and alias /resend-otp) - Resend 6-digit OTP
router.post('/resend', resendOtp);
router.post('/resend-otp', resendOtp);

// 4. POST /api/auth/login - Log in an existing user (requires verified email)
router.post('/login', login);

// 5. POST /api/auth/google - Sign in / sign up with Google ID token
router.post('/google', googleLogin);

// 6. GET /api/auth/me - Get current logged-in user profile (Protected)
router.get('/me', authenticateToken, getProfile);

// 7. POST /api/auth/forgot-password - Send password reset link
router.post('/forgot-password', forgotPassword);

// 8. POST /api/auth/reset-password - Reset password using reset token
router.post('/reset-password', resetPassword);

// 9. POST /api/auth/logout - Log out current session
router.post('/logout', authenticateToken, logout);

export default router;
