import { getSelectedCustomerId } from "@/lib/customer-session";
import { getCustomerById } from "@/lib/shop";

export default async function CustomerBanner() {
  const customerId = await getSelectedCustomerId();
  if (!customerId) {
    return (
      <div className="text-sm text-gray-600">
        No customer selected. Choose one on the Select Customer page.
      </div>
    );
  }

  const customer = await getCustomerById(customerId);
  if (!customer) {
    return (
      <div className="text-sm text-red-700">
        Selected customer not found. Please select again.
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-700">
      Acting as:{" "}
      <span className="font-semibold">{customer.full_name}</span>{" "}
      ({customer.email}) - ID {customer.customer_id}
    </div>
  );
}
