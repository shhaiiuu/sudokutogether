-- Forward-only migration for authoritative multiplayer erasure.
-- The solution remains private; clients receive only per-cell erasability metadata.

alter table public.game_states
  add column if not exists revision bigint not null default 0;

alter table public.rooms
  add column if not exists state_revision bigint not null default 0;

create or replace function public.erase_room_cell_atomic(
  p_room_id uuid,
  p_user_id uuid,
  p_cell_index integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_game public.game_states%rowtype;
  v_grid integer[];
begin
  if p_cell_index < 0 or p_cell_index > 80 then
    raise exception 'Invalid cell.' using errcode = 'P0001';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id
  for update;
  if not found or v_room.status <> 'playing' then
    raise exception 'The room is not playing.' using errcode = 'P0001';
  end if;

  select * into v_member
  from public.room_members
  where room_id = p_room_id and user_id = p_user_id
  for update;
  if not found or not v_member.online or v_member.last_seen_at < now() - interval '60 seconds' then
    raise exception 'Your presence is stale; reconnect before erasing.' using errcode = 'P0001';
  end if;

  select * into v_game
  from public.game_states
  where room_id = p_room_id
  for update;

  if not found or v_game.puzzle[p_cell_index + 1] <> 0 then
    raise exception 'Original clues cannot be erased.' using errcode = 'P0001';
  end if;

  if v_game.grid[p_cell_index + 1] = 0 then
    delete from public.room_notes
    where room_id = p_room_id and cell_index = p_cell_index;
    return;
  end if;

  if v_game.grid[p_cell_index + 1] = v_game.solution[p_cell_index + 1] then
    raise exception 'Correct entries cannot be erased.' using errcode = 'P0001';
  end if;

  v_grid := v_game.grid;
  v_grid[p_cell_index + 1] := 0;
  update public.game_states
  set grid = v_grid,
      revision = revision + 1
  where room_id = p_room_id and revision = v_game.revision;

  update public.rooms
  set state_revision = state_revision + 1
  where id = p_room_id;

  delete from public.room_notes
  where room_id = p_room_id and cell_index = p_cell_index;
end;
$$;

revoke execute on function public.erase_room_cell_atomic(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.erase_room_cell_atomic(uuid, uuid, integer) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_states'
  ) then
    alter publication supabase_realtime add table public.game_states;
  end if;
end;
$$;
