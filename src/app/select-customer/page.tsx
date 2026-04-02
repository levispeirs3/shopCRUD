import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CUSTOMER_COOKIE } from "@/lib/customer-session";
import { getCustomers } from "@/lib/shop";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

async function selectCustomerAction(formData: FormData) {
  "use server";
  const customerId = Number(formData.get("customer_id"));
  if (!Number.isInteger(customerId) || customerId <= 0) {
    redirect("/select-customer");
  }

  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE, String(customerId), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect("/dashboard");
}

export default async function SelectCustomerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q ?? "";
  const customers = await getCustomers(q);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Select Customer</h1>
      <p className="text-sm text-gray-700">
        Choose a customer to act as for this session. The selected customer ID is stored in a cookie.
      </p>

      <form method="get" className="rounded border bg-white p-4">
        <label className="block text-sm font-medium" htmlFor="q">
          Search by name or email
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="q"
            name="q"
            defaultValue={q}
            className="w-full rounded border px-3 py-2"
            placeholder="e.g. alice or alice@example.com"
          />
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
            Search
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">ID</th>
              <th className="p-2">Name</th>
              <th className="p-2">Email</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.customer_id} className="border-b">
                <td className="p-2">{customer.customer_id}</td>
                <td className="p-2">{customer.full_name}</td>
                <td className="p-2">{customer.email}</td>
                <td className="p-2">
                  <form action={selectCustomerAction}>
                    <input type="hidden" name="customer_id" value={customer.customer_id} />
                    <button type="submit" className="rounded bg-green-600 px-3 py-1 text-white">
                      Select
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {customers.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-500" colSpan={4}>
                  No customers found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
