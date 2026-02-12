-- ============================================================================
-- podman Initial Schema
-- ============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. profiles
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  is_site_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email, 'Anonymous')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- ============================================================================
-- 2. invites
-- ============================================================================

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  created_by uuid not null references public.profiles(id),
  claimed_by uuid references public.profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_invites_code on public.invites(code);

-- ============================================================================
-- 3. groups
-- ============================================================================

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  invite_code text unique not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_groups_invite_code on public.groups(invite_code);

create trigger groups_updated_at
  before update on public.groups
  for each row execute function public.update_updated_at();

-- ============================================================================
-- 4. group_members
-- ============================================================================

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index idx_group_members_user_id on public.group_members(user_id);

-- ============================================================================
-- 5. draft_proposals
-- ============================================================================

create table public.draft_proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id),
  title text not null,
  format text not null check (format in ('standard', 'winston', 'cube')),
  set_code text,
  set_name text,
  cube_id text,
  player_count int not null check (player_count between 2 and 8),
  scheduled_at timestamptz,
  status text not null default 'open' check (status in ('open', 'confirmed', 'cancelled', 'drafted')),
  config jsonb,
  created_at timestamptz not null default now()
);

create index idx_draft_proposals_group_status on public.draft_proposals(group_id, status);

-- ============================================================================
-- 6. proposal_votes
-- ============================================================================

create table public.proposal_votes (
  proposal_id uuid not null references public.draft_proposals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('in', 'out', 'maybe')),
  voted_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

-- ============================================================================
-- 7. drafts
-- ============================================================================

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.draft_proposals(id),
  group_id uuid not null references public.groups(id) on delete cascade,
  host_id uuid not null references public.profiles(id),
  format text not null check (format in ('standard', 'winston', 'cube')),
  set_code text,
  set_name text,
  status text not null default 'lobby' check (status in ('lobby', 'active', 'deck_building', 'complete')),
  config jsonb not null default '{}',
  state jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index idx_drafts_group_status on public.drafts(group_id, status);
create index idx_drafts_status on public.drafts(status);

-- ============================================================================
-- 8. draft_players
-- ============================================================================

create table public.draft_players (
  draft_id uuid not null references public.drafts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat_position int,
  joined_at timestamptz not null default now(),
  primary key (draft_id, user_id)
);

create index idx_draft_players_user_id on public.draft_players(user_id);

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.draft_proposals enable row level security;
alter table public.proposal_votes enable row level security;
alter table public.drafts enable row level security;
alter table public.draft_players enable row level security;

-- profiles: anyone authenticated can read; update own only
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update" on public.profiles
  for update to authenticated using (id = auth.uid());

-- invites: site admins create; authenticated users can read their own or unclaimed
create policy "invites_select" on public.invites
  for select to authenticated using (
    created_by = auth.uid()
    or claimed_by = auth.uid()
    or claimed_by is null
  );

create policy "invites_insert" on public.invites
  for insert to authenticated with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_site_admin = true)
  );

create policy "invites_update" on public.invites
  for update to authenticated using (
    -- can claim an unclaimed invite
    claimed_by is null
  );

-- groups: members can read
create policy "groups_select" on public.groups
  for select to authenticated using (
    exists (select 1 from public.group_members where group_id = id and user_id = auth.uid())
  );

-- groups: authenticated users can create
create policy "groups_insert" on public.groups
  for insert to authenticated with check (created_by = auth.uid());

-- groups: group admins can update
create policy "groups_update" on public.groups
  for update to authenticated using (
    exists (select 1 from public.group_members where group_id = id and user_id = auth.uid() and role = 'admin')
  );

-- group_members: members can read their group's roster
create policy "group_members_select" on public.group_members
  for select to authenticated using (
    exists (select 1 from public.group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid())
  );

-- group_members: admins can insert/delete members
create policy "group_members_insert" on public.group_members
  for insert to authenticated with check (
    -- joining yourself (via invite code flow) or admin adding someone
    user_id = auth.uid()
    or exists (select 1 from public.group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.role = 'admin')
  );

create policy "group_members_delete" on public.group_members
  for delete to authenticated using (
    -- leave yourself or admin removing someone
    user_id = auth.uid()
    or exists (select 1 from public.group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid() and gm.role = 'admin')
  );

-- draft_proposals: group members can read and create
create policy "draft_proposals_select" on public.draft_proposals
  for select to authenticated using (
    exists (select 1 from public.group_members where group_id = draft_proposals.group_id and user_id = auth.uid())
  );

create policy "draft_proposals_insert" on public.draft_proposals
  for insert to authenticated with check (
    exists (select 1 from public.group_members where group_id = draft_proposals.group_id and user_id = auth.uid())
    and proposed_by = auth.uid()
  );

create policy "draft_proposals_update" on public.draft_proposals
  for update to authenticated using (
    proposed_by = auth.uid()
    or exists (select 1 from public.group_members where group_id = draft_proposals.group_id and user_id = auth.uid() and role = 'admin')
  );

-- proposal_votes: group members can read; own votes only for insert/update
create policy "proposal_votes_select" on public.proposal_votes
  for select to authenticated using (
    exists (
      select 1 from public.draft_proposals dp
      join public.group_members gm on gm.group_id = dp.group_id
      where dp.id = proposal_votes.proposal_id and gm.user_id = auth.uid()
    )
  );

create policy "proposal_votes_insert" on public.proposal_votes
  for insert to authenticated with check (user_id = auth.uid());

create policy "proposal_votes_update" on public.proposal_votes
  for update to authenticated using (user_id = auth.uid());

-- drafts: draft players can read; host can update config
create policy "drafts_select" on public.drafts
  for select to authenticated using (
    exists (select 1 from public.draft_players where draft_id = id and user_id = auth.uid())
  );

create policy "drafts_insert" on public.drafts
  for insert to authenticated with check (host_id = auth.uid());

create policy "drafts_update" on public.drafts
  for update to authenticated using (host_id = auth.uid());

-- draft_players: participants can read; host manages roster
create policy "draft_players_select" on public.draft_players
  for select to authenticated using (
    exists (select 1 from public.draft_players dp where dp.draft_id = draft_players.draft_id and dp.user_id = auth.uid())
  );

create policy "draft_players_insert" on public.draft_players
  for insert to authenticated with check (
    -- join yourself or host adding someone
    user_id = auth.uid()
    or exists (select 1 from public.drafts where id = draft_players.draft_id and host_id = auth.uid())
  );

create policy "draft_players_delete" on public.draft_players
  for delete to authenticated using (
    -- leave yourself or host removing someone
    user_id = auth.uid()
    or exists (select 1 from public.drafts where id = draft_players.draft_id and host_id = auth.uid())
  );
