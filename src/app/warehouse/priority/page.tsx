import { getWarehousePriorityQueue } from "@/lib/shop";

export const dynamic = "force-dynamic";

export default async function WarehousePriorityPage() {
  const rows = await getWarehousePriorityQueue();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Late Delivery Priority Queue</h1>
      <p className="text-sm text-gray-700">
        This queue helps warehouse teams prioritize open orders most likely to be delivered late, so high-risk
        shipments can be addressed first.
      </p>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Order ID</th>
              <th className="p-2">Timestamp</th>
              <th className="p-2">Total</th>
              <th className="p-2">Fulfilled</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Late Prob.</th>
              <th className="p-2">Predicted Late</th>
              <th className="p-2">Prediction Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.order_id} className="border-b">
                <td className="p-2">{row.order_id}</td>
                <td className="p-2">{row.order_timestamp}</td>
                <td className="p-2">${Number(row.total_value).toFixed(2)}</td>
                <td className="p-2">{row.fulfilled ? "Yes" : "No"}</td>
                <td className="p-2">
                  {row.customer_name} (#{row.customer_id})
                </td>
                <td className="p-2">{Number(row.late_delivery_probability).toFixed(3)}</td>
                <td className="p-2">{row.predicted_late_delivery ? "Yes" : "No"}</td>
                <td className="p-2">{row.prediction_timestamp}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="p-2 text-gray-500" colSpan={8}>
                  No rows returned.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
