import postgres from "postgres";

export type Customer = {
  customer_id: number;
  full_name: string;
  email: string;
};

export type OrderRow = {
  order_id: number;
  order_timestamp: string;
  fulfilled: number;
  total_value: number;
};

export type Product = {
  product_id: number;
  product_name: string;
  price: number;
};

const supabaseDbUrl = process.env.SUPABASE_DB_URL;
if (!supabaseDbUrl) {
  throw new Error(
    "SUPABASE_DB_URL environment variable is required. Set it in .env.local or your hosting provider.",
  );
}

const sql = postgres(supabaseDbUrl, { ssl: "require", prepare: false });

export async function getCustomers(search: string) {
  const term = `%${search.trim()}%`;
  return sql<Customer[]>`
    SELECT customer_id, full_name, email
    FROM customers
    WHERE full_name ILIKE ${term} OR email ILIKE ${term}
    ORDER BY full_name
    LIMIT 100
  `;
}

export async function getCustomerById(customerId: number) {
  const rows = await sql<Customer[]>`
    SELECT customer_id, full_name, email
    FROM customers
    WHERE customer_id = ${customerId}
    LIMIT 1
  `;
  return rows[0];
}

export async function getCustomerOrderSummary(customerId: number) {
  const totalsRows = await sql<Array<{ order_count: number; total_spend: number | null }>>`
    SELECT COUNT(*)::int AS order_count, SUM(order_total)::float8 AS total_spend
    FROM orders
    WHERE customer_id = ${customerId}
  `;
  const recentOrders = await sql<OrderRow[]>`
    SELECT
      o.order_id,
      o.order_datetime AS order_timestamp,
      CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
      o.order_total AS total_value
    FROM orders o
    LEFT JOIN shipments s ON s.order_id = o.order_id
    WHERE o.customer_id = ${customerId}
    ORDER BY o.order_datetime DESC
    LIMIT 5
  `;

  const totals = totalsRows[0];
  return {
    orderCount: totals?.order_count ?? 0,
    totalSpend: totals?.total_spend ?? 0,
    recentOrders,
  };
}

export async function getProducts() {
  return sql<Product[]>`
    SELECT product_id, product_name, price
    FROM products
    ORDER BY product_name ASC
  `;
}

export async function createOrder(
  customerId: number,
  items: Array<{ productId: number; quantity: number }>,
) {
  return sql.begin(async (tx) => {
    let subtotal = 0;
    const itemDetails: Array<{ productId: number; quantity: number; price: number }> = [];

    for (const item of items) {
      const product = await tx<Array<{ price: number; category: string }>>`
        SELECT price, category
        FROM products
        WHERE product_id = ${item.productId}
        LIMIT 1
      `;
      if (!product[0]) {
        throw new Error(`Product ${item.productId} not found`);
      }
      const price = Number(product[0].price);
      subtotal += price * item.quantity;
      itemDetails.push({ productId: item.productId, quantity: item.quantity, price });
    }

    const orderRows = await tx<Array<{ order_id: number }>>`
      INSERT INTO orders (
        customer_id, order_datetime, billing_zip, shipping_zip, shipping_state,
        payment_method, device_type, ip_country, promo_used, promo_code,
        order_subtotal, shipping_fee, tax_amount, order_total, risk_score, is_fraud
      )
      VALUES (
        ${customerId}, NOW(), '', '', '', 'card', 'web', 'US', 0, NULL,
        ${subtotal}, 0, 0, ${subtotal}, 0, 0
      )
      RETURNING order_id
    `;
    const orderId = Number(orderRows[0].order_id);

    for (const item of itemDetails) {
      const lineTotal = item.price * item.quantity;
      await tx`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
        VALUES (${orderId}, ${item.productId}, ${item.quantity}, ${item.price}, ${lineTotal})
      `;
    }

    const customerLocation = await tx<Array<{ zip_code: string | null; state: string | null }>>`
      SELECT zip_code, state
      FROM customers
      WHERE customer_id = ${customerId}
      LIMIT 1
    `;
    const zip = customerLocation[0]?.zip_code ?? "";
    const state = customerLocation[0]?.state ?? "";
    await tx`
      UPDATE orders
      SET billing_zip = ${zip}, shipping_zip = ${zip}, shipping_state = ${state}
      WHERE order_id = ${orderId}
    `;
    return orderId;
  });
}

export async function getOrdersForCustomer(customerId: number) {
  return sql<OrderRow[]>`
    SELECT
      o.order_id,
      o.order_datetime AS order_timestamp,
      CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
      o.order_total AS total_value
    FROM orders o
    LEFT JOIN shipments s ON s.order_id = o.order_id
    WHERE o.customer_id = ${customerId}
    ORDER BY o.order_datetime DESC
  `;
}

export async function getOrderForCustomer(orderId: number, customerId: number) {
  const rows = await sql<OrderRow[]>`
    SELECT
      o.order_id,
      o.order_datetime AS order_timestamp,
      CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
      o.order_total AS total_value
    FROM orders o
    LEFT JOIN shipments s ON s.order_id = o.order_id
    WHERE o.order_id = ${orderId} AND o.customer_id = ${customerId}
    LIMIT 1
  `;
  return rows[0];
}

export async function getOrderItems(orderId: number) {
  return sql<Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>>`
    SELECT
      p.product_name,
      oi.quantity,
      oi.unit_price,
      oi.line_total
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    WHERE oi.order_id = ${orderId}
    ORDER BY p.product_name ASC
  `;
}

export async function getWarehousePriorityQueue() {
  return sql<Array<{
    order_id: number;
    order_timestamp: string;
    total_value: number;
    fulfilled: number;
    customer_id: number;
    customer_name: string;
    late_delivery_probability: number;
    predicted_late_delivery: number;
    prediction_timestamp: string;
  }>>`
    SELECT
      o.order_id,
      o.order_datetime AS order_timestamp,
      o.order_total AS total_value,
      CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
      c.customer_id,
      c.full_name AS customer_name,
      COALESCE(s.late_delivery::float8, o.risk_score) AS late_delivery_probability,
      COALESCE(s.late_delivery, CASE WHEN o.risk_score >= 0.5 THEN 1 ELSE 0 END) AS predicted_late_delivery,
      COALESCE(s.ship_datetime, o.order_datetime) AS prediction_timestamp
    FROM orders o
    JOIN customers c ON c.customer_id = o.customer_id
    LEFT JOIN shipments s ON s.order_id = o.order_id
    WHERE s.shipment_id IS NULL
    ORDER BY late_delivery_probability DESC, o.order_datetime ASC
    LIMIT 50
  `;
}

export { sql };
