-- Migration: 20261028003000_replica_identity_and_rooms_updated_at.sql
-- Ensure room_members and rooms have full replica identity so CDC DELETE events carry room_id
-- Add updated_at to rooms so membership and room state changes can reliably trigger room CDC

alter table public.rooms
  add column if not exists updated_at timestamptz not null default now();

alter table public.room_members replica identity full;
alter table public.rooms replica identity full;

-- Update join_room_atomic to update rooms.updated_at
create or replace function public.join_room_atomic(
  p_code text,
  p_user_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_existing public.room_members%rowtype;
  v_count integer;
  v_color text;
begin
  select * into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then raise exception 'Room not found.' using errcode = 'P0001'; end if;

  select * into v_existing
  from public.room_members
  where room_id = v_room.id and user_id = p_user_id
  for update;

  if found then
    update public.room_members
    set name = left(regexp_replace(trim(p_name), '[^[:alnum:] _-]', '', 'g'), 32),
        online = true,
        last_seen_at = now()
    where room_id = v_room.id and user_id = p_user_id;

    update public.rooms
    set updated_at = now()
    where id = v_room.id;

    return v_room.id;
  end if;

  if v_room.status <> 'waiting' then raise exception 'This room has already started.' using errcode = 'P0001'; end if;

  select count(*) into v_count from public.room_members where room_id = v_room.id;
  if v_count >= 4 then raise exception 'Room full (4/4).' using errcode = 'P0001'; end if;

  select candidate into v_color
  from unnest(array['p1','p2','p3','p4']) as candidate
  where candidate not in (select color from public.room_members where room_id = v_room.id)
  limit 1;

  insert into public.room_members(room_id, user_id, name, color, online, last_seen_at)
  values (
    v_room.id,
    p_user_id,
    coalesce(nullif(left(regexp_replace(trim(p_name), '[^[:alnum:] _-]', '', 'g'), 32), ''), 'Player'),
    v_color,
    true,
    now()
  );

  update public.rooms
  set updated_at = now()
  where id = v_room.id;

  return v_room.id;
end;
$$;

revoke execute on function public.join_room_atomic(text, uuid, text) from public, anon, authenticated;
grant execute on function public.join_room_atomic(text, uuid, text) to service_role;

-- Update start_game_atomic to update rooms.updated_at
create or replace function public.start_game_atomic(
  p_room_id uuid,
  p_host_id uuid,
  p_puzzle integer[],
  p_solution integer[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_count integer;
  v_ready_count integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found.' using errcode = 'P0001'; end if;
  if v_room.host_id <> p_host_id then raise exception 'Only the host can start the game.' using errcode = 'P0001'; end if;
  if v_room.status <> 'waiting' then raise exception 'This room has already started.' using errcode = 'P0001'; end if;

  select count(*), count(*) filter (where ready and online and last_seen_at >= now() - interval '90 seconds')
  into v_count, v_ready_count
  from public.room_members
  where room_id = p_room_id;

  if v_count < 2 or v_ready_count < v_count then
    raise exception 'Waiting for everyone to be ready.' using errcode = 'P0001';
  end if;

  insert into public.game_states(room_id, puzzle, solution, grid, difficulty, started_at)
  values (p_room_id, p_puzzle, p_solution, p_puzzle, v_room.difficulty, now())
  on conflict (room_id) do update
  set puzzle = excluded.puzzle,
      solution = excluded.solution,
      grid = excluded.grid,
      difficulty = excluded.difficulty,
      started_at = now(),
      revision = 0,
      mistakes = 0,
      score = 0;

  update public.rooms
  set status = 'playing',
      updated_at = now()
  where id = p_room_id;
end;
$$;

revoke execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) from public, anon, authenticated;
grant execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) to service_role;
