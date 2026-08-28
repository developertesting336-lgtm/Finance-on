import nodemailer from 'nodemailer';

/**
 * Generate a random 6-digit verification code (OTP)
 */
export const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create a nodemailer transporter if SMTP credentials exist in environment
 */
const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  return null;
};

/**
 * Send an email verification code (OTP) to the user
 */
export const sendVerificationEmail = async (toEmail: string, otp: string): Promise<boolean> => {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || 'Finance-on <noreply@financeon.com>';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1a73e8; text-align: center;">Verify Your Email Address</h2>
      <p>Hello,</p>
      <p>Thank you for registering with Finance-on. Please use the following 6-digit verification code to complete your registration:</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #202124; background: #f1f3f4; padding: 10px 24px; border-radius: 6px; display: inline-block;">
          ${otp}
        </span>
      </div>
      <p style="color: #5f6368; font-size: 14px;">This code will expire in 10 minutes. If you did not request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #9aa0a6; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Finance-on. All rights reserved.</p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to: toEmail,
        subject: 'Your Finance-on Verification Code',
        text: `Your verification code is: ${otp}. It will expire in 10 minutes.`,
        html: htmlContent,
      });
      console.log(`✉️  Verification email sent to ${toEmail}`);
      return true;
    } catch (error) {
      console.error('Failed to send verification email via SMTP:', error);
    }
  }

  // Development fallback: Print directly to console
  console.log('\n=========================================');
  console.log(`✉️  [DEV EMAIL FALLBACK - VERIFY OTP]`);
  console.log(`To: ${toEmail}`);
  console.log(`Verification OTP: [ ${otp} ] (Expires in 10m)`);
  console.log('=========================================\n');

  return true;
};

/**
 * Send password reset email with the reset link
 */
export const sendPasswordResetEmail = async (toEmail: string, resetLink: string): Promise<boolean> => {
  const transporter = createTransporter();
  const from = process.env.SMTP_FROM || 'Finance-on <noreply@financeon.com>';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1a73e8; text-align: center;">Reset Your Password</h2>
      <p>Hello,</p>
      <p>We received a request to reset your password for your Finance-on account. Click the button below to choose a new password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" target="_blank" style="background-color: #1a73e8; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color: #5f6368; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #1a73e8; font-size: 13px;">${resetLink}</p>
      <p style="color: #5f6368; font-size: 14px;">This link will expire in 30 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #9aa0a6; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Finance-on. All rights reserved.</p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to: toEmail,
        subject: 'Reset Your Finance-on Password',
        text: `Click the following link to reset your password: ${resetLink} (Expires in 30 minutes)`,
        html: htmlContent,
      });
      console.log(`✉️  Password reset email sent to ${toEmail}`);
      return true;
    } catch (error) {
      console.error('Failed to send reset email via SMTP:', error);
    }
  }

  // Development fallback: Print directly to console
  console.log('\n=========================================');
  console.log(`✉️  [DEV EMAIL FALLBACK - PASSWORD RESET]`);
  console.log(`To: ${toEmail}`);
  console.log(`Reset Link: ${resetLink}`);
  console.log('=========================================\n');

  return true;
};
