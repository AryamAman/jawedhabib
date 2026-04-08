import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  if ((await prisma.admin.count()) === 0) {
    const password_hash = await bcrypt.hash('admin123', 10);
    await prisma.admin.create({
      data: {
        email: 'admin@example.com',
        password_hash
      }
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
      ]
    });
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
          is_available: true
        });
      });
    }
    await prisma.appointmentSlot.createMany({ data: slots });
  }

  console.log('Database seeded');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
