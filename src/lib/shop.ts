import { getDb, runStatement, selectAll, selectOne } from "@/lib/db";
import { FRAUD_MODEL_THRESHOLD } from "@/lib/fraud-config";

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

export type FraudPredictionRow = {
  order_id: number;
  customer_id: number;
  customer_name: string;
  order_timestamp: string;
  total_value: number;
  fraud_probability: number;
  predicted_fraud: number;
  decision_band: "low" | "review" | "block";
  scored_at: string;
  actual_fraud: number;
};

export function getCustomers(search: string) {
  const term = `%${search.trim()}%`;
  return selectAll<Customer>(
    `SELECT customer_id, full_name, email
     FROM customers
     WHERE full_name LIKE ? OR email LIKE ?
     ORDER BY full_name
     LIMIT 100`,
    [term, term],
  );
}

export function getCustomerById(customerId: number) {
  return selectOne<Customer>(
    `SELECT customer_id, full_name, email
     FROM customers
     WHERE customer_id = ?`,
    [customerId],
  );
}

export function getCustomerOrderSummary(customerId: number) {
  const totals = selectOne<{ order_count: number; total_spend: number | null }>(
    `SELECT COUNT(*) AS order_count, SUM(order_total) AS total_spend
     FROM orders
     WHERE customer_id = ?`,
    [customerId],
  );

  const recentOrders = selectAll<OrderRow>(
    `SELECT
       o.order_id,
       o.order_datetime AS order_timestamp,
       CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
       o.order_total AS total_value
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE customer_id = ?
     ORDER BY o.order_datetime DESC
     LIMIT 5`,
    [customerId],
  );

  return {
    orderCount: totals?.order_count ?? 0,
    totalSpend: totals?.total_spend ?? 0,
    recentOrders,
  };
}

export function getProducts() {
  return selectAll<Product>(
    `SELECT product_id, product_name, price
     FROM products
     ORDER BY product_name ASC`,
  );
}

export function createOrder(
  customerId: number,
  items: Array<{ productId: number; quantity: number }>,
) {
  const db = getDb();
  const getPriceStmt = db.prepare<
    { product_id: number },
    { price: number; category: string }
  >(
    `SELECT price, category FROM products WHERE product_id = @product_id`,
  );
  const insertOrderStmt = db.prepare(
    `INSERT INTO orders (
      customer_id, order_datetime, billing_zip, shipping_zip, shipping_state,
      payment_method, device_type, ip_country, promo_used, promo_code,
      order_subtotal, shipping_fee, tax_amount, order_total, risk_score, is_fraud
    )
    VALUES (?, datetime('now'), '', '', '', 'card', 'web', 'US', 0, NULL, ?, 0, 0, ?, 0, 0)`,
  );
  const insertItemStmt = db.prepare(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const firstCustomerLocationStmt = db.prepare<
    { customer_id: number },
    { zip_code: string | null; state: string | null } | undefined
  >(`SELECT zip_code, state FROM customers WHERE customer_id = @customer_id`);
  const updateOrderLocationStmt = db.prepare(
    `UPDATE orders SET billing_zip = ?, shipping_zip = ?, shipping_state = ? WHERE order_id = ?`,
  );

  const transaction = db.transaction(() => {
    let subtotal = 0;
    const itemDetails: Array<{ productId: number; quantity: number; price: number }> = [];

    for (const item of items) {
      const product = getPriceStmt.get({ product_id: item.productId });
      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }
      const price = Number(product.price);
      subtotal += price * item.quantity;
      itemDetails.push({ productId: item.productId, quantity: item.quantity, price });
    }

    const orderResult = insertOrderStmt.run(customerId, subtotal, subtotal);
    const orderId = Number(orderResult.lastInsertRowid);

    for (const item of itemDetails) {
      const lineTotal = item.price * item.quantity;
      insertItemStmt.run(orderId, item.productId, item.quantity, item.price, lineTotal);
    }

    const customerLocation = firstCustomerLocationStmt.get({ customer_id: customerId });
    const zip = customerLocation?.zip_code ?? "";
    const state = customerLocation?.state ?? "";
    updateOrderLocationStmt.run(zip, zip, state, orderId);
    return orderId;
  });

  return transaction();
}

export function getOrdersForCustomer(customerId: number) {
  return selectAll<OrderRow>(
    `SELECT
       o.order_id,
       o.order_datetime AS order_timestamp,
       CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
       o.order_total AS total_value
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE o.customer_id = ?
     ORDER BY o.order_datetime DESC`,
    [customerId],
  );
}

export function getOrderForCustomer(orderId: number, customerId: number) {
  return selectOne<OrderRow>(
    `SELECT
       o.order_id,
       o.order_datetime AS order_timestamp,
       CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
       o.order_total AS total_value
     FROM orders o
     LEFT JOIN shipments s ON s.order_id = o.order_id
     WHERE o.order_id = ? AND o.customer_id = ?`,
    [orderId, customerId],
  );
}

export function getOrderItems(orderId: number) {
  return selectAll<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>(
    `SELECT
       p.product_name,
       oi.quantity,
       oi.unit_price,
       oi.line_total
     FROM order_items oi
     JOIN products p ON p.product_id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY p.product_name ASC`,
    [orderId],
  );
}

export function getWarehousePriorityQueue() {
  return selectAll<{
    order_id: number;
    order_timestamp: string;
    total_value: number;
    fulfilled: number;
    customer_id: number;
    customer_name: string;
    late_delivery_probability: number;
    predicted_late_delivery: number;
    prediction_timestamp: string;
  }>(`SELECT
        o.order_id,
        o.order_datetime AS order_timestamp,
        o.order_total AS total_value,
        CASE WHEN s.shipment_id IS NULL THEN 0 ELSE 1 END AS fulfilled,
        c.customer_id,
        c.full_name AS customer_name,
        COALESCE(CAST(s.late_delivery AS REAL), o.risk_score) AS late_delivery_probability,
        COALESCE(s.late_delivery, CASE WHEN o.risk_score >= 0.5 THEN 1 ELSE 0 END) AS predicted_late_delivery,
        COALESCE(s.ship_datetime, o.order_datetime) AS prediction_timestamp
      FROM orders o
      JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN shipments s ON s.order_id = o.order_id
      WHERE s.shipment_id IS NULL
      ORDER BY late_delivery_probability DESC, o.order_datetime ASC
      LIMIT 50`);
}

function ensureFraudPredictionTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS fraud_predictions (
      order_id INTEGER PRIMARY KEY,
      fraud_probability REAL NOT NULL,
      predicted_fraud INTEGER NOT NULL,
      decision_band TEXT NOT NULL,
      model_threshold REAL NOT NULL,
      model_name TEXT NOT NULL,
      scored_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(order_id) ON DELETE CASCADE
    )
  `);
}

export function getFraudPredictions(limit = 250) {
  ensureFraudPredictionTable();
  return selectAll<FraudPredictionRow>(
    `SELECT
      o.order_id,
      o.customer_id,
      c.full_name AS customer_name,
      o.order_datetime AS order_timestamp,
      o.order_total AS total_value,
      fp.fraud_probability,
      fp.predicted_fraud,
      fp.decision_band,
      fp.scored_at,
      o.is_fraud AS actual_fraud
    FROM fraud_predictions fp
    JOIN orders o ON o.order_id = fp.order_id
    JOIN customers c ON c.customer_id = o.customer_id
    ORDER BY fp.fraud_probability DESC, o.order_datetime DESC
    LIMIT ?`,
    [limit],
  );
}

export function getFraudPredictionSummary() {
  ensureFraudPredictionTable();
  const summary = selectOne<{
    scored_count: number;
    block_count: number;
    review_count: number;
    low_count: number;
    threshold: number;
  }>(
    `SELECT
      COUNT(*) AS scored_count,
      COALESCE(SUM(CASE WHEN decision_band = 'block' THEN 1 ELSE 0 END), 0) AS block_count,
      COALESCE(SUM(CASE WHEN decision_band = 'review' THEN 1 ELSE 0 END), 0) AS review_count,
      COALESCE(SUM(CASE WHEN decision_band = 'low' THEN 1 ELSE 0 END), 0) AS low_count,
      COALESCE(MAX(model_threshold), ?) AS threshold
    FROM fraud_predictions`,
    [FRAUD_MODEL_THRESHOLD],
  );

  return (
    summary ?? {
      scored_count: 0,
      block_count: 0,
      review_count: 0,
      low_count: 0,
      threshold: FRAUD_MODEL_THRESHOLD,
    }
  );
}

export function setOrderActualFraud(orderId: number, isFraud: boolean) {
  const result = runStatement(
    `UPDATE orders
     SET is_fraud = ?
     WHERE order_id = ?`,
    [isFraud ? 1 : 0, orderId],
  );

  return result.changes > 0;
}
