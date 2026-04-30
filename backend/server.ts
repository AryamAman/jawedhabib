import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import {
  DAY_END_TIME,
  DAY_START_TIME,
  SLOT_INTERVAL_MINUTES,
  addMinutes,
  generateTimeSteps,
  getBookingOccupancyRanges,
  isStartTimeSelectable,
  normalizeBaseSlotStatus,
  rangesOverlap,
  timeToMinutes,
} from '../src/lib/scheduling.js';
import { normalizePhoneNumber } from '../src/lib/phone.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();
globalForPrisma.prisma = prisma;

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const PORT = Number(process.env.PORT || 3000);

const requireProductionEnv = (name: string) => {
  const value = process.env[name];

  if (value) {
    return value;
  }

  if (isProduction) {
    throw new Error(`${name} must be set in production`);
  }

  return '';
};

const getBaseUrl = () => {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return `http://localhost:${PORT}`;
};

const APP_URL = getBaseUrl();
const GOOGLE_CALLBACK_PATH = process.env.GOOGLE_CALLBACK_PATH || '/api/auth/callback/google';
const LEGACY_GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${APP_URL}${GOOGLE_CALLBACK_PATH}`;
const POST_MESSAGE_TARGET_ORIGIN = APP_URL;
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? requireProductionEnv('JWT_SECRET') : 'local-development-jwt-secret-change-me');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
const STUDENT_EMAIL_DOMAINS = (process.env.STUDENT_EMAIL_DOMAINS || 'pilani.bits-pilani.ac.in')
  .split(',')
  .map((domain) => domain.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_BOOTSTRAP_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || '';
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
const SEED_SECRET = process.env.SEED_SECRET || '';
const SHOULD_AUTO_BOOTSTRAP = !isProduction || process.env.AUTO_BOOTSTRAP_ON_REQUEST === 'true';
const ENABLE_ADMIN_PASSWORD_LOGIN = process.env.ENABLE_ADMIN_PASSWORD_LOGIN === 'true';
const PUBLIC_CACHE_TTL_SECONDS = 60 * 5;
const PUBLIC_CACHE_TTL_MS = PUBLIC_CACHE_TTL_SECONDS * 1000;
const OAUTH_STATE_COOKIE = 'oauthState';
const ALLOWED_OAUTH_FLOWS = new Set(['student_signup', 'student_login', 'admin']);
const ALLOWED_BOOKING_STATUSES = new Set([
  'PENDING',
  'CONFIRMED',
  'NEEDS_RESCHEDULE',
  'RESCHEDULE_PENDING',
  'RESCHEDULE_PROPOSED',
  'CANCELLED',
  'REJECTED',
]);
const authCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 1000 * 60 * 60 * 24 * 7,
};
const oauthStateCookieOptions = {
  ...authCookieOptions,
  maxAge: 1000 * 60 * 10,
};
const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
};

type PublicCacheKey = 'services' | 'stylists';

const publicDataCache = new Map<PublicCacheKey, { expiresAt: number; value: unknown }>();
const PROFILE_COMPLETION_ERROR = 'Please complete your profile with a valid phone number before continuing.';

if (isProduction && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

const logServerError = (label: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : undefined;

  console.error(label, {
    message,
    ...(code ? { code } : {}),
  });
};

type OAuthFlow = 'student_signup' | 'student_login' | 'admin';

const signValue = (value: string) => (
  createHmac('sha256', JWT_SECRET).update(value).digest('base64url')
);

const createOAuthState = (flow: OAuthFlow) => {
  const payload = Buffer.from(JSON.stringify({
    flow,
    nonce: randomBytes(16).toString('base64url'),
    createdAt: Date.now(),
  })).toString('base64url');

  return `${payload}.${signValue(payload)}`;
};

const verifyOAuthState = (state: unknown, expectedState: unknown): OAuthFlow | null => {
  if (typeof state !== 'string' || typeof expectedState !== 'string' || state !== expectedState) {
    return null;
  }

  const [payload, signature] = state.split('.');
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signValue(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      flow?: string;
      createdAt?: number;
    };

    if (!parsed.flow || !ALLOWED_OAUTH_FLOWS.has(parsed.flow) || typeof parsed.createdAt !== 'number') {
      return null;
    }

    if (Date.now() - parsed.createdAt > oauthStateCookieOptions.maxAge) {
      return null;
    }

    return parsed.flow as OAuthFlow;
  } catch {
    return null;
  }
};

const rateLimitBuckets = new Map<string, { resetAt: number; count: number }>();

const createRateLimiter = ({
  keyPrefix,
  windowMs,
  max,
}: {
  keyPrefix: string;
  windowMs: number;
  max: number;
}) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `${keyPrefix}:${ip}`;
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    next();
    return;
  }

  bucket.count += 1;

  if (bucket.count > max) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    return;
  }

  next();
};

const escapeHtml = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const clearPublicDataCache = () => {
  publicDataCache.clear();
};

const getCachedPublicData = async <T>(key: PublicCacheKey, loader: () => Promise<T>) => {
  const cached = publicDataCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await loader();
  publicDataCache.set(key, {
    value,
    expiresAt: now + PUBLIC_CACHE_TTL_MS,
  });

  return value;
};

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    next();
  });
  app.use('/api/auth/google/url', createRateLimiter({ keyPrefix: 'oauth-url', windowMs: 10 * 60 * 1000, max: 20 }));
  app.use('/api/auth/callback/google', createRateLimiter({ keyPrefix: 'oauth-callback', windowMs: 10 * 60 * 1000, max: 30 }));
  app.use('/api/auth/google/callback', createRateLimiter({ keyPrefix: 'oauth-callback-legacy', windowMs: 10 * 60 * 1000, max: 30 }));
  app.use('/api/admin/login', createRateLimiter({ keyPrefix: 'admin-login', windowMs: 15 * 60 * 1000, max: 5 }));
  app.use('/api/student/profile', createRateLimiter({ keyPrefix: 'student-profile', windowMs: 10 * 60 * 1000, max: 30 }));
  app.use('/api/book', createRateLimiter({ keyPrefix: 'student-book', windowMs: 10 * 60 * 1000, max: 20 }));
  app.use('/api/admin', (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      next();
      return;
    }

    createRateLimiter({ keyPrefix: 'admin-mutation', windowMs: 10 * 60 * 1000, max: 120 })(req, res, next);
  });
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureAppReady();
      next();
    } catch (error) {
      logServerError('Runtime bootstrap failed', error);
      res.status(500).json({ error: 'Server initialization failed' });
    }
  });

  // --- API Routes ---

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
      if (decoded.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const authenticateAdmin = (req: any, res: any, next: any) => {
    const token = req.cookies.adminToken;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  type StudentProfileRecord = {
    id: string;
    name: string;
    email: string;
    phone_e164: string | null;
    phone_display: string | null;
    phone_verified: boolean;
    profile_completed: boolean;
  };

  const formatStudentProfile = (student: StudentProfileRecord) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    phone: student.phone_display ?? '',
    phoneE164: student.phone_e164,
    phoneVerified: student.phone_verified,
    profileCompleted: student.profile_completed && Boolean(student.phone_e164),
  });

  type BookingDisplayStatus =
    | 'Requested'
    | 'Confirmed'
    | 'Asked to Reschedule'
    | 'Reschedule Proposed'
    | 'Rescheduled'
    | 'Expired'
    | 'Cancelled'
    | 'Rejected';

  type BookingLifecyclePresentation = {
    isExpired: boolean;
    isUpcoming: boolean;
    displayStatus: BookingDisplayStatus;
    canCancel: boolean;
    canRespondToReschedule: boolean;
    canAdminConfirm: boolean;
    canAdminReject: boolean;
    canAdminAskReschedule: boolean;
    canAdminProposeSlot: boolean;
    canAdminCancel: boolean;
  };

  const INDIA_TIME_ZONE = 'Asia/Kolkata';

  const getDateStringInTimeZone = (date: Date, timeZone: string = INDIA_TIME_ZONE) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  };

  const getTodayDateInIndia = () => getDateStringInTimeZone(new Date(), INDIA_TIME_ZONE);

  const getRawBookingDisplayStatus = (status: string): BookingDisplayStatus => {
    if (status === 'PENDING') {
      return 'Requested';
    }

    if (status === 'CONFIRMED') {
      return 'Confirmed';
    }

    if (status === 'NEEDS_RESCHEDULE') {
      return 'Asked to Reschedule';
    }

    if (status === 'RESCHEDULE_PROPOSED') {
      return 'Reschedule Proposed';
    }

    if (status === 'RESCHEDULE_PENDING') {
      return 'Rescheduled';
    }

    if (status === 'CANCELLED') {
      return 'Cancelled';
    }

    if (status === 'REJECTED') {
      return 'Rejected';
    }

    return 'Requested';
  };

  const buildBookingPresentation = (booking: { status: string; slot: { date: string } }): BookingLifecyclePresentation => {
    const todayDate = getTodayDateInIndia();
    const bookingDate = booking.slot.date;
    const isExpired = bookingDate < todayDate;
    const isUpcoming = bookingDate > todayDate;
    const isTerminal = booking.status === 'CANCELLED' || booking.status === 'REJECTED';
    const displayStatus = isExpired && !isTerminal
      ? 'Expired'
      : getRawBookingDisplayStatus(booking.status);
    const isActionable = !isExpired && !isTerminal;

    return {
      isExpired,
      isUpcoming,
      displayStatus,
      canCancel: isActionable && booking.status !== 'RESCHEDULE_PROPOSED',
      canRespondToReschedule: isActionable && booking.status === 'RESCHEDULE_PROPOSED',
      canAdminConfirm: isActionable && (booking.status === 'PENDING' || booking.status === 'RESCHEDULE_PENDING'),
      canAdminReject: isActionable && (booking.status === 'PENDING' || booking.status === 'RESCHEDULE_PENDING'),
      canAdminAskReschedule: isActionable && (
        booking.status === 'PENDING'
        || booking.status === 'RESCHEDULE_PENDING'
        || booking.status === 'CONFIRMED'
      ),
      canAdminProposeSlot: isActionable && (
        booking.status === 'CONFIRMED'
        || booking.status === 'PENDING'
        || booking.status === 'RESCHEDULE_PENDING'
        || booking.status === 'RESCHEDULE_PROPOSED'
      ),
      canAdminCancel: isActionable,
    };
  };

  const withBookingPresentation = <T extends { status: string; slot: { date: string } }>(booking: T) => ({
    ...booking,
    ...buildBookingPresentation(booking),
  });

  const assertBookingIsActionable = (
    booking: { status: string; slot: { date: string } },
    message = 'This booking can no longer be modified.',
  ) => {
    const presentation = buildBookingPresentation(booking);

    if (presentation.isExpired || presentation.displayStatus === 'Cancelled' || presentation.displayStatus === 'Rejected') {
      const error = new Error(message);
      error.name = 'BOOKING_NOT_ACTIONABLE';
      throw error;
    }

    return presentation;
  };

  const isPrismaUniqueConstraintError = (error: unknown, field: string) => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const targets = Array.isArray(error.meta?.target)
      ? error.meta?.target
      : typeof error.meta?.target === 'string'
        ? [error.meta.target]
        : [];

    return targets.includes(field);
  };

  const loadStudentProfileRecord = async (studentId: string) => prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      phone_e164: true,
      phone_display: true,
      phone_verified: true,
      profile_completed: true,
    },
  });

  const requireCompletedStudentProfile = async (studentId: string) => {
    const student = await loadStudentProfileRecord(studentId);

    if (!student) {
      const error = new Error('User not found');
      error.name = 'NOT_FOUND';
      throw error;
    }

    if (!student.profile_completed || !student.phone_e164) {
      const error = new Error(PROFILE_COMPLETION_ERROR);
      error.name = 'PROFILE_INCOMPLETE';
      throw error;
    }

    return student;
  };

  const buildPopupResponse = (payload: Record<string, unknown>, fallbackPath: string, message: string) => `
    <html><body>
      <script>
        const payload = ${JSON.stringify(payload)};
        if (window.opener) {
          window.opener.postMessage(payload, ${JSON.stringify(POST_MESSAGE_TARGET_ORIGIN)});
          window.close();
        } else {
          window.location.href = ${JSON.stringify(fallbackPath)};
        }
      </script>
      <p>${escapeHtml(message)}</p>
    </body></html>
  `;

  const buildPopupErrorResponse = (error: string) => buildPopupResponse(
    { type: 'OAUTH_AUTH_ERROR', error },
    '/login',
    `${error} You can close this window.`,
  );

  const isAllowedStudentEmail = (email: string) => (
    STUDENT_EMAIL_DOMAINS.some((domain) => email.endsWith(`@${domain}`))
  );

  // Auth Routes
  app.post('/api/auth/signup', (_req, res) => {
    res.status(405).json({ error: 'Student accounts must be created with Google sign-up.' });
  });

  app.post('/api/auth/login', (_req, res) => {
    res.status(405).json({ error: 'Student accounts must use Google sign-in.' });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', authCookieOptions);
    res.clearCookie('adminToken', authCookieOptions);
    res.json({ message: 'Logged out' });
  });

  app.get('/api/auth/google/url', (req, res) => {
    const { flow } = req.query;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ error: 'Google sign-in is not configured yet' });
    }

    if (typeof flow !== 'string' || !ALLOWED_OAUTH_FLOWS.has(flow)) {
      return res.status(400).json({ error: 'Unknown authentication flow' });
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const state = createOAuthState(flow as OAuthFlow);
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    const url = client.generateAuthUrl({
      scope: ['email', 'profile'],
      state,
    });
    res.cookie(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions);
    res.json({ url });
  });

  app.get([GOOGLE_CALLBACK_PATH, LEGACY_GOOGLE_CALLBACK_PATH], async (req, res) => {
    const { code, state } = req.query;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).send('Google sign-in is not configured yet');
    }

    if (typeof code !== 'string') {
      return res.send(buildPopupErrorResponse('Missing Google authorization code.'));
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const flow = verifyOAuthState(state, req.cookies[OAUTH_STATE_COOKIE]);
    res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions);

    if (!flow) {
      return res.send(buildPopupErrorResponse('Authentication request expired. Please try again.'));
    }

    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    
    try {
      const { tokens } = await client.getToken(code as string);
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      
      const email = payload?.email?.toLowerCase();
      const name = payload?.name || 'Google User';
      const googleId = payload?.sub;

      if (!email || !googleId) {
        return res.send(buildPopupErrorResponse('No email provided by Google.'));
      }

      if (payload?.email_verified !== true) {
        return res.send(buildPopupErrorResponse('Google email must be verified before signing in.'));
      }

      let role = 'student';

      if (flow === 'admin') {
        // Check if email is in admin whitelist
        if (ADMIN_EMAILS.includes(email)) {
          // Ensure admin record exists
          let admin = await prisma.admin.findUnique({ where: { email } });
          if (!admin) {
            admin = await prisma.admin.create({ data: { email, password_hash: '' } }); // password_hash empty for OAuth admins
          }
          role = 'admin';
          const adminToken = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
          res.clearCookie('token', authCookieOptions);
          res.cookie('adminToken', adminToken, authCookieOptions);
          res.send(buildPopupResponse(
            { type: 'OAUTH_AUTH_SUCCESS', role },
            '/admin',
            'Authentication successful. This window should close automatically.',
          ));
          return;
        } else {
          return res.send(buildPopupErrorResponse('Not authorized as admin.'));
        }
      }

      if (!isAllowedStudentEmail(email)) {
        return res.send(buildPopupErrorResponse('Only BITS Pilani student email IDs can access student accounts.'));
      }

      const isStudentSignup = flow === 'student_signup';
      const isStudentLogin = flow === 'student_login';

      let student = await prisma.student.findUnique({ where: { email } });

      if (isStudentSignup) {
        if (!student) {
          student = await prisma.student.create({
            data: {
              name,
              email,
              google_id: googleId,
              profile_completed: false,
            },
          });
        } else if (student.google_id && student.google_id !== googleId) {
          return res.send(buildPopupErrorResponse('This email is already linked to a different Google account.'));
        } else if (student.google_id && student.profile_completed && student.phone_e164) {
          return res.send(buildPopupErrorResponse('Student account already exists. Please sign in instead.'));
        } else {
          student = await prisma.student.update({
            where: { email },
            data: {
              name,
              google_id: googleId,
            },
          });
        }
      } else if (isStudentLogin) {
        if (!student || !student.google_id) {
          return res.send(buildPopupErrorResponse('No student account found. Please sign up first.'));
        }

        if (student.google_id !== googleId) {
          return res.send(buildPopupErrorResponse('Use the Google account you originally signed up with.'));
        }

        if (student.name !== name) {
          student = await prisma.student.update({
            where: { email },
            data: { name },
          });
        }
      } else {
        return res.send(buildPopupErrorResponse('Unknown authentication flow.'));
      }

      const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      res.clearCookie('adminToken', authCookieOptions);
      res.cookie('token', token, authCookieOptions);

      const formattedStudent = formatStudentProfile(student);
      const fallbackPath = formattedStudent.profileCompleted ? '/dashboard' : '/profile';
      res.send(buildPopupResponse(
        {
          type: 'OAUTH_AUTH_SUCCESS',
          role,
          profileCompleted: formattedStudent.profileCompleted,
        },
        fallbackPath,
        'Authentication successful. This window should close automatically.',
      ));
    } catch (error) {
      logServerError('Google OAuth error', error);
      res.send(`
        <html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Authentication failed' }, ${JSON.stringify(POST_MESSAGE_TARGET_ORIGIN)});
              window.close();
            }
          </script>
          <p>Authentication failed. You can close this window.</p>
        </body></html>
      `);
    }
  });

  app.get('/api/auth/me', authenticate, async (req: any, res) => {
    try {
      const student = await loadStudentProfileRecord(req.user.id);
      if (!student) return res.status(404).json({ error: 'User not found' });
      res.json({ user: formatStudentProfile(student) });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/student/profile', authenticate, async (req: any, res) => {
    try {
      const student = await loadStudentProfileRecord(req.user.id);
      if (!student) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user: formatStudentProfile(student) });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/student/profile', authenticate, async (req: any, res) => {
    let { name, phone } = req.body;
    name = name?.trim();

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone number are required' });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Enter a valid phone number' });
    }

    try {
      const currentStudent = await prisma.student.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          phone_e164: true,
          phone_verified: true,
        },
      });

      if (!currentStudent) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updatedStudent = await prisma.student.update({
        where: { id: req.user.id },
        data: {
          name,
          phone_e164: normalizedPhone.e164,
          phone_display: normalizedPhone.display,
          phone_verified: currentStudent.phone_e164 === normalizedPhone.e164 ? currentStudent.phone_verified : false,
          profile_completed: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone_e164: true,
          phone_display: true,
          phone_verified: true,
          profile_completed: true,
        },
      });

      res.json({ message: 'Profile updated successfully', user: formatStudentProfile(updatedStudent) });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error, 'phone_e164')) {
        return res.status(409).json({ error: 'Phone number already registered' });
      }

      logServerError('Profile update error', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/admin/me', authenticateAdmin, async (req: any, res) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.user.id } });
      if (!admin) return res.status(404).json({ error: 'Admin not found' });
      res.json({ admin: { id: admin.id, email: admin.email } });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  type PrismaRunner = typeof prisma | Prisma.TransactionClient;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const isRetryableTransactionError = (error: unknown) => {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message;
    return (
      message.includes('Unable to start a transaction in the given time') ||
      message.includes('Transaction already closed') ||
      message.includes('Transaction not found') ||
      message.includes('expired transaction') ||
      message.includes('Transaction API error')
    );
  };

  const runInteractiveTransaction = async <T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    maxAttempts = 3,
  ) => {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;

      try {
        return await prisma.$transaction(operation, INTERACTIVE_TRANSACTION_OPTIONS);
      } catch (error) {
        lastError = error;

        if (!isRetryableTransactionError(error) || attempt >= maxAttempts) {
          throw error;
        }

        console.warn('Retrying transaction after transient failure', { attempt, maxAttempts });
        await wait(attempt * 200);
      }
    }

    throw lastError;
  };

  const seededServices = [
    { name: 'Haircut', duration_minutes: 30, price: 500 },
    { name: 'Hair Styling', duration_minutes: 45, price: 800 },
    { name: 'Hair Coloring', duration_minutes: 120, price: 2500 },
    { name: 'Beard Grooming', duration_minutes: 30, price: 300 },
    { name: 'Hair Treatment', duration_minutes: 60, price: 1500 },
    { name: 'Head Massage', duration_minutes: 20, price: 400 },
    { name: 'Facial', duration_minutes: 45, price: 1200 },
    { name: 'Shave', duration_minutes: 20, price: 250 },
  ];

  const getBookingDurationMinutes = (booking: { duration_minutes: number; services?: { duration_minutes: number }[] }) => {
    if (booking.duration_minutes > 0) {
      return booking.duration_minutes;
    }

    return booking.services?.reduce((total, service) => total + service.duration_minutes, 0) ?? 0;
  };

  const ensureDaySlots = async (date: string, stylistId: string, runner: PrismaRunner = prisma) => {
    const existingSlots = await runner.appointmentSlot.findMany({
      where: { date, stylist_id: stylistId },
      select: { time: true },
    });

    const existingTimes = new Set(existingSlots.map((slot) => slot.time));
    const missingSlots = generateTimeSteps(DAY_START_TIME, DAY_END_TIME, SLOT_INTERVAL_MINUTES)
      .filter((time) => !existingTimes.has(time))
      .map((time) => ({
        date,
        time,
        stylist_id: stylistId,
        status: 'AVAILABLE',
      }));

    if (missingSlots.length > 0) {
      await runner.appointmentSlot.createMany({ data: missingSlots });
    }
  };

  const buildScheduleBooking = (
    booking: {
      id: string;
      status: string;
      duration_minutes: number;
      slot_id: string;
      proposed_slot_id: string | null;
      slot: { time: string };
      proposed_slot: { time: string } | null;
      services?: { id: string; name: string; price: number; duration_minutes: number }[];
      student?: { name: string; email: string };
      stylist?: { id: string; name: string };
    },
    includePrivateDetails: boolean,
  ) => {
    const durationMinutes = getBookingDurationMinutes(booking);

    return {
      id: booking.id,
      status: booking.status,
      duration_minutes: durationMinutes,
      slot_id: booking.slot_id,
      proposed_slot_id: booking.proposed_slot_id,
      start_time: booking.slot.time,
      end_time: addMinutes(booking.slot.time, durationMinutes),
      proposed_start_time: booking.proposed_slot?.time ?? null,
      proposed_end_time: booking.proposed_slot ? addMinutes(booking.proposed_slot.time, durationMinutes) : null,
      ...(includePrivateDetails ? {
        services: booking.services,
        student: booking.student,
        stylist: booking.stylist,
      } : {}),
    };
  };

  const buildSchedulePayload = async (date: string, stylistId: string, includePrivateDetails: boolean, runner: PrismaRunner = prisma) => {
    const [slots, bookings] = await Promise.all([
      runner.appointmentSlot.findMany({
        where: { date, stylist_id: stylistId },
        orderBy: { time: 'asc' },
      }),
      runner.booking.findMany({
        where: {
          status: { notIn: ['CANCELLED', 'REJECTED'] },
          OR: [
            { slot: { is: { date, stylist_id: stylistId } } },
            { proposed_slot: { is: { date, stylist_id: stylistId } } },
          ],
        },
        include: includePrivateDetails
          ? { slot: true, proposed_slot: true, services: true, student: true, stylist: true }
          : { slot: true, proposed_slot: true },
      }),
    ]);

    return {
      meta: {
        date,
        stylist_id: stylistId,
        dayStart: DAY_START_TIME,
        dayEnd: DAY_END_TIME,
        stepMinutes: SLOT_INTERVAL_MINUTES,
      },
      slots: slots.map((slot) => ({
        ...slot,
        status: normalizeBaseSlotStatus(slot.status),
      })),
      bookings: bookings.map((booking) => buildScheduleBooking(booking as any, includePrivateDetails)),
    };
  };

  const getSchedulePayload = async (date: string, stylistId: string, includePrivateDetails: boolean, runner: PrismaRunner = prisma) => {
    await ensureDaySlots(date, stylistId, runner);
    return buildSchedulePayload(date, stylistId, includePrivateDetails, runner);
  };

  const validateWindowAvailability = async (options: {
    runner?: PrismaRunner;
    slotId: string;
    durationMinutes: number;
    excludeBookingId?: string;
    skipEnsureDaySlots?: boolean;
  }) => {
    const runner = options.runner ?? prisma;
    const slot = await runner.appointmentSlot.findUnique({ where: { id: options.slotId } });

    if (!slot) {
      throw new Error('Slot not found');
    }

    const schedule = options.skipEnsureDaySlots
      ? await buildSchedulePayload(slot.date, slot.stylist_id, false, runner)
      : await getSchedulePayload(slot.date, slot.stylist_id, false, runner);
    const isAvailable = isStartTimeSelectable({
      slotTime: slot.time,
      slots: schedule.slots,
      bookings: schedule.bookings,
      durationMinutes: options.durationMinutes,
      dayEnd: schedule.meta.dayEnd,
      stepMinutes: schedule.meta.stepMinutes,
      excludeBookingId: options.excludeBookingId,
    });

    if (!isAvailable) {
      throw new Error('Selected time is no longer available');
    }

    return slot;
  };

  const canKeepBookingWindow = async (options: {
    runner?: PrismaRunner;
    slotId: string;
    durationMinutes: number;
    bookingId: string;
  }) => {
    try {
      await validateWindowAvailability({
        runner: options.runner,
        slotId: options.slotId,
        durationMinutes: options.durationMinutes,
        excludeBookingId: options.bookingId,
      });
      return true;
    } catch {
      return false;
    }
  };

  const backfillBookingDurations = async () => {
    const bookingsNeedingDuration = await prisma.booking.findMany({
      where: { duration_minutes: 0 },
      include: { services: true },
    });

    for (const booking of bookingsNeedingDuration) {
      const durationMinutes = getBookingDurationMinutes(booking);

      if (durationMinutes > 0) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { duration_minutes: durationMinutes },
        });
      }
    }
  };

  const seedBaseData = async () => {
    if (ADMIN_BOOTSTRAP_EMAIL && ADMIN_BOOTSTRAP_PASSWORD) {
      const existingBootstrapAdmin = await prisma.admin.findUnique({
        where: { email: ADMIN_BOOTSTRAP_EMAIL },
      });

      if (!existingBootstrapAdmin) {
        const password_hash = await bcrypt.hash(ADMIN_BOOTSTRAP_PASSWORD, 10);
        await prisma.admin.create({
          data: {
            email: ADMIN_BOOTSTRAP_EMAIL,
            password_hash,
          },
        });
      }
    }

    const existingServices = await prisma.service.findMany();
    for (const service of seededServices) {
      const exists = existingServices.find((existing) => existing.name === service.name);
      if (!exists) {
        await prisma.service.create({ data: service });
      }
    }

    if ((await prisma.stylist.count()) === 0) {
      await prisma.stylist.createMany({
        data: [
          { name: 'Rahul Sharma', role: 'Senior Stylist', bio: 'Expert in modern cuts and coloring.' },
          { name: 'Priya Patel', role: 'Hair Specialist', bio: 'Specializes in hair treatments and styling.' },
          { name: 'Amit Kumar', role: 'Barber', bio: 'Master of beard grooming and classic cuts.' },
        ],
      });
    }
  };

  const seedTimelineSlots = async () => {
    const stylist = await prisma.stylist.findFirst();

    if (!stylist || (await prisma.appointmentSlot.count()) > 0) {
      return;
    }

    const today = new Date();
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() + index);
      const dateString = date.toISOString().split('T')[0];
      await ensureDaySlots(dateString, stylist.id);
    }
  };

  let appReadyPromise: Promise<void> | null = null;
  const ensureAppReady = (force = false) => {
    if (!force && !SHOULD_AUTO_BOOTSTRAP) {
      return Promise.resolve();
    }

    if (!appReadyPromise) {
      appReadyPromise = (async () => {
        await seedBaseData();
        await backfillBookingDurations();
      })();
    }

    return appReadyPromise;
  };

  const applySlotRangeStatus = async (options: {
    runner?: PrismaRunner;
    date: string;
    stylistId: string;
    startTime: string;
    endTime: string;
    status: 'AVAILABLE' | 'UNAVAILABLE';
  }) => {
    const runner = options.runner ?? prisma;
    const rangeStartMinutes = timeToMinutes(options.startTime);
    const rangeEndMinutes = timeToMinutes(options.endTime);

    if (rangeEndMinutes <= rangeStartMinutes) {
      throw new Error('Invalid time range');
    }

    await ensureDaySlots(options.date, options.stylistId, runner);

    const slots = await runner.appointmentSlot.findMany({
      where: { date: options.date, stylist_id: options.stylistId },
      orderBy: { time: 'asc' },
    });

    const impactedSlots = slots.filter((slot) => {
      const minute = timeToMinutes(slot.time);
      return minute >= rangeStartMinutes && minute < rangeEndMinutes;
    });

    if (impactedSlots.length === 0) {
      throw new Error('No timeline segments found in the selected range');
    }

    await runner.appointmentSlot.updateMany({
      where: { id: { in: impactedSlots.map((slot) => slot.id) } },
      data: { status: options.status },
    });

    if (options.status !== 'UNAVAILABLE') {
      return;
    }

    const bookings = await runner.booking.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        OR: [
          { slot: { is: { date: options.date, stylist_id: options.stylistId } } },
          { proposed_slot: { is: { date: options.date, stylist_id: options.stylistId } } },
        ],
      },
      include: {
        slot: true,
        proposed_slot: true,
        services: true,
      },
    });

    for (const booking of bookings) {
      const scheduleBooking = buildScheduleBooking(booking, false);
      const ranges = getBookingOccupancyRanges(scheduleBooking);
      const overlapsCurrent = ranges.some((range) => (
        range.type === 'current' && rangesOverlap(rangeStartMinutes, rangeEndMinutes, range.startMinutes, range.endMinutes)
      ));
      const overlapsProposal = ranges.some((range) => (
        range.type === 'proposed' && rangesOverlap(rangeStartMinutes, rangeEndMinutes, range.startMinutes, range.endMinutes)
      ));

      if (overlapsCurrent) {
        const shouldPreserveProposal = booking.status === 'RESCHEDULE_PROPOSED'
          && Boolean(booking.proposed_slot_id)
          && !overlapsProposal;

        if (shouldPreserveProposal) {
          continue;
        }

        await runner.booking.update({
          where: { id: booking.id },
          data: {
            status: 'NEEDS_RESCHEDULE',
            proposed_slot_id: null,
          },
        });
      } else if (overlapsProposal && booking.status === 'RESCHEDULE_PROPOSED') {
        const durationMinutes = getBookingDurationMinutes(booking);
        const originalSlotStillValid = await canKeepBookingWindow({
          runner,
          slotId: booking.slot_id,
          durationMinutes,
          bookingId: booking.id,
        });

        await runner.booking.update({
          where: { id: booking.id },
          data: {
            status: originalSlotStillValid ? 'CONFIRMED' : 'NEEDS_RESCHEDULE',
            proposed_slot_id: null,
          },
        });
      }
    }
  };

  // Public Routes
  app.get('/api/services', async (req, res) => {
    const services = await getCachedPublicData('services', () => prisma.service.findMany());
    res.set('Cache-Control', `public, s-maxage=${PUBLIC_CACHE_TTL_SECONDS}, stale-while-revalidate=${PUBLIC_CACHE_TTL_SECONDS * 2}`);
    res.json(services);
  });

  app.get('/api/stylists', async (req, res) => {
    const stylists = await getCachedPublicData('stylists', () => prisma.stylist.findMany());
    res.set('Cache-Control', `public, s-maxage=${PUBLIC_CACHE_TTL_SECONDS}, stale-while-revalidate=${PUBLIC_CACHE_TTL_SECONDS * 2}`);
    res.json(stylists);
  });

  app.get('/api/slots', async (req, res) => {
    const { date, stylist_id } = req.query;

    if (!date || !stylist_id) {
      return res.status(400).json({ error: 'date and stylist_id are required' });
    }

    try {
      const schedule = await getSchedulePayload(date as string, stylist_id as string, false);
      res.json(schedule);
    } catch (error) {
      logServerError('Error loading public schedule', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Booking Routes
  app.post('/api/book', authenticate, async (req: any, res) => {
    const { service_ids, stylist_id, slot_id } = req.body;
    const student_id = req.user.id;

    if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
      return res.status(400).json({ error: 'At least one service must be selected' });
    }

    try {
      await requireCompletedStudentProfile(student_id);

      const services = await prisma.service.findMany({
        where: { id: { in: service_ids } },
      });

      if (services.length !== service_ids.length) {
        throw new Error('One or more services could not be found');
      }

      const durationMinutes = services.reduce((total, service) => total + service.duration_minutes, 0);
      const slot = await validateWindowAvailability({
        slotId: slot_id,
        durationMinutes,
      });

      if (slot.stylist_id !== stylist_id) {
        throw new Error('Selected time does not belong to the chosen stylist');
      }

      const booking = await prisma.booking.create({
        data: {
          student_id,
          stylist_id,
          slot_id,
          duration_minutes: durationMinutes,
          status: 'PENDING',
          services: {
            connect: service_ids.map((id: string) => ({ id })),
          },
        },
        include: {
          slot: true,
          services: true,
          stylist: true,
        },
      });

      res.json({ message: 'Booking successful', booking });
    } catch (error: any) {
      if (error?.name === 'PROFILE_INCOMPLETE') {
        return res.status(403).json({ error: error.message });
      }
      if (error?.name === 'NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      logServerError('Booking error', error);
      res.status(400).json({ error: error.message || 'Booking failed' });
    }
  });

  app.get('/api/student/bookings', authenticate, async (req: any, res) => {
    try {
      const bookings = await prisma.booking.findMany({
        where: { student_id: req.user.id },
        include: {
          services: true,
          stylist: true,
          slot: true,
          proposed_slot: true,
        },
        orderBy: { created_at: 'desc' },
      });
      res.json(bookings.map((booking) => withBookingPresentation(booking)));
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/student/cancel/:id', authenticate, async (req: any, res) => {
    const bookingId = req.params.id;

    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { slot: true },
      });
      if (!booking || booking.student_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const presentation = assertBookingIsActionable(booking, 'This booking can no longer be cancelled.');

      if (!presentation.canCancel) {
        return res.status(400).json({ error: 'This booking cannot be cancelled right now.' });
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          proposed_slot_id: null,
        },
      });

      res.json({ message: 'Booking cancelled' });
    } catch (error: any) {
      if (error?.name === 'BOOKING_NOT_ACTIONABLE') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/student/bookings/:id/reschedule', authenticate, async (req: any, res) => {
    const { id } = req.params;
    const { new_slot_id } = req.body;

    try {
      await requireCompletedStudentProfile(req.user.id);

      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { services: true, slot: true },
      });

      if (!booking || booking.student_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      assertBookingIsActionable(booking, 'This booking can no longer be rescheduled.');

      if (booking.status !== 'NEEDS_RESCHEDULE') {
        return res.status(400).json({ error: 'Booking does not need reschedule' });
      }

      if (new_slot_id === booking.slot_id) {
        return res.status(400).json({ error: 'Cannot reschedule to the exact same time.' });
      }

      const durationMinutes = getBookingDurationMinutes(booking);
      const newSlot = await validateWindowAvailability({
        slotId: new_slot_id,
        durationMinutes,
        excludeBookingId: booking.id,
      });

      await prisma.booking.update({
        where: { id },
        data: {
          slot_id: new_slot_id,
          stylist_id: newSlot.stylist_id,
          status: 'RESCHEDULE_PENDING',
          proposed_slot_id: null,
        },
      });

      res.json({ message: 'Rescheduled successfully' });
    } catch (error: any) {
      if (error?.name === 'BOOKING_NOT_ACTIONABLE') {
        return res.status(400).json({ error: error.message });
      }
      if (error?.name === 'PROFILE_INCOMPLETE') {
        return res.status(403).json({ error: error.message });
      }
      if (error?.name === 'NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      res.status(400).json({ error: error.message || 'Server error' });
    }
  });

  app.put('/api/student/bookings/:id/reschedule-response', authenticate, async (req: any, res) => {
    const { id } = req.params;
    const { accept } = req.body;

    try {
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { proposed_slot: true, services: true, slot: true },
      });

      if (!booking || booking.student_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const presentation = assertBookingIsActionable(booking, 'This booking can no longer be updated.');

      if (!presentation.canRespondToReschedule) {
        return res.status(400).json({ error: 'No active reschedule proposal found.' });
      }

      if (booking.status !== 'RESCHEDULE_PROPOSED' || !booking.proposed_slot_id || !booking.proposed_slot) {
        return res.status(400).json({ error: 'No reschedule proposed' });
      }

      const durationMinutes = getBookingDurationMinutes(booking);

      if (accept) {
        await validateWindowAvailability({
          slotId: booking.proposed_slot_id,
          durationMinutes,
          excludeBookingId: booking.id,
        });

        await prisma.booking.update({
          where: { id },
          data: {
            slot_id: booking.proposed_slot_id,
            stylist_id: booking.proposed_slot.stylist_id,
            proposed_slot_id: null,
            status: 'CONFIRMED',
          },
        });

        return res.json({ message: 'New time accepted successfully', status: 'CONFIRMED' });
      }

      const originalSlotStillValid = await canKeepBookingWindow({
        slotId: booking.slot_id,
        durationMinutes,
        bookingId: booking.id,
      });

      await prisma.booking.update({
        where: { id },
        data: originalSlotStillValid
          ? {
              proposed_slot_id: null,
              status: 'CONFIRMED',
            }
          : {
              proposed_slot_id: null,
              status: 'NEEDS_RESCHEDULE',
            },
      });

      res.json({
        message: originalSlotStillValid
          ? 'Original time kept'
          : 'Original time is no longer available. Please choose a new time.',
        status: originalSlotStillValid ? 'CONFIRMED' : 'NEEDS_RESCHEDULE',
      });
    } catch (error: any) {
      if (error?.name === 'BOOKING_NOT_ACTIONABLE') {
        return res.status(400).json({ error: error.message });
      }
      res.status(400).json({ error: error.message || 'Server error' });
    }
  });

  // Admin Routes
  app.post('/api/admin/login', async (req, res) => {
    if (!ENABLE_ADMIN_PASSWORD_LOGIN) {
      return res.status(404).json({ error: 'Admin password login is disabled' });
    }

    let { email, password } = req.body;
    email = email?.trim().toLowerCase();

    try {
      const admin = await prisma.admin.findUnique({ where: { email } });
      if (!admin) return res.status(400).json({ error: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, admin.password_hash);
      if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
      res.clearCookie('token', authCookieOptions);
      res.cookie('adminToken', token, authCookieOptions);

      res.json({ message: 'Login successful', admin: { id: admin.id, email: admin.email } });
    } catch (error: any) {
      if (error?.name === 'BOOKING_NOT_ACTIONABLE') {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/admin/schedule', authenticateAdmin, async (req, res) => {
    const { date, stylist_id } = req.query;

    if (!date || !stylist_id) {
      return res.status(400).json({ error: 'date and stylist_id are required' });
    }

    try {
      const schedule = await getSchedulePayload(date as string, stylist_id as string, true);
      res.json(schedule);
    } catch (error) {
      logServerError('Error loading admin schedule', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
    try {
      const bookings = await prisma.booking.findMany({
        include: {
          student: true,
          services: true,
          stylist: true,
          slot: true,
          proposed_slot: true,
        },
        orderBy: { created_at: 'desc' },
      });
      res.json(bookings.map((booking) => withBookingPresentation(booking)));
    } catch (error) {
      logServerError('Error fetching admin bookings', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/admin/records', authenticateAdmin, async (req, res) => {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    try {
      const records = await prisma.booking.findMany({
        where: {
          slot: { is: { date: date as string } },
        },
        include: {
          student: true,
          services: true,
          stylist: true,
          slot: true,
          proposed_slot: true,
        },
      });

      records.sort((first, second) => {
        if (first.slot.date !== second.slot.date) {
          return first.slot.date.localeCompare(second.slot.date);
        }

        if (first.slot.time !== second.slot.time) {
          return first.slot.time.localeCompare(second.slot.time);
        }

        if (first.stylist.name !== second.stylist.name) {
          return first.stylist.name.localeCompare(second.stylist.name);
        }

        return first.student.name.localeCompare(second.student.name);
      });

      res.json(records.map((booking) => withBookingPresentation(booking)));
    } catch (error) {
      logServerError('Error fetching daily records', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/admin/undo', authenticateAdmin, async (req, res) => {
    const {
      booking_updates = [],
      slot_updates = [],
    } = req.body as {
      booking_updates?: Array<{
        id: string;
        status: string;
        slot_id: string;
        proposed_slot_id?: string | null;
        stylist_id: string;
      }>;
      slot_updates?: Array<{
        id: string;
        status: string;
      }>;
    };

    const validBookingUpdates = booking_updates.every((bookingUpdate) => (
      typeof bookingUpdate.id === 'string' &&
      typeof bookingUpdate.slot_id === 'string' &&
      typeof bookingUpdate.stylist_id === 'string' &&
      ALLOWED_BOOKING_STATUSES.has(bookingUpdate.status) &&
      (bookingUpdate.proposed_slot_id === undefined || bookingUpdate.proposed_slot_id === null || typeof bookingUpdate.proposed_slot_id === 'string')
    ));
    const validSlotUpdates = slot_updates.every((slotUpdate) => (
      typeof slotUpdate.id === 'string' &&
      ['AVAILABLE', 'UNAVAILABLE'].includes(slotUpdate.status)
    ));

    if (!validBookingUpdates || !validSlotUpdates) {
      return res.status(400).json({ error: 'Invalid undo payload' });
    }

    try {
      await runInteractiveTransaction(async (tx) => {
        for (const bookingUpdate of booking_updates) {
          await tx.booking.update({
            where: { id: bookingUpdate.id },
            data: {
              status: bookingUpdate.status,
              slot_id: bookingUpdate.slot_id,
              proposed_slot_id: bookingUpdate.proposed_slot_id ?? null,
              stylist_id: bookingUpdate.stylist_id,
            },
          });
        }

        for (const slotUpdate of slot_updates) {
          await tx.appointmentSlot.update({
            where: { id: slotUpdate.id },
            data: { status: slotUpdate.status },
          });
        }
      });

      res.json({ message: 'Action undone successfully' });
    } catch (error) {
      logServerError('Error undoing admin action', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/bookings/:id/status', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (typeof status !== 'string' || !ALLOWED_BOOKING_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid booking status' });
    }

    try {
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { slot: true },
      });
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const presentation = assertBookingIsActionable(booking);

      if (status === 'CONFIRMED' && !presentation.canAdminConfirm) {
        return res.status(400).json({ error: 'This booking cannot be confirmed right now.' });
      }

      if (status === 'REJECTED' && !presentation.canAdminReject) {
        return res.status(400).json({ error: 'This booking cannot be rejected right now.' });
      }

      if (status === 'NEEDS_RESCHEDULE' && !presentation.canAdminAskReschedule) {
        return res.status(400).json({ error: 'This booking cannot be marked for reschedule right now.' });
      }

      if (status === 'CANCELLED' && !presentation.canAdminCancel) {
        return res.status(400).json({ error: 'This booking cannot be cancelled right now.' });
      }

      await prisma.booking.update({
        where: { id },
        data: {
          status,
          proposed_slot_id: status === 'CONFIRMED' && booking.status !== 'RESCHEDULE_PROPOSED' ? booking.proposed_slot_id : null,
        },
      });

      res.json({ message: `Booking ${status.toLowerCase()}` });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/bookings/:id/propose-slot', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { new_slot_id } = req.body;

    try {
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { services: true, slot: true },
      });

      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const presentation = assertBookingIsActionable(booking);

      if (!presentation.canAdminProposeSlot) {
        return res.status(400).json({ error: 'This booking cannot be moved right now.' });
      }

      if (new_slot_id === booking.slot_id) {
        return res.status(400).json({ error: 'Choose a different time to reschedule this booking' });
      }

      const durationMinutes = getBookingDurationMinutes(booking);
      await validateWindowAvailability({
        slotId: new_slot_id,
        durationMinutes,
        excludeBookingId: booking.id,
      });

      await prisma.booking.update({
        where: { id },
        data: {
          proposed_slot_id: new_slot_id,
          status: 'RESCHEDULE_PROPOSED',
        },
      });

      res.json({ message: 'New time proposed successfully' });
    } catch (error: any) {
      if (error?.name === 'BOOKING_NOT_ACTIONABLE') {
        return res.status(400).json({ error: error.message });
      }
      res.status(400).json({ error: error.message || 'Server error' });
    }
  });

  app.post('/api/admin/slots/generate', authenticateAdmin, async (req, res) => {
    const { date, stylist_id } = req.body;

    if (!date || !stylist_id) {
      return res.status(400).json({ error: 'date and stylist_id are required' });
    }

    try {
      await ensureDaySlots(date, stylist_id);
      res.json({ message: 'Timeline generated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/slots/range', authenticateAdmin, async (req, res) => {
    const { date, stylist_id, start_time, end_time, status } = req.body;

    if (!date || !stylist_id || !start_time || !end_time || !status) {
      return res.status(400).json({ error: 'date, stylist_id, start_time, end_time, and status are required' });
    }

    if (!['AVAILABLE', 'UNAVAILABLE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid slot status' });
    }

    try {
      await runInteractiveTransaction(async (tx) => {
        await applySlotRangeStatus({
          runner: tx,
          date,
          stylistId: stylist_id,
          startTime: start_time,
          endTime: end_time,
          status,
        });
      });

      res.json({ message: `Range marked ${status.toLowerCase()}` });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Server error' });
    }
  });

  app.put('/api/admin/slots/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['AVAILABLE', 'UNAVAILABLE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid slot status' });
    }

    try {
      const slot = await prisma.appointmentSlot.findUnique({ where: { id } });

      if (!slot) {
        return res.status(404).json({ error: 'Slot not found' });
      }

      const endTime = addMinutes(slot.time, SLOT_INTERVAL_MINUTES);
      await runInteractiveTransaction(async (tx) => {
        await applySlotRangeStatus({
          runner: tx,
          date: slot.date,
          stylistId: slot.stylist_id,
          startTime: slot.time,
          endTime,
          status,
        });
      });

      res.json({ message: `Slot marked ${status.toLowerCase()}` });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Server error' });
    }
  });

  app.post('/api/admin/seed', async (req, res) => {
    const providedSeedSecret = req.headers['x-seed-secret'];

    if (isProduction && (!SEED_SECRET || providedSeedSecret !== SEED_SECRET)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      await ensureAppReady(true);
      await seedTimelineSlots();
      clearPublicDataCache();
      res.json({ message: 'Database seeded' });
    } catch (error) {
      logServerError('Manual seed failed', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Vite middleware for development
  async function startViteAndListen() {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', async () => {
      console.log('Server running', { port: PORT });

      try {
        await ensureAppReady(true);
        await seedTimelineSlots();
      } catch (err) {
        logServerError('Auto-seeding failed', err);
      }
    });
}

if (!isProduction && !process.env.VERCEL) {
  startViteAndListen();
}

export default app;
