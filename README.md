# Jawed Habib BITS Pilani - Salon Booking Portal

A luxury salon booking portal built exclusively for BITS Pilani students.

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, React Router
- **Backend**: Node.js, Express.js
- **Database**: SQLite (via Prisma ORM) - easily swappable to PostgreSQL
- **Authentication**: JWT & bcrypt

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up the database:
   The project is currently configured to use SQLite for easy local development.
   ```bash
   npx prisma db push
   ```

3. Seed the database with sample data (Services, Stylists, and Slots):
   ```bash
   npx tsx seed.ts
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Switching to PostgreSQL (Production)

To switch from SQLite to PostgreSQL for production deployment (e.g., on Supabase or Railway):

1. Open `prisma/schema.prisma`
2. Change the provider to `postgresql`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Add your PostgreSQL connection string to `.env`:
   ```env
   DATABASE_URL="postgresql://user:password@host:port/database"
   ```
4. Run Prisma migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

### Environment Variables

Create a `.env` file in the root directory:

```env
# JWT Secret for authentication
JWT_SECRET="your-super-secret-jwt-key"

# Database URL (if using PostgreSQL)
# DATABASE_URL="postgresql://..."
```

## Features
- **Student Authentication**: Only `@pilani.bits-pilani.ac.in` emails are allowed to sign up.
- **Booking System**: Select service, stylist, date, and time. Booked slots are disabled.
- **Student Dashboard**: View upcoming and past appointments. Cancel appointments.
- **Admin Dashboard**: View all bookings across the salon.
- **Luxury Design**: Minimalist aesthetic inspired by high-end salons.
