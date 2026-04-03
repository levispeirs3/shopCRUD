import { setOrderActualFraud } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ order_id: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const { order_id } = await params;
  const orderId = Number(order_id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return Response.json({ error: "Invalid order id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { isFraud?: unknown } | null;
  if (typeof body?.isFraud !== "boolean") {
    return Response.json({ error: "Expected isFraud boolean in request body." }, { status: 400 });
  }

  const updated = await setOrderActualFraud(orderId, body.isFraud);
  if (!updated) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  return Response.json({ orderId, isFraud: body.isFraud });
}
