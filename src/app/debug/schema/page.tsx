import { selectAll } from "@/lib/db";

export const dynamic = "force-dynamic";

type TableName = { name: string };
type TableColumn = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

export default function DebugSchemaPage() {
  const tables = selectAll<TableName>(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name ASC`,
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Database Schema Debug</h1>
      <p className="text-sm text-gray-700">
        Developer-only helper page. It shows tables and column definitions from <code>shop.db</code>.
      </p>

      {tables.length === 0 ? (
        <p className="rounded border bg-white p-4">No tables found in the configured database.</p>
      ) : (
        <div className="space-y-4">
          {tables.map((table) => {
            const columns = selectAll<TableColumn>(`PRAGMA table_info(${table.name})`);
            return (
              <div key={table.name} className="rounded border bg-white p-4">
                <h2 className="text-lg font-semibold">{table.name}</h2>
                <table className="mt-2 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">Column</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">PK</th>
                      <th className="p-2">Not Null</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((column) => (
                      <tr key={column.cid} className="border-b">
                        <td className="p-2">{column.name}</td>
                        <td className="p-2">{column.type || "(none)"}</td>
                        <td className="p-2">{column.pk ? "Yes" : "No"}</td>
                        <td className="p-2">{column.notnull ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
