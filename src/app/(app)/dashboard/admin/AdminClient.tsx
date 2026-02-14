"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resetUserPassword,
  deleteUser,
  deleteGroup,
  deleteDraft,
} from "./actions";

interface User {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

interface Draft {
  id: string;
  format: string;
  setCode: string | null;
  setName: string | null;
  status: string;
  hostName: string;
  isSimulated: boolean;
  createdAt: string;
}

type Tab = "users" | "groups" | "drafts";

export default function AdminClient({
  users,
  groups,
  drafts,
}: {
  users: User[];
  groups: Group[];
  drafts: Draft[];
}) {
  const [tab, setTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "users", label: "Users", count: users.length },
    { key: "groups", label: "Groups", count: groups.length },
    { key: "drafts", label: "Drafts", count: drafts.length },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-accent text-foreground"
                : "text-foreground/40 hover:text-foreground/60"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === "users" && <UsersSection users={users} />}
      {tab === "groups" && <GroupsSection groups={groups} />}
      {tab === "drafts" && <DraftsSection drafts={drafts} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersSection({ users }: { users: User[] }) {
  return (
    <div className="space-y-2">
      {users.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "reset" | "confirmDelete">("idle");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleReset() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await resetUserPassword(user.id, password);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess("Password reset");
        setPassword("");
        setMode("idle");
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (result?.error) {
        setError(result.error);
        setMode("idle");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {user.displayName ?? "No name"}
            </span>
            {user.isAdmin && (
              <span className="text-[10px] uppercase tracking-wide text-accent font-semibold">
                Admin
              </span>
            )}
          </div>
          <div className="text-xs text-foreground/40 truncate">{user.email}</div>
          <div className="text-xs text-foreground/30">
            Joined {new Date(user.createdAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => {
              setMode(mode === "reset" ? "idle" : "reset");
              setError(null);
              setSuccess(null);
            }}
            className="rounded-lg border border-border px-2 py-1 text-xs text-foreground/60 hover:border-border-light hover:text-foreground transition-colors"
          >
            Reset PW
          </button>
          <button
            onClick={() => {
              setMode(mode === "confirmDelete" ? "idle" : "confirmDelete");
              setError(null);
            }}
            className="rounded-lg border border-red-800/30 px-2 py-1 text-xs text-red-400 hover:border-red-700 hover:text-red-300 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}
      {success && <div className="text-xs text-green-400">{success}</div>}

      {mode === "reset" && (
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none"
          />
          <button
            onClick={handleReset}
            disabled={pending || !password}
            className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {pending ? "..." : "Set"}
          </button>
        </div>
      )}

      {mode === "confirmDelete" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">
            Delete this user and all their data?
          </span>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="rounded-lg bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {pending ? "..." : "Confirm"}
          </button>
          <button
            onClick={() => setMode("idle")}
            className="text-xs text-foreground/40 hover:text-foreground/60"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

function GroupsSection({ groups }: { groups: Group[] }) {
  return (
    <div className="space-y-2">
      {groups.length === 0 && (
        <p className="text-sm text-foreground/40">No groups.</p>
      )}
      {groups.map((group) => (
        <GroupRow key={group.id} group={group} />
      ))}
    </div>
  );
}

function GroupRow({ group }: { group: Group }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{group.name}</div>
          <div className="text-xs text-foreground/40">
            {group.memberCount} member{group.memberCount !== 1 && "s"} · Created{" "}
            {new Date(group.createdAt).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={() => setConfirming(!confirming)}
          className="shrink-0 rounded-lg border border-red-800/30 px-2 py-1 text-xs text-red-400 hover:border-red-700 hover:text-red-300 transition-colors"
        >
          Delete
        </button>
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      {confirming && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">
            Delete group and all its drafts/proposals?
          </span>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="rounded-lg bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {pending ? "..." : "Confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-foreground/40 hover:text-foreground/60"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

function DraftsSection({ drafts }: { drafts: Draft[] }) {
  return (
    <div className="space-y-2">
      {drafts.length === 0 && (
        <p className="text-sm text-foreground/40">No drafts.</p>
      )}
      {drafts.map((draft) => (
        <DraftRow key={draft.id} draft={draft} />
      ))}
    </div>
  );
}

function DraftRow({ draft }: { draft: Draft }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDraft(draft.id);
      if (result?.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.refresh();
      }
    });
  }

  const statusColors: Record<string, string> = {
    proposed: "text-yellow-400",
    confirmed: "text-blue-400",
    active: "text-green-400",
    deck_building: "text-purple-400",
    complete: "text-foreground/40",
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium inline-flex items-center gap-1.5">
              {draft.setCode && (
                <i className={`ss ss-${draft.setCode.toLowerCase()} text-foreground`} />
              )}
              {draft.setName ?? draft.format}
            </span>
            <span
              className={`text-xs ${statusColors[draft.status] ?? "text-foreground/40"}`}
            >
              {draft.status.replace("_", " ")}
            </span>
            {draft.isSimulated && (
              <span className="text-[10px] uppercase tracking-wide text-foreground/30">
                Sim
              </span>
            )}
          </div>
          <div className="text-xs text-foreground/40">
            Host: {draft.hostName} · {new Date(draft.createdAt).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={() => setConfirming(!confirming)}
          className="shrink-0 rounded-lg border border-red-800/30 px-2 py-1 text-xs text-red-400 hover:border-red-700 hover:text-red-300 transition-colors"
        >
          Delete
        </button>
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      {confirming && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">Delete this draft?</span>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="rounded-lg bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {pending ? "..." : "Confirm"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-foreground/40 hover:text-foreground/60"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
