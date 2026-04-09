import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
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
} from '../src/lib/scheduling';

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === 'production';
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
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? requireProductionEnv('JWT_SECRET') : 'super-secret-jwt-key-for-bits-pilani');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
const ADMIN_BOOTSTRAP_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || '';
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
const SEED_SECRET = process.env.SEED_SECRET || '';
const authCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
};

const app = express();

app.set('trust proxy', 1);

  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureAppReady();
      next();
    } catch (error) {
      console.error('Runtime bootstrap failed:', error);
      res.status(500).json({ error: 'Server initialization failed' });
    }
  });

  // --- API Routes ---

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const authenticateAdmin = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : req.cookies.adminToken;
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

  // Auth Routes
  app.post('/api/auth/signup', async (req, res) => {
    console.log('Signup request received:', req.body);
    let { name, email, password, confirmPassword } = req.body;
    email = email?.trim().toLowerCase();
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
      const existingUser = await prisma.student.findUnique({ where: { email } });
      if (existingUser) return res.status(400).json({ error: 'Email already registered' });

      const password_hash = await bcrypt.hash(password, 10);
      const student = await prisma.student.create({
        data: { name, email, password_hash }
      });

      const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, authCookieOptions);
      
      res.json({ message: 'Signup successful', token, user: { id: student.id, name: student.name, email: student.email } });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    console.log('Login request received:', req.body);
    let { email, password } = req.body;
    email = email?.trim().toLowerCase();
    
    try {
      const student = await prisma.student.findUnique({ where: { email } });
      if (!student) return res.status(400).json({ error: 'Invalid credentials' });

      if (!student.password_hash) {
        return res.status(400).json({ error: 'Please sign in with Google' });
      }

      const isMatch = await bcrypt.compare(password, student.password_hash);
      if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, authCookieOptions);
      
      res.json({ message: 'Login successful', token, user: { id: student.id, name: student.name, email: student.email } });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', authCookieOptions);
    res.json({ message: 'Logged out' });
  });

  app.get('/api/auth/google/url', (req, res) => {
    const { flow } = req.query; // 'student' or 'admin'
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({ error: 'Google sign-in is not configured yet' });
    }

    const redirectUri = `${APP_URL}/api/auth/google/callback`;
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['email', 'profile'],
      prompt: 'consent',
      state: flow as string || 'student',
    });
    res.json({ url });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).send('Google sign-in is not configured yet');
    }

    const redirectUri = `${APP_URL}/api/auth/google/callback`;
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    
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

      if (!email) {
        return res.send(`
          <html><body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'No email provided by Google' }, '*');
                window.close();
              }
            </script>
            <p>No email provided by Google. You can close this window.</p>
          </body></html>
        `);
      }

      let student = await prisma.student.findUnique({ where: { email } });
      
      if (!student) {
        student = await prisma.student.create({
          data: { name, email, google_id: googleId }
        });
      } else if (!student.google_id) {
        student = await prisma.student.update({
          where: { email },
          data: { google_id: googleId }
        });
      }

      let role = 'student';
      const flow = req.query.state as string;

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
          res.cookie('adminToken', adminToken, authCookieOptions);
          res.send(`
            <html><body>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${adminToken}', role: '${role}' }, '*');
                  window.close();
                } else {
                  window.location.href = '/admin';
                }
              </script>
              <p>Authentication successful. This window should close automatically.</p>
            </body></html>
          `);
          return;
        } else {
          return res.send(`
            <html><body>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Not authorized as admin' }, '*');
                  window.close();
                }
              </script>
              <p>Not authorized as admin. You can close this window.</p>
            </body></html>
          `);
        }
      }
      const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, authCookieOptions);
      
      res.send(`
        <html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${token}', role: '${role}' }, '*');
              window.close();
            } else {
              window.location.href = '/dashboard';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body></html>
      `);
    } catch (error) {
      console.error('Google OAuth error:', error);
      res.send(`
        <html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Authentication failed' }, '*');
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
      const student = await prisma.student.findUnique({ where: { id: req.user.id } });
      if (!student) return res.status(404).json({ error: 'User not found' });
      res.json({ user: { id: student.id, name: student.name, email: student.email } });
    } catch (error) {
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

  type PrismaRunner = PrismaClient | Prisma.TransactionClient;

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

  const getSchedulePayload = async (date: string, stylistId: string, includePrivateDetails: boolean, runner: PrismaRunner = prisma) => {
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
      bookings: bookings.map((booking) => buildScheduleBooking(booking as any, includePrivateDetails)),
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
  const ensureAppReady = () => {
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
    const services = await prisma.service.findMany();
    res.json(services);
  });

  app.get('/api/stylists', async (req, res) => {
    const stylists = await prisma.stylist.findMany();
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
      console.error('Error loading public schedule:', error);
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
          slotId: slot_id,
          durationMinutes,
        });

        if (slot.stylist_id !== stylist_id) {
          throw new Error('Selected time does not belong to the chosen stylist');
        }

        return tx.booking.create({
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
      });

      res.json({ message: 'Booking successful', booking });
    } catch (error: any) {
      console.error('Booking error:', error);
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
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/student/cancel/:id', authenticate, async (req: any, res) => {
    const bookingId = req.params.id;

    try {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.student_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          proposed_slot_id: null,
        },
      });

      res.json({ message: 'Booking cancelled' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/student/bookings/:id/reschedule', authenticate, async (req: any, res) => {
    const { id } = req.params;
    const { new_slot_id } = req.body;

    try {
      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { services: true, slot: true },
      });

      if (!booking || booking.student_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      if (booking.status !== 'NEEDS_RESCHEDULE') {
        return res.status(400).json({ error: 'Booking does not need reschedule' });
      }

      if (new_slot_id === booking.slot_id) {
        return res.status(400).json({ error: 'Cannot reschedule to the exact same time.' });
      }

      await prisma.$transaction(async (tx) => {
        const durationMinutes = getBookingDurationMinutes(booking);
        const newSlot = await validateWindowAvailability({
          runner: tx,
          slotId: new_slot_id,
          durationMinutes,
          excludeBookingId: booking.id,
        });

        await tx.booking.update({
          where: { id },
          data: {
            slot_id: new_slot_id,
            stylist_id: newSlot.stylist_id,
            status: 'RESCHEDULE_PENDING',
            proposed_slot_id: null,
          },
        });
      });

      res.json({ message: 'Rescheduled successfully' });
    } catch (error: any) {
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
    } catch (error) {
      res.status(400).json({ error: (error as Error).message || 'Server error' });
    }
  });

  // Admin Routes
  app.post('/api/admin/login', async (req, res) => {
    let { email, password } = req.body;
    email = email?.trim().toLowerCase();

    try {
      const admin = await prisma.admin.findUnique({ where: { email } });
      if (!admin) return res.status(400).json({ error: 'Invalid credentials' });

      const isMatch = await bcrypt.compare(password, admin.password_hash);
      if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('adminToken', token, authCookieOptions);

      res.json({ message: 'Login successful', token, admin: { id: admin.id, email: admin.email } });
    } catch (error) {
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
      console.error('Error loading admin schedule:', error);
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
      res.json(bookings);
    } catch (error) {
      console.error('Error fetching admin bookings:', error);
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
          status: 'CONFIRMED',
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

      res.json(records);
    } catch (error) {
      console.error('Error fetching daily records:', error);
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

    try {
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

      res.json({ message: 'Action undone successfully' });
    } catch (error) {
      console.error('Error undoing admin action:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/bookings/:id/status', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
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

      if (new_slot_id === booking.slot_id) {
        return res.status(400).json({ error: 'Choose a different time to reschedule this booking' });
      }

      await prisma.$transaction(async (tx) => {
        const durationMinutes = getBookingDurationMinutes(booking);
        await validateWindowAvailability({
          runner: tx,
          slotId: new_slot_id,
          durationMinutes,
          excludeBookingId: booking.id,
        });

        await tx.booking.update({
          where: { id },
          data: {
            proposed_slot_id: new_slot_id,
            status: 'RESCHEDULE_PROPOSED',
          },
        });
      });

      res.json({ message: 'New time proposed successfully' });
    } catch (error: any) {
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
      await ensureAppReady();
      await seedTimelineSlots();
      res.json({ message: 'Database seeded' });
    } catch (error) {
      console.error('Manual seed failed:', error);
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
      console.log(`Server running on http://localhost:${PORT}`);

      try {
        await ensureAppReady();
        await seedTimelineSlots();
      } catch (err) {
        console.error('Auto-seeding failed:', err);
      }
    });
}

if (!isProduction && !process.env.VERCEL) {
  startViteAndListen();
}

export default app;
