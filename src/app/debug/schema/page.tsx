import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TABLE_NAMES = [
  "customers",
  "products",
  "orders",
  "order_items",
  "shipments",
  "product_reviews",
];

export default async function DebugSchemaPage() {
  const supabase = getSupabaseServerClient();
  const diagnostics = await Promise.all(
    TABLE_NAMES.map(async (tableName) => {
      const { count, error } = await supabase
        .from(tableName)
        .select("*", { head: true, count: "exact" });
      return {
        tableName,
        rowCount: count ?? 0,
        error: error?.message ?? null,
      };
    }),
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Database Debug</h1>
      <p className="text-sm text-gray-700">
        Supabase connectivity diagnostics for core app tables.
      </p>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Table</th>
              <th className="p-2">Rows</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {diagnostics.map((entry) => (
              <tr key={entry.tableName} className="border-b">
                <td className="p-2 font-medium">{entry.tableName}</td>
                <td className="p-2">{entry.rowCount}</td>
                <td className="p-2">
                  {entry.error ? (
                    <span className="text-red-700">{entry.error}</span>
                  ) : (
                    <span className="text-green-700">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

