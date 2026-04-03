import { FRAUD_MODEL_THRESHOLD } from "@/lib/fraud-config";
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

function scoreOrder(order: {
  risk_score: number | null;
  order_total: number | null;
  order_subtotal: number | null;
  shipping_fee: number | null;
  payment_method: string | null;
  device_type: string | null;
  ip_country: string | null;
  promo_used: number | null;
}) {
  const base = Number(order.risk_score ?? 0);
  const orderTotal = Number(order.order_total ?? 0);
  const orderSubtotal = Number(order.order_subtotal ?? 0);
  const shippingFee = Number(order.shipping_fee ?? 0);
  const shippingRatio = orderSubtotal > 0 ? shippingFee / orderSubtotal : 0;

  let score = clamp01(base) * 0.5;

  if (orderTotal > 400) {
    score += 0.2;
  }
  if (orderTotal > 800) {
    score += 0.15;
  }
  if ((order.ip_country ?? "US") !== "US") {
    score += 0.2;
  }
  if ((order.device_type ?? "").toLowerCase() === "mobile") {
    score += 0.05;
  }
  if (Number(order.promo_used ?? 0) === 1) {
    score += 0.05;
  }
  if (shippingRatio > 0.25) {
    score += 0.1;
  }
  if (order.payment_method && order.payment_method !== "card") {
    score += 0.1;
  }

  return clamp01(score);
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

  const totals = totalsRows[0];
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
  const { data, error } = await supabase
    .from("orders")
    .select(
      "order_id, risk_score, order_total, order_subtotal, shipping_fee, payment_method, device_type, ip_country, promo_used",
    );

  if (error) {
    throw new Error(`Failed to fetch orders for fraud scoring: ${error.message}`);
  }

  const orders = data ?? [];
  const scoredAt = new Date().toISOString();
  const scoredRows = orders.map((order) => {
    const fraudProbability = scoreOrder({
      risk_score: Number(order.risk_score ?? 0),
      order_total: Number(order.order_total ?? 0),
      order_subtotal: Number(order.order_subtotal ?? 0),
      shipping_fee: Number(order.shipping_fee ?? 0),
      payment_method: order.payment_method as string | null,
      device_type: order.device_type as string | null,
      ip_country: order.ip_country as string | null,
      promo_used: Number(order.promo_used ?? 0),
    });

    return {
      order_id: Number(order.order_id),
      risk_score: fraudProbability,
      decision_band: decisionBand(fraudProbability),
    };
  });

  const chunkSize = 500;
  for (let index = 0; index < scoredRows.length; index += chunkSize) {
    const chunk = scoredRows
      .slice(index, index + chunkSize)
      .map((row) => ({ order_id: row.order_id, risk_score: row.risk_score }));
    const { error: upsertError } = await supabase
      .from("orders")
      .upsert(chunk, { onConflict: "order_id" });

    if (upsertError) {
      throw new Error(`Failed to update fraud scores: ${upsertError.message}`);
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
    threshold: FRAUD_MODEL_THRESHOLD,
    modelName: "supabase-risk-heuristic-v1",
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
  const { data, error } = await supabase.from("orders").select("risk_score");
  if (error) {
    throw new Error(`Failed to fetch fraud summary: ${error.message}`);
  }

  const scores = (data ?? []).map((row) => clamp01(Number(row.risk_score ?? 0)));
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

