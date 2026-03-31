import Link from "next/link";
import { requireSelectedCustomerId } from "@/lib/customer-session";
import { getOrdersForCustomer } from "@/lib/shop";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ success?: string }>;
};

export default async function OrdersPage({ searchParams }: PageProps) {
  const customerId = await requireSelectedCustomerId();
  const orders = getOrdersForCustomer(customerId);
  const params = await searchParams;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Order History</h1>
      {params.success ? (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          Order placed successfully.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Order ID</th>
              <th className="p-2">Timestamp</th>
              <th className="p-2">Fulfilled</th>
              <th className="p-2">Total Value</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.order_id} className="border-b">
                <td className="p-2">
                  <Link className="text-blue-700 hover:underline" href={`/orders/${order.order_id}`}>
                    {order.order_id}
                  </Link>
                </td>
                <td className="p-2">{order.order_timestamp}</td>
                <td className="p-2">{order.fulfilled ? "Yes" : "No"}</td>
                <td className="p-2">${Number(order.total_value).toFixed(2)}</td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="p-2 text-gray-500" colSpan={4}>
                  No orders found for this customer.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
