import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSelectedCustomerId } from "@/lib/customer-session";
import { getOrderForCustomer, getOrderItems } from "@/lib/shop";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ order_id: string }>;
};

export default async function OrderDetailPage({ params }: PageProps) {
  const { order_id } = await params;
  const orderId = Number(order_id);
  const customerId = await requireSelectedCustomerId();

  if (!Number.isInteger(orderId) || orderId <= 0) {
    notFound();
  }

  const order = getOrderForCustomer(orderId, customerId);
  if (!order) {
    notFound();
  }

  const items = getOrderItems(orderId);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order {order.order_id}</h1>
        <Link href="/orders" className="text-sm text-blue-700 hover:underline">
          Back to orders
        </Link>
      </div>

      <div className="rounded border bg-white p-4 text-sm">
        <p>
          <span className="font-semibold">Timestamp:</span> {order.order_timestamp}
        </p>
        <p>
          <span className="font-semibold">Fulfilled:</span> {order.fulfilled ? "Yes" : "No"}
        </p>
        <p>
          <span className="font-semibold">Total Value:</span> ${Number(order.total_value).toFixed(2)}
        </p>
      </div>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Product</th>
              <th className="p-2">Quantity</th>
              <th className="p-2">Unit Price</th>
              <th className="p-2">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.product_name}-${index}`} className="border-b">
                <td className="p-2">{item.product_name}</td>
                <td className="p-2">{item.quantity}</td>
                <td className="p-2">${Number(item.unit_price).toFixed(2)}</td>
                <td className="p-2">${Number(item.line_total).toFixed(2)}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="p-2 text-gray-500" colSpan={4}>
                  No line items found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
