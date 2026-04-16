# Jawed Habib BITS Pilani - Salon Booking Portal

A salon booking portal built for BITS Pilani students, with a shared student/admin scheduling experience and a compact horizontal timeline workflow.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Framer Motion, React Router
- Backend: Node.js, Express.js
- Database: PostgreSQL via Prisma ORM
- Authentication: JWT, bcrypt, Google OAuth

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your values.
   For local PostgreSQL, you can point both `DATABASE_URL` and `DIRECT_URL` to the same direct connection string.
3. Apply migrations:
   ```bash
   npx prisma migrate deploy
   ```
4. Seed base data:
   ```bash
   npx tsx seed.ts
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
   - `DIRECT_URL`
   - `JWT_SECRET`
   - `ADMIN_EMAILS`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
4. Optional first-deploy bootstrap variables:
   - `ADMIN_BOOTSTRAP_EMAIL`
   - `ADMIN_BOOTSTRAP_PASSWORD`
5. Optional protected manual seeding secret:
   - `SEED_SECRET`
6. Deploy. Vercel uses `npm run vercel-build`, which applies Prisma migrations and builds the frontend.

For Supabase-backed deployments:
- Use the pooled connection string for `DATABASE_URL`.
- Use the direct Postgres connection string for `DIRECT_URL`.
- If you are using the Supabase pooler on port `6543`, keep the Prisma-safe query params on `DATABASE_URL`, such as `pgbouncer=true&connection_limit=1`.

For the target production URL, set:

```env
APP_URL="https://jawedhabib.vercel.app"
```

## Environment Variables

```env
APP_URL="https://jawedhabib.vercel.app"
DATABASE_URL="postgresql://username:password@pooler-host:6543/jawedhabib?schema=public&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://username:password@direct-host:5432/jawedhabib?schema=public"
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

- The app now expects a hosted PostgreSQL database for production.
- Prisma uses `DATABASE_URL` for runtime queries and `DIRECT_URL` for direct migration access.
- Local SQLite files are intentionally ignored and should not be committed.
- Student and admin views use the same booking color language for availability, bookings, unavailable time, and reschedules.
