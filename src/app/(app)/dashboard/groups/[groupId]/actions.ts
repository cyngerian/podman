"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { Json } from "@/lib/database.types";

export async function createProposal(formData: FormData) {
  const groupId = formData.get("group_id") as string;
  const title = (formData.get("title") as string)?.trim();
  const format = formData.get("format") as string;
  const setCode = (formData.get("set_code") as string)?.trim() || null;
  const setName = (formData.get("set_name") as string)?.trim() || null;
  const playerCount = parseInt(formData.get("player_count") as string, 10);
  const configJson = formData.get("config") as string;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const config = configJson ? JSON.parse(configJson) as Json : null;

  const { data: proposal, error } = await supabase
    .from("draft_proposals")
    .insert({
      group_id: groupId,
      proposed_by: user.id,
      title: title || `${format} Draft`,
      format,
      set_code: setCode,
      set_name: setName,
      player_count: playerCount,
      config,
    })
    .select("id")
    .single();

  if (error || !proposal) {
    redirect(
      `/dashboard/groups/${groupId}/propose?error=${encodeURIComponent(error?.message ?? "Failed to create proposal")}`
    );
  }

  // Auto-vote "in" for the proposer
  await supabase.from("proposal_votes").insert({
    proposal_id: proposal.id,
    user_id: user.id,
    vote: "in",
  });

  redirect(`/dashboard/groups/${groupId}/proposals/${proposal.id}`);
}

export async function voteOnProposal(formData: FormData) {
  const proposalId = formData.get("proposal_id") as string;
  const groupId = formData.get("group_id") as string;
  const vote = formData.get("vote") as string;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Upsert vote
  await supabase.from("proposal_votes").upsert(
    {
      proposal_id: proposalId,
      user_id: user.id,
      vote,
    },
    { onConflict: "proposal_id,user_id" }
  );

  // Check if enough "in" votes to auto-confirm
  const { data: proposal } = await supabase
    .from("draft_proposals")
    .select("player_count, status")
    .eq("id", proposalId)
    .single();

  if (proposal && proposal.status === "open") {
    const { count } = await supabase
      .from("proposal_votes")
      .select("*", { count: "exact", head: true })
      .eq("proposal_id", proposalId)
      .eq("vote", "in");

    if (count && count >= proposal.player_count) {
      // Atomic conditional update — only one concurrent caller wins.
      // If two votes race, both may see count >= player_count, but only
      // the first update matching status='open' will take effect.
      const admin = createAdminClient();
      await admin
        .from("draft_proposals")
        .update({ status: "confirmed" })
        .eq("id", proposalId)
        .eq("status", "open");
    }
  }

  redirect(`/dashboard/groups/${groupId}/proposals/${proposalId}`);
}

export async function cancelProposal(formData: FormData) {
  const proposalId = formData.get("proposal_id") as string;
  const groupId = formData.get("group_id") as string;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verify user is proposer or group admin before cancelling
  const { data: proposal } = await supabase
    .from("draft_proposals")
    .select("proposed_by")
    .eq("id", proposalId)
    .single();

  if (!proposal) redirect(`/dashboard/groups/${groupId}`);

  if (proposal.proposed_by !== user.id) {
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (membership?.role !== "admin") {
      redirect(`/dashboard/groups/${groupId}`);
    }
  }

  await supabase
    .from("draft_proposals")
    .update({ status: "cancelled" })
    .eq("id", proposalId);

  redirect(`/dashboard/groups/${groupId}`);
}

export async function convertProposalToDraft(formData: FormData) {
  const proposalId = formData.get("proposal_id") as string;
  const groupId = formData.get("group_id") as string;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Load proposal
  const { data: proposal } = await supabase
    .from("draft_proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (!proposal || proposal.status !== "confirmed") {
    redirect(`/dashboard/groups/${groupId}/proposals/${proposalId}?error=Proposal+not+confirmed`);
  }

  // Get all "in" voters
  const { data: inVotes } = await supabase
    .from("proposal_votes")
    .select("user_id")
    .eq("proposal_id", proposalId)
    .eq("vote", "in");

  const voters = inVotes ?? [];

  // Create draft using admin client (bypasses RLS for inserting other users as draft_players)
  const admin = createAdminClient();

  const config = proposal.config ?? {};

  const { data: draft, error: draftError } = await admin
    .from("drafts")
    .insert({
      group_id: groupId,
      host_id: user.id,
      proposal_id: proposalId,
      format: proposal.format,
      set_code: proposal.set_code,
      set_name: proposal.set_name,
      status: "lobby",
      config: config as Json,
    })
    .select("id")
    .single();

  if (draftError || !draft) {
    redirect(
      `/dashboard/groups/${groupId}/proposals/${proposalId}?error=${encodeURIComponent(draftError?.message ?? "Failed to create draft")}`
    );
  }

  // Add all "in" voters as draft players
  const playerInserts = voters.map((v) => ({
    draft_id: draft.id,
    user_id: v.user_id,
  }));

  await admin.from("draft_players").insert(playerInserts);

  // Mark proposal as drafted
  await supabase
    .from("draft_proposals")
    .update({ status: "drafted" })
    .eq("id", proposalId);

  redirect(`/draft/${draft.id}`);
}

export async function updateGroupEmoji(
  groupId: string,
  emoji: string | null
): Promise<{ error: string } | void> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verify user is admin of this group
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "admin") {
    return { error: "Only admins can update the group emoji" };
  }

  const { error } = await supabase
    .from("groups")
    .update({ emoji: emoji || null })
    .eq("id", groupId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/groups/${groupId}`);
  revalidatePath("/dashboard");
}

export async function createInviteLinkAction(groupId: string): Promise<{ error: string } | void> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verify user is admin of this group
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "admin") {
    return { error: "Only admins can create invite links" };
  }

  const { error } = await supabase.from("group_invites").insert({
    group_id: groupId,
    created_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/groups/${groupId}`);
}

export async function revokeInviteLinkAction(inviteId: string, groupId: string): Promise<{ error: string } | void> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verify user is admin of this group
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "admin") {
    return { error: "Only admins can revoke invite links" };
  }

  const { error } = await supabase.from("group_invites").delete().eq("id", inviteId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/groups/${groupId}`);
}
