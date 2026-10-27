-- Forward migration to ensure mistakes column exists on game_states and start_game_atomic initialises it

alter table public.game_states
  add column if not exists mistakes integer not null default 0;

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
  v_live_count integer;
  v_not_ready_count integer;
begin
  if cardinality(p_puzzle) <> 81 or cardinality(p_solution) <> 81 then
    raise exception 'Invalid generated puzzle.' using errcode = 'P0001';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found.' using errcode = 'P0001'; end if;
  if v_room.host_id <> p_host_id then raise exception 'Only the host can start the game.' using errcode = 'P0001'; end if;
  if v_room.status <> 'waiting' then raise exception 'This room has already started.' using errcode = 'P0001'; end if;

  select count(*) filter (where online and last_seen_at >= now() - interval '60 seconds'),
         count(*) filter (where not ready or not online or last_seen_at < now() - interval '60 seconds')
  into v_live_count, v_not_ready_count
  from public.room_members
  where room_id = p_room_id;
  if v_live_count < 2 or v_live_count > 4 or v_not_ready_count > 0 then
    raise exception 'Waiting for everyone to be ready.' using errcode = 'P0001';
  end if;

  insert into public.game_states(room_id, puzzle, solution, grid, notes, elapsed, score, revision, mistakes, started_at, completed_at)
  values (p_room_id, p_puzzle, p_solution, p_puzzle, '[]'::jsonb, 0, 0, 0, 0, now(), null);
  update public.rooms set status = 'playing' where id = p_room_id and status = 'waiting';
end;
$$;

revoke execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) from public, anon, authenticated;
grant execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) to service_role;
