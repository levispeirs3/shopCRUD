import { requireSelectedCustomerId } from "@/lib/customer-session";
import { getCustomerById, getCustomerOrderSummary } from "@/lib/shop";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const customerId = await requireSelectedCustomerId();
  const customer = getCustomerById(customerId);
  if (!customer) {
    redirect("/select-customer");
  }

  const summary = getCustomerOrderSummary(customerId);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Customer Dashboard</h1>

      <div className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">{customer.full_name}</h2>
        <p className="text-sm text-gray-700">{customer.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-gray-600">Total Orders</p>
          <p className="text-2xl font-semibold">{summary.orderCount}</p>
        </div>
        <div className="rounded border bg-white p-4">
          <p className="text-sm text-gray-600">Total Spend</p>
          <p className="text-2xl font-semibold">${Number(summary.totalSpend).toFixed(2)}</p>
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <h3 className="text-lg font-semibold">Recent Orders (Last 5)</h3>
        <table className="mt-2 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Order ID</th>
              <th className="p-2">Timestamp</th>
              <th className="p-2">Fulfilled</th>
              <th className="p-2">Total Value</th>
            </tr>
          </thead>
          <tbody>
            {summary.recentOrders.map((order) => (
              <tr key={order.order_id} className="border-b">
                <td className="p-2">{order.order_id}</td>
                <td className="p-2">{order.order_timestamp}</td>
                <td className="p-2">{order.fulfilled ? "Yes" : "No"}</td>
                <td className="p-2">${Number(order.total_value).toFixed(2)}</td>
              </tr>
            ))}
            {summary.recentOrders.length === 0 ? (
              <tr>
                <td className="p-2 text-gray-500" colSpan={4}>
                  No orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
