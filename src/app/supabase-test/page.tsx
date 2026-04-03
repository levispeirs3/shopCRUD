import SupabaseCustomersPreview from "@/components/supabase-customers-preview";

export const dynamic = "force-dynamic";

export default function SupabaseTestPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Supabase Test</h1>
      <SupabaseCustomersPreview />
    </section>
  );
}

