import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const CUSTOMER_COOKIE = "customer_id";

export async function getSelectedCustomerId() {
  const cookieStore = await cookies();
  const value = cookieStore.get(CUSTOMER_COOKIE)?.value;
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function requireSelectedCustomerId() {
  const customerId = await getSelectedCustomerId();
  if (!customerId) {
    redirect("/select-customer");
  }
  return customerId;
}
