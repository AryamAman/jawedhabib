import express from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { OAuth2Client } from 'google-auth-library';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-for-bits-pilani';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

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
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
      
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
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
      
      res.json({ message: 'Login successful', token, user: { id: student.id, name: student.name, email: student.email } });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ message: 'Logged out' });
  });

  app.get('/api/auth/google/url', (req, res) => {
    const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || `http://localhost:${PORT}`;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['email', 'profile'],
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || `http://localhost:${PORT}`;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
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

      const token = jwt.sign({ id: student.id, role: 'student' }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
      
      res.send(`
        <html><body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${token}' }, '*');
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
    const slots = await prisma.appointmentSlot.findMany({
      where: {
        date: date as string,
        stylist_id: stylist_id as string,
      },
      orderBy: { time: 'asc' }
    });
    res.json(slots);
  });

  // Booking Routes
  app.post('/api/book', authenticate, async (req: any, res) => {
    const { service_ids, stylist_id, slot_id } = req.body;
    const student_id = req.user.id;

    if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
      return res.status(400).json({ error: 'At least one service must be selected' });
    }

    try {
      // Create booking and update slot in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Check if slot is available INSIDE transaction
        const slot = await tx.appointmentSlot.findUnique({ 
          where: { id: slot_id },
        });

        if (!slot) {
          throw new Error('Slot not found');
        }

        if (slot.status !== 'AVAILABLE') {
          throw new Error('Slot is no longer available');
        }

        // Double check if a booking already exists for this slot
        const existingBooking = await tx.booking.findUnique({
          where: { slot_id }
        });
        if (existingBooking) {
          throw new Error('Slot is already booked');
        }

        const newBooking = await tx.booking.create({
          data: { 
            student_id, 
            stylist_id, 
            slot_id,
            status: 'PENDING',
            services: {
              connect: service_ids.map((id: string) => ({ id }))
            }
          },
          include: {
            slot: true,
            services: true,
            stylist: true
          }
        });

        await tx.appointmentSlot.update({
          where: { id: slot_id },
          data: { status: 'PENDING' }
        });

        return newBooking;
      });

      res.json({ message: 'Booking successful', booking: result });
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
          proposed_slot: true
        },
        orderBy: { created_at: 'desc' }
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

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'CANCELLED' }
        });
        await tx.appointmentSlot.update({
          where: { id: booking.slot_id },
          data: { status: 'AVAILABLE' }
        });
        if (booking.proposed_slot_id) {
          await tx.appointmentSlot.update({
            where: { id: booking.proposed_slot_id },
            data: { status: 'AVAILABLE' }
          });
        }
      });

      res.json({ message: 'Booking cancelled' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/student/bookings/:id/reschedule-response', authenticate, async (req: any, res) => {
    const { id } = req.params;
    const { accept } = req.body;
    try {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking || booking.student_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      if (booking.status !== 'RESCHEDULE_PROPOSED' || !booking.proposed_slot_id) {
        return res.status(400).json({ error: 'No reschedule proposed' });
      }

      await prisma.$transaction(async (tx) => {
        if (accept) {
          // Free old slot
          await tx.appointmentSlot.update({
            where: { id: booking.slot_id },
            data: { status: 'AVAILABLE' }
          });
          // Confirm new slot
          await tx.appointmentSlot.update({
            where: { id: booking.proposed_slot_id! },
            data: { status: 'BOOKED' }
          });
          // Update booking
          await tx.booking.update({
            where: { id },
            data: {
              slot_id: booking.proposed_slot_id!,
              proposed_slot_id: null,
              status: 'CONFIRMED'
            }
          });
        } else {
          // Free proposed slot
          await tx.appointmentSlot.update({
            where: { id: booking.proposed_slot_id! },
            data: { status: 'AVAILABLE' }
          });
          // Revert booking status to CONFIRMED (assuming it was confirmed before)
          await tx.booking.update({
            where: { id },
            data: {
              proposed_slot_id: null,
              status: 'CONFIRMED'
            }
          });
        }
      });

      res.json({ message: accept ? 'Reschedule accepted' : 'Reschedule rejected' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
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
      res.cookie('adminToken', token, { httpOnly: true, secure: true, sameSite: 'none' });
      
      res.json({ message: 'Login successful', token, admin: { id: admin.id, email: admin.email } });
    } catch (error) {
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
          proposed_slot: true
        },
        orderBy: { created_at: 'desc' }
      });
      res.json(bookings);
    } catch (error) {
      console.error('Error fetching admin bookings:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/bookings/:id/status', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'CONFIRMED' or 'REJECTED'
    try {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id },
          data: { status }
        });
        
        if (status === 'CONFIRMED') {
          await tx.appointmentSlot.update({
            where: { id: booking.slot_id },
            data: { status: 'BOOKED' }
          });
        } else if (status === 'REJECTED' || status === 'CANCELLED') {
          await tx.appointmentSlot.update({
            where: { id: booking.slot_id },
            data: { status: 'AVAILABLE' }
          });
          if (booking.proposed_slot_id) {
            await tx.appointmentSlot.update({
              where: { id: booking.proposed_slot_id },
              data: { status: 'AVAILABLE' }
            });
          }
        }
      });

      res.json({ message: `Booking ${status.toLowerCase()}` });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/bookings/:id/reschedule', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { new_slot_id } = req.body;
    try {
      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      await prisma.$transaction(async (tx) => {
        const newSlot = await tx.appointmentSlot.findUnique({ where: { id: new_slot_id } });
        if (!newSlot || newSlot.status !== 'AVAILABLE') {
          throw new Error('New slot is not available');
        }

        // Mark new slot as PENDING
        await tx.appointmentSlot.update({
          where: { id: new_slot_id },
          data: { status: 'PENDING' }
        });

        // Update booking to RESCHEDULE_PROPOSED
        await tx.booking.update({
          where: { id },
          data: {
            status: 'RESCHEDULE_PROPOSED',
            proposed_slot_id: new_slot_id
          }
        });
      });

      res.json({ message: 'Reschedule proposed' });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Server error' });
    }
  });

  app.post('/api/admin/slots/generate', authenticateAdmin, async (req, res) => {
    const { date, stylist_id } = req.body;
    try {
      const existingSlots = await prisma.appointmentSlot.count({
        where: { date, stylist_id }
      });
      if (existingSlots > 0) {
        return res.status(400).json({ error: 'Slots already exist for this date' });
      }

      const slots = [];
      ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'].forEach(time => {
        slots.push({
          date,
          time,
          stylist_id,
          status: 'AVAILABLE'
        });
      });
      await prisma.appointmentSlot.createMany({ data: slots });
      res.json({ message: 'Slots generated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/slots/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'AVAILABLE' or 'UNAVAILABLE'
    try {
      const slot = await prisma.appointmentSlot.update({
        where: { id },
        data: { status }
      });
      res.json(slot);
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/admin/seed', async (req, res) => {
    // Seed some data
    if ((await prisma.admin.count()) === 0) {
      const password_hash = await bcrypt.hash('admin123', 10);
      await prisma.admin.create({
        data: {
          email: 'admin@example.com',
          password_hash
        }
      });
    }

    const existingServices = await prisma.service.findMany();
    const servicesToSeed = [
      { name: 'Haircut', duration_minutes: 30, price: 500 },
      { name: 'Hair Styling', duration_minutes: 45, price: 800 },
      { name: 'Hair Coloring', duration_minutes: 120, price: 2500 },
      { name: 'Beard Grooming', duration_minutes: 30, price: 300 },
      { name: 'Hair Treatment', duration_minutes: 60, price: 1500 },
      { name: 'Head Massage', duration_minutes: 20, price: 400 },
      { name: 'Facial', duration_minutes: 45, price: 1200 },
      { name: 'Shave', duration_minutes: 20, price: 250 },
    ];

    for (const service of servicesToSeed) {
      const exists = existingServices.find(s => s.name === service.name);
      if (!exists) {
        await prisma.service.create({ data: service });
      }
    }

    if ((await prisma.stylist.count()) === 0) {
      await prisma.stylist.createMany({
        data: [
          { name: 'Rahul Sharma', role: 'Senior Stylist', bio: 'Expert in modern cuts and coloring.' },
          { name: 'Priya Patel', role: 'Hair Specialist', bio: 'Specializes in hair treatments and styling.' },
          { name: 'Amit Kumar', role: 'Barber', bio: 'Master of beard grooming and classic cuts.' }
        ]
      });
    }

    // Generate some slots for the next 7 days for the first stylist
    const stylist = await prisma.stylist.findFirst();
    if (stylist && (await prisma.appointmentSlot.count()) === 0) {
      const today = new Date();
      const slots = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00'].forEach(time => {
          slots.push({
            date: dateStr,
            time,
            stylist_id: stylist.id,
            status: 'AVAILABLE'
          });
        });
      }
      await prisma.appointmentSlot.createMany({ data: slots });
    }

    res.json({ message: 'Database seeded' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Auto-seed if empty
    try {
      // Seed Admin
      const adminCount = await prisma.admin.count();
      if (adminCount === 0) {
        const password_hash = await bcrypt.hash('admin123', 10);
        await prisma.admin.create({
          data: {
            email: 'admin@example.com',
            password_hash
          }
        });
        console.log('Admin seeded: admin@example.com / admin123');
      }

      // Seed Services
      const serviceCount = await prisma.service.count();
      if (serviceCount === 0) {
        console.log('Seeding initial services...');
        const servicesToSeed = [
          { name: 'Haircut', duration_minutes: 30, price: 500 },
          { name: 'Hair Styling', duration_minutes: 45, price: 800 },
          { name: 'Hair Coloring', duration_minutes: 120, price: 2500 },
          { name: 'Beard Grooming', duration_minutes: 30, price: 300 },
          { name: 'Hair Treatment', duration_minutes: 60, price: 1500 },
          { name: 'Head Massage', duration_minutes: 20, price: 400 },
          { name: 'Facial', duration_minutes: 45, price: 1200 },
          { name: 'Shave', duration_minutes: 20, price: 250 },
        ];
        await prisma.service.createMany({ data: servicesToSeed });
      }
      
      // Seed Stylists
      const stylistCount = await prisma.stylist.count();
      if (stylistCount === 0) {
        console.log('Seeding initial stylists...');
        await prisma.stylist.createMany({
          data: [
            { name: 'Rahul Sharma', role: 'Senior Stylist', bio: 'Expert in modern cuts and coloring.' },
            { name: 'Priya Patel', role: 'Hair Specialist', bio: 'Specializes in hair treatments and styling.' },
            { name: 'Amit Kumar', role: 'Barber', bio: 'Master of beard grooming and classic cuts.' }
          ]
        });
      }
    } catch (err) {
      console.error('Auto-seeding failed:', err);
    }
  });
}

startServer();
