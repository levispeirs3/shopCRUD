# Shop CRUD (Next.js + SQLite)

Student project web CRUD app built with Next.js App Router and SQLite (`better-sqlite3`).

## Requirements

- Node.js 20+
- A SQLite database file named `shop.db`

## Database location

The app checks database paths in this order:

1. `SHOP_DB_PATH` environment variable (if set)
2. `./shop.db`
3. `./data/shop.db`
4. `./Data/shop.db`

If your DB is in a different location, set `SHOP_DB_PATH`.

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
- `/run-scoring` - placeholder scoring page
- `/debug/schema` - developer schema inspector
