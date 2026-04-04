import { FRAUD_MODEL_THRESHOLD } from "@/lib/fraud-config";
import { scoreOrdersWithPython } from "@/lib/fraud-python";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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

export type FraudPipelineRunResult = {
  updatedCount: number;
  blockedCount: number;
  reviewCount: number;
  lowCount: number;
  threshold: number;
  modelName: string;
  scoredAt: string;
  holdoutPrecision: number | null;
  holdoutRecall: number | null;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function decisionBand(probability: number): "low" | "review" | "block" {
  const lowCut = Math.min(0.3, Math.max(0.05, FRAUD_MODEL_THRESHOLD * 0.5));
  if (probability > FRAUD_MODEL_THRESHOLD) {
    return "block";
  }
  if (probability > lowCut) {
    return "review";
  }
  return "low";
}

function toShipmentArray(value: unknown) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value as Array<Record<string, unknown>>;
  }
  return [value as Record<string, unknown>];
}

function toCustomerName(value: unknown) {
  if (!value) {
    return "Unknown";
  }
  if (Array.isArray(value)) {
    return String(value[0]?.full_name ?? "Unknown");
  }
  return String((value as { full_name?: string }).full_name ?? "Unknown");
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

type FraudScoringOrderSourceRow = {
  order_id: number;
  customer_id: number;
  order_datetime: string | null;
  billing_zip: string | null;
  shipping_zip: string | null;
  shipping_state: string | null;
  payment_method: string | null;
  device_type: string | null;
  ip_country: string | null;
  promo_used: number | null;
  order_subtotal: number | null;
  shipping_fee: number | null;
  tax_amount: number | null;
  order_total: number | null;
  risk_score: number | null;
};

type FraudScoringCustomerRow = {
  customer_id: number;
  gender?: string | null;
  birthdate?: string | null;
  created_at?: string | null;
  city?: string | null;
  state?: string | null;
  customer_segment?: string | null;
  loyalty_tier?: string | null;
  is_active?: number | null;
};

type FraudScoringShipmentRow = {
  order_id: number;
  carrier?: string | null;
  shipping_method?: string | null;
  distance_band?: string | null;
  promised_days?: number | null;
  actual_days?: number | null;
  late_delivery?: number | null;
};

type FraudScoringItemRow = {
  order_id: number;
  quantity: number | null;
  line_total: number | null;
  unit_price: number | null;
  product_id: number | null;
};

export async function getCustomers(search: string) {
  const supabase = getSupabaseServerClient();
  const term = search.trim();

  let query = supabase
    .from("customers")
    .select("customer_id, full_name, email")
    .order("full_name", { ascending: true })
    .limit(100);

  if (term.length > 0) {
    const cleaned = term.replace(/[%]/gu, "");
    query = query.or(`full_name.ilike.%${cleaned}%,email.ilike.%${cleaned}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch customers: ${error.message}`);
  }

  return (data ?? []) as Customer[];
}

export async function getCustomerById(customerId: number) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("customer_id, full_name, email")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch customer: ${error.message}`);
  }

  return data as Customer | null;
}

export async function getCustomerOrderSummary(customerId: number) {
  const supabase = getSupabaseServerClient();

  const [totalsResponse, recentOrdersResponse] = await Promise.all([
    supabase
      .from("orders")
      .select("order_total")
      .eq("customer_id", customerId),
    supabase
      .from("orders")
      .select("order_id, order_datetime, order_total, shipments(shipment_id)")
      .eq("customer_id", customerId)
      .order("order_datetime", { ascending: false })
      .limit(5),
  ]);

  if (totalsResponse.error) {
    throw new Error(`Failed to fetch order totals: ${totalsResponse.error.message}`);
  }
  if (recentOrdersResponse.error) {
    throw new Error(`Failed to fetch recent orders: ${recentOrdersResponse.error.message}`);
  }

  const totals = totalsResponse.data ?? [];
  const orderCount = totals.length;
  const totalSpend = totals.reduce((acc, row) => acc + Number(row.order_total ?? 0), 0);

  const recentOrders = (recentOrdersResponse.data ?? []).map((row) => {
    const shipments = toShipmentArray(row.shipments);
    return {
      order_id: Number(row.order_id),
      order_timestamp: String(row.order_datetime),
      fulfilled: shipments.length > 0 ? 1 : 0,
      total_value: Number(row.order_total ?? 0),
    } satisfies OrderRow;
  });

  return {
    orderCount,
    totalSpend,
    recentOrders,
  };
}

export async function getProducts() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("product_id, product_name, price")
    .order("product_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return (data ?? []) as Product[];
}

export async function createOrder(
  customerId: number,
  items: Array<{ productId: number; quantity: number }>,
) {
  const supabase = getSupabaseServerClient();
  const productIds = [...new Set(items.map((item) => item.productId))];

  const [productsResponse, customerLocationResponse] = await Promise.all([
    supabase
      .from("products")
      .select("product_id, price")
      .in("product_id", productIds),
    supabase
      .from("customers")
      .select("zip_code, state")
      .eq("customer_id", customerId)
      .maybeSingle(),
  ]);

  if (productsResponse.error) {
    throw new Error(`Failed to fetch products for order creation: ${productsResponse.error.message}`);
  }
  if (customerLocationResponse.error) {
    throw new Error(`Failed to fetch customer location: ${customerLocationResponse.error.message}`);
  }

  const priceByProductId = new Map<number, number>(
    (productsResponse.data ?? []).map((product) => [Number(product.product_id), Number(product.price)]),
  );

  let subtotal = 0;
  const itemDetails: Array<{ productId: number; quantity: number; price: number }> = [];
  for (const item of items) {
    const price = priceByProductId.get(item.productId);
    if (price === undefined) {
      throw new Error(`Product ${item.productId} not found`);
    }

    subtotal += price * item.quantity;
    itemDetails.push({
      productId: item.productId,
      quantity: item.quantity,
      price,
    });
  }

  const zip = customerLocationResponse.data?.zip_code ?? "";
  const state = customerLocationResponse.data?.state ?? "";
  const now = new Date().toISOString();

  const { data: insertedOrder, error: orderInsertError } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      order_datetime: now,
      billing_zip: zip,
      shipping_zip: zip,
      shipping_state: state,
      payment_method: "card",
      device_type: "web",
      ip_country: "US",
      promo_used: 0,
      promo_code: null,
      order_subtotal: subtotal,
      shipping_fee: 0,
      tax_amount: 0,
      order_total: subtotal,
      risk_score: 0,
      is_fraud: 0,
    })
    .select("order_id")
    .single();

  if (orderInsertError) {
    throw new Error(`Failed to create order: ${orderInsertError.message}`);
  }

  const orderId = Number(insertedOrder.order_id);
  const orderItemsPayload = itemDetails.map((item) => ({
    order_id: orderId,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.price,
    line_total: item.price * item.quantity,
  }));

  const { error: itemInsertError } = await supabase.from("order_items").insert(orderItemsPayload);
  if (itemInsertError) {
    throw new Error(`Failed to create order items: ${itemInsertError.message}`);
  }

  return orderId;
}

export async function getOrdersForCustomer(customerId: number) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("order_id, order_datetime, order_total, shipments(shipment_id)")
    .eq("customer_id", customerId)
    .order("order_datetime", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const shipments = toShipmentArray(row.shipments);
    return {
      order_id: Number(row.order_id),
      order_timestamp: String(row.order_datetime),
      fulfilled: shipments.length > 0 ? 1 : 0,
      total_value: Number(row.order_total ?? 0),
    } satisfies OrderRow;
  });
}

export async function getOrderForCustomer(orderId: number, customerId: number) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("order_id, order_datetime, order_total, shipments(shipment_id)")
    .eq("order_id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch order: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const shipments = toShipmentArray(data.shipments);
  return {
    order_id: Number(data.order_id),
    order_timestamp: String(data.order_datetime),
    fulfilled: shipments.length > 0 ? 1 : 0,
    total_value: Number(data.order_total ?? 0),
  } satisfies OrderRow;
}

export async function getOrderItems(orderId: number) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("quantity, unit_price, line_total, products(product_name)")
    .eq("order_id", orderId)
    .order("order_item_id", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch order items: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    product_name: Array.isArray(row.products)
      ? String(row.products[0]?.product_name ?? "Unknown")
      : String((row.products as { product_name?: string } | null)?.product_name ?? "Unknown"),
    quantity: Number(row.quantity ?? 0),
    unit_price: Number(row.unit_price ?? 0),
    line_total: Number(row.line_total ?? 0),
  }));
}

export async function getWarehousePriorityQueue() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_id, order_datetime, order_total, risk_score, customer_id, customers(full_name), shipments(shipment_id, late_delivery, ship_datetime)",
    );

  if (error) {
    throw new Error(`Failed to fetch warehouse queue data: ${error.message}`);
  }

  const queueRows = (data ?? [])
    .map((row) => {
      const shipments = toShipmentArray(row.shipments);
      const fulfilled = shipments.length > 0 ? 1 : 0;
      const latestShipment = shipments[0];
      const probability = latestShipment?.late_delivery != null
        ? Number(latestShipment.late_delivery)
        : Number(row.risk_score ?? 0);
      const latePrediction =
        latestShipment?.late_delivery != null
          ? Number(latestShipment.late_delivery)
          : probability >= 0.5
            ? 1
            : 0;

      return {
        order_id: Number(row.order_id),
        order_timestamp: String(row.order_datetime),
        total_value: Number(row.order_total ?? 0),
        fulfilled,
        customer_id: Number(row.customer_id),
        customer_name: toCustomerName(row.customers),
        late_delivery_probability: clamp01(probability),
        predicted_late_delivery: latePrediction,
        prediction_timestamp: String(
          latestShipment?.ship_datetime ?? row.order_datetime,
        ),
      };
    })
    .filter((row) => row.fulfilled === 0)
    .sort((a, b) => {
      if (b.late_delivery_probability !== a.late_delivery_probability) {
        return b.late_delivery_probability - a.late_delivery_probability;
      }
      return a.order_timestamp.localeCompare(b.order_timestamp);
    })
    .slice(0, 50);

  return queueRows;
}

export async function runFraudScoringJob(): Promise<FraudPipelineRunResult> {
  const supabase = getSupabaseServerClient();
  const [orders, customers, shipments, orderItems] = await Promise.all([
    fetchAllRows<FraudScoringOrderSourceRow>(async (from, to) =>
      await supabase
        .from("orders")
        .select(
          "order_id, customer_id, order_datetime, billing_zip, shipping_zip, shipping_state, payment_method, device_type, ip_country, promo_used, order_subtotal, shipping_fee, tax_amount, order_total, risk_score",
        )
        .order("order_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<FraudScoringCustomerRow>(async (from, to) =>
      await supabase
        .from("customers")
        .select("customer_id, gender, birthdate, created_at, city, state, customer_segment, loyalty_tier, is_active")
        .order("customer_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<FraudScoringShipmentRow>(async (from, to) =>
      await supabase
        .from("shipments")
        .select("order_id, carrier, shipping_method, distance_band, promised_days, actual_days, late_delivery")
        .order("shipment_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<FraudScoringItemRow>(async (from, to) =>
      await supabase
        .from("order_items")
        .select("order_id, quantity, line_total, unit_price, product_id")
        .order("order_item_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const scoredAt = new Date().toISOString();
  const customerById = new Map(customers.map((customer) => [Number(customer.customer_id), customer]));
  const shipmentByOrderId = new Map(shipments.map((shipment) => [Number(shipment.order_id), shipment]));
  const ordersForPython = orders.map((order) => ({
    ...order,
    customers: customerById.get(Number(order.customer_id)) ?? null,
    shipments: shipmentByOrderId.get(Number(order.order_id)) ?? null,
  }));

  const pythonResult = scoreOrdersWithPython({
    orders: ordersForPython,
    order_items: orderItems,
  });
  const scoredRows = pythonResult.predictions.map((prediction) => ({
    order_id: prediction.order_id,
    risk_score: prediction.risk_score,
    decision_band: prediction.decision_band,
  }));

  const chunkSize = 500;
  for (let index = 0; index < scoredRows.length; index += chunkSize) {
    const chunk = scoredRows.slice(index, index + chunkSize);
    const results = await Promise.all(
      chunk.map((row) =>
        supabase
          .from("orders")
          .update({ risk_score: row.risk_score })
          .eq("order_id", row.order_id),
      ),
    );

    const failedUpdate = results.find((result) => result.error);
    if (failedUpdate?.error) {
      throw new Error(`Failed to update fraud scores: ${failedUpdate.error.message}`);
    }
  }

  const blockedCount = scoredRows.filter((row) => row.decision_band === "block").length;
  const reviewCount = scoredRows.filter((row) => row.decision_band === "review").length;
  const lowCount = scoredRows.filter((row) => row.decision_band === "low").length;

  return {
    updatedCount: scoredRows.length,
    blockedCount,
    reviewCount,
    lowCount,
    threshold: pythonResult.threshold,
    modelName: pythonResult.model_name,
    scoredAt,
    holdoutPrecision: null,
    holdoutRecall: null,
  };
}

export async function getFraudPredictions(limit = 250) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_id, customer_id, order_datetime, order_total, risk_score, is_fraud, customers(full_name)",
    )
    .order("risk_score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch fraud predictions: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const fraudProbability = clamp01(Number(row.risk_score ?? 0));
    return {
      order_id: Number(row.order_id),
      customer_id: Number(row.customer_id),
      customer_name: toCustomerName(row.customers),
      order_timestamp: String(row.order_datetime),
      total_value: Number(row.order_total ?? 0),
      fraud_probability: fraudProbability,
      predicted_fraud: fraudProbability >= FRAUD_MODEL_THRESHOLD ? 1 : 0,
      decision_band: decisionBand(fraudProbability),
      scored_at: String(row.order_datetime),
      actual_fraud: Number(row.is_fraud ?? 0),
    } satisfies FraudPredictionRow;
  });
}

export async function getFraudPredictionSummary() {
  const supabase = getSupabaseServerClient();
  const rows = await fetchAllRows<{ risk_score: number | null }>(async (from, to) =>
    await supabase.from("orders").select("risk_score").order("order_id", { ascending: true }).range(from, to),
  );
  const scores = rows.map((row) => clamp01(Number(row.risk_score ?? 0)));
  const scoredCount = scores.length;
  const blockCount = scores.filter((score) => decisionBand(score) === "block").length;
  const reviewCount = scores.filter((score) => decisionBand(score) === "review").length;
  const lowCount = scores.filter((score) => decisionBand(score) === "low").length;

  return {
    scored_count: scoredCount,
    block_count: blockCount,
    review_count: reviewCount,
    low_count: lowCount,
    threshold: FRAUD_MODEL_THRESHOLD,
  };
}

export async function setOrderActualFraud(orderId: number, isFraud: boolean) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ is_fraud: isFraud ? 1 : 0 })
    .eq("order_id", orderId)
    .select("order_id")
    .limit(1);

  if (error) {
    throw new Error(`Failed to update fraud label: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

