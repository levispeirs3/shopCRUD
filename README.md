# Shop CRUD (Next.js + Supabase Postgres)

Student project web CRUD app built with Next.js App Router, backed by Supabase Postgres.

## Requirements

- Node.js 20+
- A Supabase Postgres connection string in `SUPABASE_DB_URL`

## Supabase configuration

Set the connection string in `.env.local` (locally) or your hosting environment variable (Vercel):

```bash
SUPABASE_DB_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

## Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Available scripts

- `npm run dev` - run development server
- `npm run build` - create production build
- `npm run start` - start production server
- `npm run lint` - run ESLint

## Main pages

- `/select-customer` - pick customer and save `customer_id` cookie
- `/dashboard` - selected customer summary
- `/place-order` - create a new order with line items
- `/orders` - order history for selected customer
- `/orders/[order_id]` - order detail and line items
- `/warehouse/priority` - late delivery queue
- `/run-scoring` - ML fraud scoring page
- `/debug/schema` - developer schema inspector
