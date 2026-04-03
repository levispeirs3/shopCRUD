"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type CustomerRow = {
  customer_id: number;
  full_name: string;
  email: string;
};

export default function SupabaseCustomersPreview() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCustomers() {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("customers")
        .select("customer_id, full_name, email")
        .order("customer_id", { ascending: true })
        .limit(10);

      if (!active) {
        return;
      }

      if (queryError) {
        setError(queryError.message);
        setRows([]);
      } else {
        setRows((data ?? []) as CustomerRow[]);
      }

      setLoading(false);
    }

    loadCustomers();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-3 rounded border bg-white p-4">
      <h2 className="text-lg font-semibold">Supabase Query Test</h2>
      <p className="text-sm text-gray-700">Previewing up to 10 rows from the `customers` table via Supabase.</p>

      {loading ? <p className="text-sm text-gray-600">Loading...</p> : null}
      {error ? <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      {!loading && !error ? (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.customer_id} className="rounded border p-2">
              #{row.customer_id} - {row.full_name} ({row.email})
            </li>
          ))}
          {rows.length === 0 ? <li className="text-gray-600">No rows returned.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

