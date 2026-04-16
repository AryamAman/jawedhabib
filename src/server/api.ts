import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
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
} from '@/src/lib/scheduling';

type PrismaRunner = PrismaClient | Prisma.TransactionClient;
type AuthRole = 'student' | 'admin';
type AuthPayload = {
  id: string;
  role: AuthRole;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const WEEK_IN_SECONDS = 60 * 60 * 24 * 7;
const GOOGLE_CALLBACK_PATH = '/api/auth/callback/google';
const LEGACY_GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-for-bits-pilani';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_BOOTSTRAP_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || '';
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
const SEED_SECRET = process.env.SEED_SECRET || '';
const authCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: WEEK_IN_SECONDS,
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

const seededStylists = [
  {
    name: 'Rahul Sharma',
    role: 'Senior Stylist',
    bio: 'Expert in modern cuts and coloring.',
    photo: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1974&fm=webp&fit=crop',
  },
  {
    name: 'Priya Patel',
    role: 'Hair Specialist',
    bio: 'Specializes in hair treatments and styling.',
    photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1961&fm=webp&fit=crop',
  },
  {
    name: 'Amit Kumar',
    role: 'Barber',
    bio: 'Master of beard grooming and classic cuts.',
    photo: 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?q=80&w=2080&fm=webp&fit=crop',
  },
];

const readForwardedHeader = (value: string | null) => value?.split(',')[0]?.trim();

const getRequestBaseUrl = (req: NextRequest) => {
  const forwardedProto = readForwardedHeader(req.headers.get('x-forwarded-proto'));
  const forwardedHost = readForwardedHeader(req.headers.get('x-forwarded-host'));

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  if (req.nextUrl.origin) {
    return req.nextUrl.origin;
  }

  return process.env.APP_URL?.replace(/\/$/, '') || `http://localhost:${PORT}`;
};

const getGoogleRedirectUri = (req: NextRequest) => `${getRequestBaseUrl(req)}${GOOGLE_CALLBACK_PATH}`;

const buildOAuthPopupResponse = (payload: Record<string, string>, redirectPath: string) => {
  const serializedPayload = JSON.stringify(payload);
  const serializedRedirectPath = JSON.stringify(redirectPath);
  const isSuccess = payload.type === 'OAUTH_AUTH_SUCCESS';

  return `<!DOCTYPE html>
<html lang="en">
  <body>
    <script>
      const payload = ${serializedPayload};
      const redirectPath = ${serializedRedirectPath};

      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
        window.close();
      } else {
        window.location.replace(redirectPath);
      }
    </script>
    <p>${isSuccess ? 'Authentication successful.' : 'Authentication failed.'} You can close this window.</p>
  </body>
</html>`;
};

const htmlResponse = (html: string, status = 200) =>
  new NextResponse(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });

const jsonResponse = (body: unknown, status = 200) => NextResponse.json(body, { status });

const errorResponse = (error: unknown, fallbackMessage = 'Server error') => {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.message }, error.status);
  }

  console.error(error);
  return jsonResponse({ error: fallbackMessage }, 500);
};

const setCookie = (response: NextResponse, name: string, value: string) => {
  response.cookies.set(name, value, authCookieOptions);
  return response;
};

const clearCookie = (response: NextResponse, name: string) => {
  response.cookies.set(name, '', {
    ...authCookieOptions,
    maxAge: 0,
  });
  return response;
};

const getTokenFromRequest = (req: NextRequest, cookieName: 'token' | 'adminToken') => {
  const authHeader = req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return req.cookies.get(cookieName)?.value;
};

const requireAuth = (req: NextRequest, role: AuthRole) => {
  const cookieName = role === 'admin' ? 'adminToken' : 'token';
  const token = getTokenFromRequest(req, cookieName);

  if (!token) {
    throw new HttpError(401, 'Unauthorized');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;

    if (decoded.role !== role) {
      throw new HttpError(403, 'Forbidden');
    }

    return decoded;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(401, 'Invalid token');
  }
};

const parseJsonBody = async <T>(req: NextRequest): Promise<T> => {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
};

const getBookingDurationMinutes = (booking: {
  duration_minutes: number;
  services?: { duration_minutes: number }[];
}) => {
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
    ...(includePrivateDetails
      ? {
          services: booking.services,
          student: booking.student,
          stylist: booking.stylist,
        }
      : {}),
  };
};

const getSchedulePayload = async (
  date: string,
  stylistId: string,
  includePrivateDetails: boolean,
  runner: PrismaRunner = prisma,
) => {
  await ensureDaySlots(date, stylistId, runner);

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
    bookings: bookings.map((booking) => buildScheduleBooking(booking as never, includePrivateDetails)),
  };
};

const validateWindowAvailability = async (options: {
  runner?: PrismaRunner;
  slotId: string;
  durationMinutes: number;
  excludeBookingId?: string;
}) => {
  const runner = options.runner ?? prisma;
  const slot = await runner.appointmentSlot.findUnique({ where: { id: options.slotId } });

  if (!slot) {
    throw new Error('Slot not found');
  }

  const schedule = await getSchedulePayload(slot.date, slot.stylist_id, false, runner);
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
  } else if (!isProduction && (await prisma.admin.count()) === 0) {
    const password_hash = await bcrypt.hash('admin123', 10);
    await prisma.admin.create({
      data: {
        email: 'admin@example.com',
        password_hash,
      },
    });
  }

  const existingServices = await prisma.service.findMany();
  for (const service of seededServices) {
    const exists = existingServices.find((existing) => existing.name === service.name);
    if (!exists) {
      await prisma.service.create({ data: service });
    }
  }

  const existingStylists = await prisma.stylist.findMany();

  if (existingStylists.length === 0) {
    await prisma.stylist.createMany({ data: seededStylists });
    return;
  }

  for (const stylist of seededStylists) {
    const existing = existingStylists.find((candidate) => candidate.name === stylist.name);

    if (!existing) {
      await prisma.stylist.create({ data: stylist });
      continue;
    }

    if (existing.photo !== stylist.photo || existing.bio !== stylist.bio || existing.role !== stylist.role) {
      await prisma.stylist.update({
        where: { id: existing.id },
        data: {
          role: stylist.role,
          bio: stylist.bio,
          photo: stylist.photo,
        },
      });
    }
  }
};

const seedTimelineSlots = async () => {
  const stylists = await prisma.stylist.findMany({
    select: { id: true },
  });

  if (stylists.length === 0 || (await prisma.appointmentSlot.count()) > 0) {
    return;
  }

  const today = new Date();

  for (const stylist of stylists) {
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() + index);
      const dateString = date.toISOString().split('T')[0];
      await ensureDaySlots(dateString, stylist.id);
    }
  }
};

let appReadyPromise: Promise<void> | null = null;
const ensureAppReady = () => {
  if (!appReadyPromise) {
    appReadyPromise = (async () => {
      await seedBaseData();
      await backfillBookingDurations();
      await seedTimelineSlots();
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
      const shouldPreserveProposal =
        booking.status === 'RESCHEDULE_PROPOSED' &&
        Boolean(booking.proposed_slot_id) &&
        !overlapsProposal;

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

const handleGoogleCallback = async (req: NextRequest) => {
  const code = req.nextUrl.searchParams.get('code');

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return htmlResponse('Google sign-in is not configured yet', 503);
  }

  if (!code) {
    return htmlResponse(
      buildOAuthPopupResponse(
        { type: 'OAUTH_AUTH_ERROR', error: 'Missing OAuth code' },
        '/login',
      ),
      400,
    );
  }

  const redirectUri = getGoogleRedirectUri(req);
  const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);

  try {
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token ?? '',
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const email = payload?.email?.toLowerCase();
    const name = payload?.name || 'Google User';
    const googleId = payload?.sub;

    if (!email) {
      return htmlResponse(
        buildOAuthPopupResponse(
          { type: 'OAUTH_AUTH_ERROR', error: 'No email provided by Google' },
          '/login',
        ),
      );
    }

    let student = await prisma.student.findUnique({ where: { email } });

    if (!student) {
      student = await prisma.student.create({
        data: { name, email, google_id: googleId },
      });
    } else if (!student.google_id) {
      student = await prisma.student.update({
        where: { email },
        data: { google_id: googleId },
      });
    }

    const flow = req.nextUrl.searchParams.get('state') || 'student';

    if (flow === 'admin') {
      if (!ADMIN_EMAILS.includes(email)) {
        return htmlResponse(
          buildOAuthPopupResponse(
            { type: 'OAUTH_AUTH_ERROR', error: 'Not authorized as admin' },
            '/admin/login',
          ),
        );
      }

      let admin = await prisma.admin.findUnique({ where: { email } });
      if (!admin) {
        admin = await prisma.admin.create({
          data: { email, password_hash: '' },
        });
      }

      const adminToken = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
      const response = htmlResponse(
        buildOAuthPopupResponse(
          { type: 'OAUTH_AUTH_SUCCESS', token: adminToken, role: 'admin' },
          '/admin',
        ),
      );

      setCookie(response, 'adminToken', adminToken);
      return response;
    }

    const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
    const response = htmlResponse(
      buildOAuthPopupResponse(
        { type: 'OAUTH_AUTH_SUCCESS', token, role: 'student' },
        '/dashboard',
      ),
    );

    setCookie(response, 'token', token);
    return response;
  } catch (error) {
    console.error('Google OAuth error:', error);
    return htmlResponse(
      buildOAuthPopupResponse(
        { type: 'OAUTH_AUTH_ERROR', error: 'Authentication failed' },
        '/login',
      ),
    );
  }
};

export async function handleApiRequest(req: NextRequest, segments: string[]) {
  await ensureAppReady();

  const path = `/${segments.join('/')}`;
  const method = req.method.toUpperCase();

  if (method === 'POST' && path === '/auth/signup') {
    try {
      let { name, email, password, confirmPassword } = await parseJsonBody<{
        name?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
      }>(req);

      email = email?.trim().toLowerCase();

      if (!email) {
        return jsonResponse({ error: 'Email is required' }, 400);
      }

      if (password !== confirmPassword) {
        return jsonResponse({ error: 'Passwords do not match' }, 400);
      }

      const existingUser = await prisma.student.findUnique({ where: { email } });
      if (existingUser) {
        return jsonResponse({ error: 'Email already registered' }, 400);
      }

      const password_hash = await bcrypt.hash(password || '', 10);
      const student = await prisma.student.create({
        data: { name: name || 'Student', email, password_hash },
      });

      const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      const response = jsonResponse({
        message: 'Signup successful',
        token,
        user: {
          id: student.id,
          name: student.name,
          email: student.email,
        },
      });

      setCookie(response, 'token', token);
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && path === '/auth/login') {
    try {
      let { email, password } = await parseJsonBody<{
        email?: string;
        password?: string;
      }>(req);

      email = email?.trim().toLowerCase();

      const student = email ? await prisma.student.findUnique({ where: { email } }) : null;
      if (!student) {
        return jsonResponse({ error: 'Invalid credentials' }, 400);
      }

      if (!student.password_hash) {
        return jsonResponse({ error: 'Please sign in with Google' }, 400);
      }

      const isMatch = await bcrypt.compare(password || '', student.password_hash);
      if (!isMatch) {
        return jsonResponse({ error: 'Invalid credentials' }, 400);
      }

      const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      const response = jsonResponse({
        message: 'Login successful',
        token,
        user: {
          id: student.id,
          name: student.name,
          email: student.email,
        },
      });

      setCookie(response, 'token', token);
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && path === '/auth/logout') {
    const response = jsonResponse({ message: 'Logged out' });
    clearCookie(response, 'token');
    clearCookie(response, 'adminToken');
    return response;
  }

  if (method === 'GET' && path === '/auth/google/url') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return jsonResponse({ error: 'Google sign-in is not configured yet' }, 503);
    }

    const flow = req.nextUrl.searchParams.get('flow') || 'student';
    const redirectUri = getGoogleRedirectUri(req);
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['email', 'profile'],
      prompt: 'consent',
      state: flow,
    });

    return jsonResponse({ url });
  }

  if (
    method === 'GET' &&
    (path === '/auth/callback/google' || path === '/auth/google/callback')
  ) {
    return handleGoogleCallback(req);
  }

  if (method === 'GET' && path === '/auth/me') {
    try {
      const user = requireAuth(req, 'student');
      const student = await prisma.student.findUnique({ where: { id: user.id } });

      if (!student) {
        return jsonResponse({ error: 'User not found' }, 404);
      }

      return jsonResponse({
        user: {
          id: student.id,
          name: student.name,
          email: student.email,
        },
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'GET' && path === '/admin/me') {
    try {
      const adminUser = requireAuth(req, 'admin');
      const admin = await prisma.admin.findUnique({ where: { id: adminUser.id } });

      if (!admin) {
        return jsonResponse({ error: 'Admin not found' }, 404);
      }

      return jsonResponse({
        admin: {
          id: admin.id,
          email: admin.email,
        },
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'GET' && path === '/services') {
    const services = await prisma.service.findMany();
    return jsonResponse(services);
  }

  if (method === 'GET' && path === '/stylists') {
    const stylists = await prisma.stylist.findMany();
    return jsonResponse(stylists);
  }

  if (method === 'GET' && path === '/slots') {
    const date = req.nextUrl.searchParams.get('date');
    const stylistId = req.nextUrl.searchParams.get('stylist_id');

    if (!date || !stylistId) {
      return jsonResponse({ error: 'date and stylist_id are required' }, 400);
    }

    try {
      const schedule = await getSchedulePayload(date, stylistId, false);
      return jsonResponse(schedule);
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && path === '/book') {
    try {
      const user = requireAuth(req, 'student');
      const { service_ids, stylist_id, slot_id } = await parseJsonBody<{
        service_ids?: string[];
        stylist_id?: string;
        slot_id?: string;
      }>(req);

      if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
        return jsonResponse({ error: 'At least one service must be selected' }, 400);
      }

      const booking = await prisma.$transaction(async (tx) => {
        const services = await tx.service.findMany({
          where: { id: { in: service_ids } },
        });

        if (services.length !== service_ids.length) {
          throw new Error('One or more services could not be found');
        }

        const durationMinutes = services.reduce((total, service) => total + service.duration_minutes, 0);
        const slot = await validateWindowAvailability({
          runner: tx,
          slotId: slot_id || '',
          durationMinutes,
        });

        if (slot.stylist_id !== stylist_id) {
          throw new Error('Selected time does not belong to the chosen stylist');
        }

        return tx.booking.create({
          data: {
            student_id: user.id,
            stylist_id: stylist_id || '',
            slot_id: slot_id || '',
            duration_minutes: durationMinutes,
            status: 'PENDING',
            services: {
              connect: service_ids.map((id) => ({ id })),
            },
          },
          include: {
            slot: true,
            services: true,
            stylist: true,
          },
        });
      });

      return jsonResponse({ message: 'Booking successful', booking });
    } catch (error) {
      return errorResponse(error, 'Booking failed');
    }
  }

  if (method === 'GET' && path === '/student/bookings') {
    try {
      const user = requireAuth(req, 'student');
      const bookings = await prisma.booking.findMany({
        where: { student_id: user.id },
        include: {
          services: true,
          stylist: true,
          slot: true,
          proposed_slot: true,
        },
        orderBy: { created_at: 'desc' },
      });

      return jsonResponse(bookings);
    } catch (error) {
      return errorResponse(error);
    }
  }

  const cancelMatch = method === 'DELETE' ? path.match(/^\/student\/cancel\/([^/]+)$/) : null;
  if (cancelMatch) {
    try {
      const user = requireAuth(req, 'student');
      const bookingId = cancelMatch[1];
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

      if (!booking || booking.student_id !== user.id) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          proposed_slot_id: null,
        },
      });

      return jsonResponse({ message: 'Booking cancelled' });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const rescheduleMatch = method === 'PUT' ? path.match(/^\/student\/bookings\/([^/]+)\/reschedule$/) : null;
  if (rescheduleMatch) {
    try {
      const user = requireAuth(req, 'student');
      const bookingId = rescheduleMatch[1];
      const { new_slot_id } = await parseJsonBody<{ new_slot_id?: string }>(req);
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { services: true, slot: true },
      });

      if (!booking || booking.student_id !== user.id) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }

      if (booking.status !== 'NEEDS_RESCHEDULE') {
        return jsonResponse({ error: 'Booking does not need reschedule' }, 400);
      }

      if (new_slot_id === booking.slot_id) {
        return jsonResponse({ error: 'Cannot reschedule to the exact same time.' }, 400);
      }

      await prisma.$transaction(async (tx) => {
        const durationMinutes = getBookingDurationMinutes(booking);
        const newSlot = await validateWindowAvailability({
          runner: tx,
          slotId: new_slot_id || '',
          durationMinutes,
          excludeBookingId: booking.id,
        });

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            slot_id: new_slot_id || '',
            stylist_id: newSlot.stylist_id,
            status: 'RESCHEDULE_PENDING',
            proposed_slot_id: null,
          },
        });
      });

      return jsonResponse({ message: 'Rescheduled successfully' });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const rescheduleResponseMatch =
    method === 'PUT' ? path.match(/^\/student\/bookings\/([^/]+)\/reschedule-response$/) : null;
  if (rescheduleResponseMatch) {
    try {
      const user = requireAuth(req, 'student');
      const bookingId = rescheduleResponseMatch[1];
      const { accept } = await parseJsonBody<{ accept?: boolean }>(req);
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { proposed_slot: true, services: true, slot: true },
      });

      if (!booking || booking.student_id !== user.id) {
        return jsonResponse({ error: 'Unauthorized' }, 403);
      }

      if (booking.status !== 'RESCHEDULE_PROPOSED' || !booking.proposed_slot_id || !booking.proposed_slot) {
        return jsonResponse({ error: 'No reschedule proposed' }, 400);
      }

      const durationMinutes = getBookingDurationMinutes(booking);

      if (accept) {
        await validateWindowAvailability({
          slotId: booking.proposed_slot_id,
          durationMinutes,
          excludeBookingId: booking.id,
        });

        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            slot_id: booking.proposed_slot_id,
            stylist_id: booking.proposed_slot.stylist_id,
            proposed_slot_id: null,
            status: 'CONFIRMED',
          },
        });

        return jsonResponse({
          message: 'New time accepted successfully',
          status: 'CONFIRMED',
        });
      }

      const originalSlotStillValid = await canKeepBookingWindow({
        slotId: booking.slot_id,
        durationMinutes,
        bookingId: booking.id,
      });

      await prisma.booking.update({
        where: { id: bookingId },
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

      return jsonResponse({
        message: originalSlotStillValid
          ? 'Original time kept'
          : 'Original time is no longer available. Please choose a new time.',
        status: originalSlotStillValid ? 'CONFIRMED' : 'NEEDS_RESCHEDULE',
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && path === '/admin/login') {
    try {
      let { email, password } = await parseJsonBody<{
        email?: string;
        password?: string;
      }>(req);

      email = email?.trim().toLowerCase();
      const admin = email ? await prisma.admin.findUnique({ where: { email } }) : null;

      if (!admin) {
        return jsonResponse({ error: 'Invalid credentials' }, 400);
      }

      const isMatch = await bcrypt.compare(password || '', admin.password_hash);
      if (!isMatch) {
        return jsonResponse({ error: 'Invalid credentials' }, 400);
      }

      const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
      const response = jsonResponse({
        message: 'Login successful',
        token,
        admin: {
          id: admin.id,
          email: admin.email,
        },
      });

      setCookie(response, 'adminToken', token);
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'GET' && path === '/admin/schedule') {
    try {
      requireAuth(req, 'admin');
      const date = req.nextUrl.searchParams.get('date');
      const stylistId = req.nextUrl.searchParams.get('stylist_id');

      if (!date || !stylistId) {
        return jsonResponse({ error: 'date and stylist_id are required' }, 400);
      }

      const schedule = await getSchedulePayload(date, stylistId, true);
      return jsonResponse(schedule);
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'GET' && path === '/admin/bookings') {
    try {
      requireAuth(req, 'admin');
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

      return jsonResponse(bookings);
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'GET' && path === '/admin/records') {
    try {
      requireAuth(req, 'admin');
      const date = req.nextUrl.searchParams.get('date');

      if (!date) {
        return jsonResponse({ error: 'date is required' }, 400);
      }

      const records = await prisma.booking.findMany({
        where: {
          status: 'CONFIRMED',
          slot: { is: { date } },
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

      return jsonResponse(records);
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && path === '/admin/undo') {
    try {
      requireAuth(req, 'admin');
      const { booking_updates = [], slot_updates = [] } = await parseJsonBody<{
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
      }>(req);

      await prisma.$transaction(async (tx) => {
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

      return jsonResponse({ message: 'Action undone successfully' });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const adminStatusMatch = method === 'PUT' ? path.match(/^\/admin\/bookings\/([^/]+)\/status$/) : null;
  if (adminStatusMatch) {
    try {
      requireAuth(req, 'admin');
      const bookingId = adminStatusMatch[1];
      const { status } = await parseJsonBody<{ status?: string }>(req);
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

      if (!booking) {
        return jsonResponse({ error: 'Booking not found' }, 404);
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status,
          proposed_slot_id:
            status === 'CONFIRMED' && booking.status !== 'RESCHEDULE_PROPOSED'
              ? booking.proposed_slot_id
              : null,
        },
      });

      return jsonResponse({ message: `Booking ${String(status).toLowerCase()}` });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const adminProposeMatch =
    method === 'PUT' ? path.match(/^\/admin\/bookings\/([^/]+)\/propose-slot$/) : null;
  if (adminProposeMatch) {
    try {
      requireAuth(req, 'admin');
      const bookingId = adminProposeMatch[1];
      const { new_slot_id } = await parseJsonBody<{ new_slot_id?: string }>(req);
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { services: true, slot: true },
      });

      if (!booking) {
        return jsonResponse({ error: 'Booking not found' }, 404);
      }

      if (new_slot_id === booking.slot_id) {
        return jsonResponse({ error: 'Choose a different time to reschedule this booking' }, 400);
      }

      await prisma.$transaction(async (tx) => {
        const durationMinutes = getBookingDurationMinutes(booking);
        await validateWindowAvailability({
          runner: tx,
          slotId: new_slot_id || '',
          durationMinutes,
          excludeBookingId: booking.id,
        });

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            proposed_slot_id: new_slot_id || '',
            status: 'RESCHEDULE_PROPOSED',
          },
        });
      });

      return jsonResponse({ message: 'New time proposed successfully' });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && path === '/admin/slots/generate') {
    try {
      requireAuth(req, 'admin');
      const { date, stylist_id } = await parseJsonBody<{
        date?: string;
        stylist_id?: string;
      }>(req);

      if (!date || !stylist_id) {
        return jsonResponse({ error: 'date and stylist_id are required' }, 400);
      }

      await ensureDaySlots(date, stylist_id);
      return jsonResponse({ message: 'Timeline generated successfully' });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'PUT' && path === '/admin/slots/range') {
    try {
      requireAuth(req, 'admin');
      const { date, stylist_id, start_time, end_time, status } = await parseJsonBody<{
        date?: string;
        stylist_id?: string;
        start_time?: string;
        end_time?: string;
        status?: 'AVAILABLE' | 'UNAVAILABLE';
      }>(req);

      if (!date || !stylist_id || !start_time || !end_time || !status) {
        return jsonResponse(
          { error: 'date, stylist_id, start_time, end_time, and status are required' },
          400,
        );
      }

      if (!['AVAILABLE', 'UNAVAILABLE'].includes(status)) {
        return jsonResponse({ error: 'Invalid slot status' }, 400);
      }

      await prisma.$transaction(async (tx) => {
        await applySlotRangeStatus({
          runner: tx,
          date,
          stylistId: stylist_id,
          startTime: start_time,
          endTime: end_time,
          status,
        });
      });

      return jsonResponse({ message: `Range marked ${status.toLowerCase()}` });
    } catch (error) {
      return errorResponse(error);
    }
  }

  const adminSlotMatch = method === 'PUT' ? path.match(/^\/admin\/slots\/([^/]+)$/) : null;
  if (adminSlotMatch) {
    try {
      requireAuth(req, 'admin');
      const slotId = adminSlotMatch[1];
      const { status } = await parseJsonBody<{ status?: 'AVAILABLE' | 'UNAVAILABLE' }>(req);

      if (!status || !['AVAILABLE', 'UNAVAILABLE'].includes(status)) {
        return jsonResponse({ error: 'Invalid slot status' }, 400);
      }

      const slot = await prisma.appointmentSlot.findUnique({ where: { id: slotId } });

      if (!slot) {
        return jsonResponse({ error: 'Slot not found' }, 404);
      }

      const endTime = addMinutes(slot.time, SLOT_INTERVAL_MINUTES);
      await prisma.$transaction(async (tx) => {
        await applySlotRangeStatus({
          runner: tx,
          date: slot.date,
          stylistId: slot.stylist_id,
          startTime: slot.time,
          endTime,
          status,
        });
      });

      return jsonResponse({ message: `Slot marked ${status.toLowerCase()}` });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && path === '/admin/seed') {
    const providedSeedSecret = req.headers.get('x-seed-secret');

    if (isProduction && (!SEED_SECRET || providedSeedSecret !== SEED_SECRET)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    try {
      await seedBaseData();
      await seedTimelineSlots();
      return jsonResponse({ message: 'Database seeded' });
    } catch (error) {
      return errorResponse(error, 'Manual seed failed');
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
