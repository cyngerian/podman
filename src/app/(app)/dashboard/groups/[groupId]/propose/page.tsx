import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import ProposalFormWrapper from "./ProposalFormWrapper";

export default async function ProposeDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { groupId } = await params;
  const { error } = await searchParams;

  const user = await getUser();

  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();

  // Verify group exists and user is a member
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, emoji")
    .eq("id", groupId)
    .single();

  if (!group) notFound();

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Propose Draft</h1>
        <p className="text-sm text-foreground/50 mt-1">
          in {group.name}{group.emoji ? ` ${group.emoji}` : ""}
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <ProposalFormWrapper groupId={groupId} />
    </div>
  );
}
