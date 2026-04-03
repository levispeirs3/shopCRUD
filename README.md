# Shop CRUD (Next.js + Supabase)

Student project web CRUD app built with Next.js App Router and Supabase (Postgres).

## Requirements

- Node.js 20+
- A Supabase project with migrated tables/data

## Install and run

```bash
npm install
npm run dev
```

Add Supabase variables to `.env.local` (and to Vercel project env vars):

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is recommended for server-side mutations on Vercel.

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
- `/run-scoring` - run Supabase-native fraud scoring and mark actual fraud outcomes
- `/supabase-test` - basic Supabase query test against `customers`
- `/debug/schema` - Supabase table connectivity diagnostics
