# Jawed Habib BITS Pilani — Salon Booking Portal

A full-stack salon booking portal built for BITS Pilani students. Students can browse services, pick a stylist, and book appointment slots through a clean, responsive UI. Admins manage availability, confirm bookings, and propose reschedules via a compact horizontal timeline dashboard.

---

## Features

- **Student booking flow** — browse services by gender/category, select a stylist, and pick an available time slot
- **Admin timeline dashboard** — per-day horizontal timeline view across all stylists; mark slots available/unavailable, confirm, reject, or reschedule bookings
- **Google OAuth** — student and admin login via Google, restricted to configured email domains
- **Reschedule proposals** — admins can propose an alternate slot; students see and accept/decline from their dashboard
- **Dark/light theme** — system-aware theme toggle with editorial luxury aesthetic
- **Vercel-ready** — single-command deployment with automatic Prisma migrations on build

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, Framer Motion, React Router v7 |
| Backend | Node.js, Express.js (served alongside Vite in dev) |
| Database | PostgreSQL via Prisma ORM |
| Auth | httpOnly JWT cookies, Google OAuth (`google-auth-library`) |
| Deployment | Vercel (serverless API routes + static frontend) |

---

## Project Structure

```
.
├── api/              # Vercel serverless entry point
├── backend/          # Express server (dev) and all API route handlers
├── prisma/
│   └── schema.prisma # Database models: Student, Admin, Stylist, Service, AppointmentSlot, Booking
├── src/
│   ├── components/   # Shared UI components (Navbar, Footer, ThemeProvider, …)
│   └── pages/        # Route-level pages (Home, Book, Dashboard, AdminDashboard, …)
├── seed.ts           # Seeds stylists and services into the database
├── vite.config.ts
└── vercel.json       # Routes all non-asset requests to the serverless API
```

---

## Local Setup

### Prerequisites

- Node.js ≥ 18
- A running PostgreSQL instance (local or remote)
- A Google Cloud project with an OAuth 2.0 client ID and secret

### Steps

1. **Clone and install**
   ```bash
   git clone https://github.com/aryamaman/jawedhabib.git
   cd jawedhabib
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in every value (see [Environment Variables](#environment-variables) below).
   For a local PostgreSQL database you can set both `DATABASE_URL` and `DIRECT_URL` to the same connection string.

3. **Apply database migrations**
   ```bash
   npx prisma migrate deploy
   ```

4. **Seed base data** (stylists and services)
   ```bash
   npx tsx seed.ts
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```
   The app runs on `http://localhost:3000` (port is set inside `backend/server.ts`).

---

## Deploying to Vercel

1. Push this repository to GitHub and import it into Vercel.
2. Set the environment variables listed in the next section inside the Vercel project settings.
3. Deploy — Vercel runs `npm run vercel-build`, which generates the Prisma client, applies migrations, and builds the frontend.

### Supabase notes

- Set `DATABASE_URL` to the **pooled** connection string (port 6543) and append `?pgbouncer=true&connection_limit=1`.
- Set `DIRECT_URL` to the **direct** connection string (port 5432) — Prisma uses this for migrations.

---

## Environment Variables

Copy `.env.example` to `.env` and replace every placeholder before running locally or deploying.

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | Yes | Public URL of the deployed app (e.g. `https://your-app.vercel.app`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string — use pooled URL for Vercel/Supabase |
| `DIRECT_URL` | Yes | Direct (non-pooled) PostgreSQL connection string — used by Prisma migrations |
| `JWT_SECRET` | Yes | Long random string used to sign session JWTs |
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret from Google Cloud Console |
| `ADMIN_EMAILS` | Yes | Comma-separated list of email addresses that are granted admin access |
| `STUDENT_EMAIL_DOMAINS` | Yes | Comma-separated list of email domains allowed to sign up as students |
| `ADMIN_BOOTSTRAP_EMAIL` | Optional | Email for a one-time admin account created on first deploy |
| `ADMIN_BOOTSTRAP_PASSWORD` | Optional | Password for the bootstrap admin account |
| `SEED_SECRET` | Optional | Secret token that gates the manual `/api/seed` endpoint |
| `ENABLE_ADMIN_PASSWORD_LOGIN` | Optional | Set to `true` to allow admins to log in with a password (default: `false`) |

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository and create a feature branch off `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Make your changes.** Keep commits focused and descriptive.
3. **Run the type checker** before opening a PR:
   ```bash
   npm run lint
   ```
4. **Open a pull request** against `main` with a clear description of what changed and why.

### Guidelines

- Follow the existing code style (TypeScript, no `any`, Tailwind for styling).
- Backend route handlers live in `backend/` — keep business logic out of the Express middleware layer.
- Prisma schema changes must include a migration file (`npx prisma migrate dev --name your_migration`).
- Do not commit `.env` or any file containing real credentials.

---

## License

This project is open source. See [LICENSE](LICENSE) for details.
