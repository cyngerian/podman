import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";

export default async function DraftRouterPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;

  const user = await getUser();

  if (!user) redirect("/auth/login");

  const supabase = await createServerSupabaseClient();

  const { data: draft } = await supabase
    .from("drafts")
    .select("id, status, format")
    .eq("id", draftId)
    .single();

  if (!draft) notFound();

  switch (draft.status) {
    case "lobby":
      redirect(`/draft/${draftId}/lobby`);
    case "active":
      if (draft.format === "winston") {
        redirect(`/draft/${draftId}/winston`);
      }
      redirect(`/draft/${draftId}/pick`);
    case "deck_building":
      redirect(`/draft/${draftId}/deckbuild`);
    case "complete":
      redirect(`/draft/${draftId}/results`);
    default:
      redirect(`/draft/${draftId}/lobby`);
  }
}
