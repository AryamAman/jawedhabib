import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const bootstrapAdminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || 'admin@example.com';
const bootstrapAdminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'admin123';

const timelineSteps = Array.from({ length: 120 }, (_, index) => {
  const totalMinutes = (10 * 60) + (index * 5);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

async function seed() {
  if ((await prisma.admin.count()) === 0) {
    const password_hash = await bcrypt.hash(bootstrapAdminPassword, 10);
    await prisma.admin.create({
      data: {
        email: bootstrapAdminEmail,
        password_hash,
      },
    });
  }

  if ((await prisma.service.count()) === 0) {
    await prisma.service.createMany({
      data: [
        { name: 'Haircut', duration_minutes: 30, price: 500 },
        { name: 'Hair Styling', duration_minutes: 45, price: 800 },
        { name: 'Hair Coloring', duration_minutes: 120, price: 2500 },
        { name: 'Beard Grooming', duration_minutes: 30, price: 300 },
        { name: 'Hair Treatment', duration_minutes: 60, price: 1500 },
        { name: 'Head Massage', duration_minutes: 20, price: 400 },
        { name: 'Facial', duration_minutes: 45, price: 1200 },
        { name: 'Shave', duration_minutes: 20, price: 250 },
      ],
    });
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

  const stylist = await prisma.stylist.findFirst();
  if (stylist && (await prisma.appointmentSlot.count()) === 0) {
    const slots = [];
    const today = new Date();

    for (let i = 0; i < 7; i += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      timelineSteps.forEach((time) => {
        slots.push({
          date: dateStr,
          time,
          stylist_id: stylist.id,
          status: 'AVAILABLE',
        });
      });
    }

    await prisma.appointmentSlot.createMany({ data: slots });
  }

  console.log('Database seeded');
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
