import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase-server";
import SimulateFormWrapper from "./SimulateFormWrapper";

export default async function SimulateDraftPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Simulate Draft</h1>
        <p className="text-sm text-foreground/50 mt-1">
          Practice drafting against computer opponents
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <SimulateFormWrapper />
    </div>
  );
}
