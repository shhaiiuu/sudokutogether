create extension if not exists pgcrypto;

create type public.room_status as enum ('waiting', 'playing', 'completed');
create type public.proposal_status as enum ('waiting', 'approved', 'rejected', 'timeout', 'cancelled');
create type public.vote_choice as enum ('yes', 'no');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_id uuid not null,
  difficulty text not null default 'Medium' check (difficulty in ('Easy','Medium','Hard','Expert','Master','Extreme')),
  status public.room_status not null default 'waiting',
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 32),
  color text not null check (color in ('p1','p2','p3','p4')),
  ready boolean not null default false,
  online boolean not null default true,
  last_seen_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, color)
);

create table public.game_states (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  puzzle integer[] not null check (cardinality(puzzle) = 81),
  solution integer[] not null check (cardinality(solution) = 81),
  grid integer[] not null check (cardinality(grid) = 81),
  notes jsonb not null default '[]'::jsonb,
  elapsed integer not null default 0 check (elapsed >= 0),
  score integer not null default 0 check (score >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  cell_index integer not null check (cell_index between 0 and 80),
  value integer not null check (value between 1 and 9),
  proposer_id uuid not null,
  eligible_voter_ids uuid[] not null,
  status public.proposal_status not null default 'waiting',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index proposals_one_waiting_per_room on public.proposals(room_id) where status = 'waiting';

create table public.proposal_votes (
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  voter_id uuid not null,
  vote public.vote_choice not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, voter_id)
);

create table public.room_notes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  cell_index integer not null check (cell_index between 0 and 80),
  values integer[] not null default '{}',
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, cell_index)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);

create index room_members_user_idx on public.room_members(user_id);
create index proposals_room_status_idx on public.proposals(room_id, status);
create index chat_messages_room_created_idx on public.chat_messages(room_id, created_at);

create or replace function public.is_room_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room and user_id = auth.uid()
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.game_states enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_votes enable row level security;
alter table public.room_notes enable row level security;
alter table public.chat_messages enable row level security;

create policy rooms_member_read on public.rooms for select to authenticated using (public.is_room_member(id));
create policy room_members_member_read on public.room_members for select to authenticated using (public.is_room_member(room_id));
create policy proposals_member_read on public.proposals for select to authenticated using (public.is_room_member(room_id));
create policy proposal_votes_member_read on public.proposal_votes for select to authenticated using (
  exists (select 1 from public.proposals p where p.id = proposal_id and public.is_room_member(p.room_id))
);
create policy notes_member_read on public.room_notes for select to authenticated using (public.is_room_member(room_id));
create policy chat_member_read on public.chat_messages for select to authenticated using (public.is_room_member(room_id));

-- The private solution and all mutations are available only to the trusted Edge Function.
revoke all on public.game_states from anon, authenticated;
revoke insert, update, delete on public.rooms, public.room_members, public.proposals, public.proposal_votes, public.room_notes, public.chat_messages from anon, authenticated;
grant select on public.rooms, public.room_members, public.proposals, public.proposal_votes, public.room_notes, public.chat_messages to authenticated;
grant all on all tables in schema public to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members') then
    alter publication supabase_realtime add table public.room_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proposals') then
    alter publication supabase_realtime add table public.proposals;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proposal_votes') then
    alter publication supabase_realtime add table public.proposal_votes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_notes') then
    alter publication supabase_realtime add table public.room_notes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
