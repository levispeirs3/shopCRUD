import { sql } from "@/lib/shop";

export const dynamic = "force-dynamic";

type TableRow = { table_name: string };
type ColumnRow = {
  ordinal_position: number;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

export default async function DebugSchemaPage() {
  const tables = await sql<TableRow[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name ASC
  `;

  const tableDetails = await Promise.all(
    tables.map(async (table) => {
      const columns = await sql<ColumnRow[]>`
        SELECT ordinal_position, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table.table_name}
        ORDER BY ordinal_position ASC
      `;
      return { name: table.table_name, columns };
    }),
  );

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Database Schema Debug</h1>
      <p className="text-sm text-gray-700">
        Developer-only helper page. Shows tables and column definitions from Supabase Postgres.
      </p>

      {tableDetails.length === 0 ? (
        <p className="rounded border bg-white p-4">No tables found in the public schema.</p>
      ) : (
        <div className="space-y-4">
          {tableDetails.map((table) => (
            <div key={table.name} className="rounded border bg-white p-4">
              <h2 className="text-lg font-semibold">{table.name}</h2>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Column</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Nullable</th>
                    <th className="p-2">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((column) => (
                    <tr key={column.ordinal_position} className="border-b">
                      <td className="p-2">{column.column_name}</td>
                      <td className="p-2">{column.data_type}</td>
                      <td className="p-2">{column.is_nullable}</td>
                      <td className="p-2">{column.column_default ?? "(none)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
