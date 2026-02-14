import { createServerSupabaseClient, getUser } from "@/lib/supabase-server";
import AcceptInviteButton from "./AcceptInviteButton";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getUser();

  const supabase = await createServerSupabaseClient();
  const { data: info } = await supabase.rpc("get_invite_info", {
    p_token: token,
  });

  const invite = info?.[0];

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            podman
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          {!invite ? (
            <>
              <p className="text-base font-medium text-foreground">
                Invalid invite link
              </p>
              <p className="mt-2 text-sm text-foreground/50">
                This invite link doesn&apos;t exist or has been revoked.
              </p>
            </>
          ) : invite.is_expired ? (
            <>
              <p className="text-base font-medium text-foreground">
                Invite expired
              </p>
              <p className="mt-2 text-sm text-foreground/50">
                This invite to <span className="font-medium text-foreground">{invite.group_name}</span> expired on{" "}
                {new Date(invite.expires_at).toLocaleDateString()}.
              </p>
              <p className="mt-1 text-sm text-foreground/40">
                Ask the group admin for a new link.
              </p>
            </>
          ) : !user ? (
            <>
              <p className="text-base font-medium text-foreground">
                You&apos;ve been invited to join
              </p>
              <p className="mt-2 text-lg font-bold text-foreground">
                {invite.group_name}
              </p>
              {invite.group_description && (
                <p className="mt-1 text-sm text-foreground/50">
                  {invite.group_description}
                </p>
              )}
              <div className="mt-6 space-y-2">
                <a
                  href={`/auth/signup?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                  className="block w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Sign up to join
                </a>
                <a
                  href={`/auth/login?redirect=${encodeURIComponent(`/invite/${token}`)}`}
                  className="block w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:border-border-light hover:text-foreground"
                >
                  Log in to join
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="text-base font-medium text-foreground">
                You&apos;ve been invited to join
              </p>
              <p className="mt-2 text-lg font-bold text-foreground">
                {invite.group_name}
              </p>
              {invite.group_description && (
                <p className="mt-1 text-sm text-foreground/50">
                  {invite.group_description}
                </p>
              )}
              <div className="mt-6">
                <AcceptInviteButton token={token} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
