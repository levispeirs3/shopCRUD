import { redirect } from "next/navigation";
import { createOrder, getProducts } from "@/lib/shop";
import { requireSelectedCustomerId } from "@/lib/customer-session";

export const dynamic = "force-dynamic";

const EMPTY_ROWS = 5;

async function placeOrderAction(formData: FormData) {
  "use server";
  const customerId = await requireSelectedCustomerId();

  const productIds = formData.getAll("product_id");
  const quantities = formData.getAll("quantity");

  const items: Array<{ productId: number; quantity: number }> = [];

  for (let i = 0; i < productIds.length; i += 1) {
    const productId = Number(productIds[i]);
    const quantity = Number(quantities[i]);

    if (!productId || !quantity) {
      continue;
    }
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    items.push({ productId, quantity });
  }

  if (items.length === 0) {
    redirect("/place-order?error=1");
  }

  await createOrder(customerId, items);
  redirect("/orders?success=1");
}

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function PlaceOrderPage({ searchParams }: PageProps) {
  await requireSelectedCustomerId();
  const products = await getProducts();
  const params = await searchParams;

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Place Order</h1>
      <p className="text-sm text-gray-700">
        Add one or more line items. Leave unused rows blank.
      </p>

      {params.error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Add at least one valid product and quantity.
        </div>
      ) : null}

      <form action={placeOrderAction} className="rounded border bg-white p-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Product</th>
              <th className="p-2">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: EMPTY_ROWS }).map((_, index) => (
              <tr key={index} className="border-b">
                <td className="p-2">
                  <select name="product_id" className="w-full rounded border px-2 py-1">
                    <option value="">-- Select --</option>
                    {products.map((product) => (
                      <option key={product.product_id} value={product.product_id}>
                        {product.product_name} (${Number(product.price).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={1}
                    className="w-32 rounded border px-2 py-1"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="submit" className="mt-4 rounded bg-blue-600 px-4 py-2 text-white">
          Place Order
        </button>
      </form>
    </section>
  );
}
