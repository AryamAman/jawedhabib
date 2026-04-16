# Jawed Habib BITS Pilani - Salon Booking Portal

A salon booking portal built for BITS Pilani students, now running as a single Next.js application with shared student/admin scheduling and a compact horizontal timeline workflow.

## Tech Stack

- Frontend + Backend: Next.js 16 App Router, React 19, Tailwind CSS 4, Framer Motion
- Database: SQLite via Prisma ORM
- Authentication: JWT, bcrypt, Google OAuth

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your values.
3. Apply migrations:
   ```bash
   npm run db:migrate:deploy
   ```
4. Seed base data:
   ```bash
   npm run db:seed
   ```
5. Start the app:
   ```bash
   npm run dev
   ```

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Set these environment variables in Vercel:
   - `APP_URL`
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `ADMIN_EMAILS`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
4. Optional first-deploy bootstrap variables:
   - `ADMIN_BOOTSTRAP_EMAIL`
   - `ADMIN_BOOTSTRAP_PASSWORD`
5. Optional protected manual seeding secret:
   - `SEED_SECRET`
6. Deploy. Vercel uses `npm run vercel-build`, which applies Prisma migrations and builds the Next.js app.

For the target production URL, set:

```env
APP_URL="https://jawedhabib.vercel.app"
```

Google OAuth should use these values:

- Authorized JavaScript origins: `http://localhost:3000`, `https://jawedhabib.vercel.app`
- Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`, `https://jawedhabib.vercel.app/api/auth/callback/google`

## Environment Variables

```env
APP_URL="http://localhost:3000"
DATABASE_URL="file:./dev.db"
JWT_SECRET="replace-with-a-long-random-secret"
ADMIN_BOOTSTRAP_EMAIL="admin@pilani.bits-pilani.ac.in"
ADMIN_BOOTSTRAP_PASSWORD="replace-with-a-strong-password"
ADMIN_EMAILS="admin@pilani.bits-pilani.ac.in"
SEED_SECRET="replace-with-another-random-secret"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GEMINI_API_KEY=""
```

## Notes

- Prisma is configured against SQLite and stores the local database in `prisma/dev.db`.
- Seed data now includes WebP stylist photos and creates initial appointment slots for every seeded stylist.
- Vercel can build this repo, but a file-based SQLite database is not durable on Vercel's filesystem. For production writes, use a persistent SQLite-compatible backend or move the database to a persistent host.
- Student and admin views use the same booking color language for availability, bookings, unavailable time, and reschedules.
