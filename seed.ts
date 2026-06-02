import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const bootstrapAdminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() || '';
const bootstrapAdminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';

const timelineSteps = Array.from({ length: 120 }, (_, index) => {
  const totalMinutes = (10 * 60) + (index * 5);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

async function seed() {
  if (bootstrapAdminEmail && bootstrapAdminPassword && (await prisma.admin.count()) === 0) {
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
        // Men — Hair Care
        { name: 'Haircut', duration_minutes: 30, price: 200, gender: 'Men', category: 'Hair Care' },
        { name: 'Hair Wash (Men)', duration_minutes: 20, price: 250, gender: 'Men', category: 'Hair Care' },
        { name: 'Hair Styling (Men)', duration_minutes: 20, price: 100, gender: 'Men', category: 'Hair Care' },
        { name: 'Head Massage (Men)', duration_minutes: 30, price: 600, gender: 'Men', category: 'Hair Care' },
        { name: 'Hair Spa (Men)', duration_minutes: 60, price: 650, gender: 'Men', category: 'Hair Care' },
        { name: 'Hair Dandruff Treatment (Men)', duration_minutes: 45, price: 800, gender: 'Men', category: 'Hair Care' },
        { name: 'Hair Loss Treatment (Men)', duration_minutes: 45, price: 950, gender: 'Men', category: 'Hair Care' },
        { name: 'Beard Trim', duration_minutes: 15, price: 80, gender: 'Men', category: 'Hair Care' },
        { name: 'Shave', duration_minutes: 20, price: 80, gender: 'Men', category: 'Hair Care' },
        // Men — Hair Colour
        { name: 'Hair Colouring Ammonia Free', duration_minutes: 60, price: 750, gender: 'Men', category: 'Hair Colour' },
        { name: 'Highlights per Stick – Basic', duration_minutes: 20, price: 60, gender: 'Men', category: 'Hair Colour' },
        { name: 'Highlights per Stick – Fashion', duration_minutes: 25, price: 150, gender: 'Men', category: 'Hair Colour' },
        { name: 'Global Highlights (Temporary)', duration_minutes: 90, price: 999, gender: 'Men', category: 'Hair Colour' },
        // Women — Hair Care
        { name: 'Hair Wash', duration_minutes: 20, price: 150, gender: 'Women', category: 'Hair Care' },
        { name: 'Dry Haircut', duration_minutes: 30, price: 250, gender: 'Women', category: 'Hair Care' },
        { name: 'Haircut with Hair Wash', duration_minutes: 45, price: 400, gender: 'Women', category: 'Hair Care' },
        { name: 'Head Massage', duration_minutes: 30, price: 450, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Styling Blow Dry', duration_minutes: 30, price: 350, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Styling Ironing', duration_minutes: 45, price: 350, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Styling Curls', duration_minutes: 45, price: 500, gender: 'Women', category: 'Hair Care' },
        { name: "Hair Spa L'Oreal", duration_minutes: 90, price: 1300, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Spa Wella', duration_minutes: 90, price: 1400, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Dandruff Treatment', duration_minutes: 45, price: 800, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Loss Treatment', duration_minutes: 45, price: 950, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Smoothening', duration_minutes: 180, price: 3999, gender: 'Women', category: 'Hair Care' },
        { name: 'Hair Rebonding', duration_minutes: 180, price: 2999, gender: 'Women', category: 'Hair Care' },
        { name: 'Keratin Treatment', duration_minutes: 180, price: 4999, gender: 'Women', category: 'Hair Care' },
        { name: 'BraSmooth', duration_minutes: 180, price: 5995, gender: 'Women', category: 'Hair Care' },
        // Women — Hair Colour
        { name: 'Wella Root Touch Up', duration_minutes: 60, price: 1300, gender: 'Women', category: 'Hair Colour' },
        { name: 'Wella Global', duration_minutes: 120, price: 2100, gender: 'Women', category: 'Hair Colour' },
        { name: "L'Oreal Root Touch Up", duration_minutes: 60, price: 1250, gender: 'Women', category: 'Hair Colour' },
        { name: "L'Oreal Global", duration_minutes: 120, price: 2000, gender: 'Women', category: 'Hair Colour' },
        { name: 'Ammonia Free Global', duration_minutes: 120, price: 2600, gender: 'Women', category: 'Hair Colour' },
        { name: 'Highlights per Stick (Women)', duration_minutes: 20, price: 170, gender: 'Women', category: 'Hair Colour' },
        { name: 'Highlights Fashion per Stick', duration_minutes: 25, price: 350, gender: 'Women', category: 'Hair Colour' },
        // Unisex — Hydra Facial
        { name: 'Hydra Facial Instant Glow', duration_minutes: 60, price: 2900, gender: 'Unisex', category: 'Hydra Facial' },
        { name: 'Hydra Facial Urban Men', duration_minutes: 60, price: 2500, gender: 'Unisex', category: 'Hydra Facial' },
        { name: 'Hydra Facial Premium', duration_minutes: 75, price: 3000, gender: 'Unisex', category: 'Hydra Facial' },
        // Unisex — Other
        { name: 'Full Body Polishing', duration_minutes: 90, price: 3500, gender: 'Unisex', category: 'Other' },
        // Beauty — Threading
        { name: 'Eyebrows Threading', duration_minutes: 10, price: 50, gender: 'Beauty', category: 'Threading' },
        { name: 'Upper Lips Threading', duration_minutes: 5, price: 90, gender: 'Beauty', category: 'Threading' },
        { name: 'Chin Threading', duration_minutes: 5, price: 50, gender: 'Beauty', category: 'Threading' },
        { name: 'Lower Lips Threading', duration_minutes: 5, price: 50, gender: 'Beauty', category: 'Threading' },
        { name: 'Forehead Threading', duration_minutes: 5, price: 50, gender: 'Beauty', category: 'Threading' },
        { name: 'Full Face Threading', duration_minutes: 25, price: 300, gender: 'Beauty', category: 'Threading' },
        // Beauty — Face Wax
        { name: 'Full Face Wax', duration_minutes: 30, price: 440, gender: 'Beauty', category: 'Face Wax' },
        // Beauty — Honey Wax
        { name: 'Honey Wax Under Arms', duration_minutes: 15, price: 150, gender: 'Beauty', category: 'Honey Wax' },
        { name: 'Honey Wax Full Arms', duration_minutes: 30, price: 350, gender: 'Beauty', category: 'Honey Wax' },
        { name: 'Honey Wax Stomach', duration_minutes: 20, price: 200, gender: 'Beauty', category: 'Honey Wax' },
        { name: 'Honey Wax Back', duration_minutes: 25, price: 300, gender: 'Beauty', category: 'Honey Wax' },
        // Beauty — Rica Wax
        { name: 'Rica Wax Under Arms', duration_minutes: 15, price: 200, gender: 'Beauty', category: 'Rica Wax' },
        { name: 'Rica Wax Full Arms', duration_minutes: 30, price: 500, gender: 'Beauty', category: 'Rica Wax' },
        { name: 'Rica Wax Half Legs', duration_minutes: 30, price: 650, gender: 'Beauty', category: 'Rica Wax' },
        { name: 'Rica Wax Full Legs', duration_minutes: 45, price: 1000, gender: 'Beauty', category: 'Rica Wax' },
        { name: 'Rica Wax Stomach', duration_minutes: 20, price: 300, gender: 'Beauty', category: 'Rica Wax' },
        { name: 'Rica Wax Full Body', duration_minutes: 90, price: 1200, gender: 'Beauty', category: 'Rica Wax' },
        // Beauty — Makeup
        { name: 'Saree Draping', duration_minutes: 20, price: 350, gender: 'Beauty', category: 'Makeup' },
        { name: 'Party Makeup', duration_minutes: 90, price: 4000, gender: 'Beauty', category: 'Makeup' },
        { name: 'Engagement Makeup', duration_minutes: 120, price: 6000, gender: 'Beauty', category: 'Makeup' },
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
  .catch((error) => {
    console.error('Database seed failed', error instanceof Error ? { message: error.message } : { message: String(error) });
  })
  .finally(() => prisma.$disconnect());
