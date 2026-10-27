-- Migration: 20261027223000_proposer_auto_yes_vote.sql
-- Ensure the proposal creator automatically and authoritatively votes Yes upon proposing.

create or replace function public.create_proposal_atomic(
  p_room_id uuid,
  p_proposer_id uuid,
  p_cell_index integer,
  p_value integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_game public.game_states%rowtype;
  v_eligible uuid[];
  v_id uuid;
begin
  if p_cell_index < 0 or p_cell_index > 80 or p_value < 1 or p_value > 9 then
    raise exception 'Invalid move.' using errcode = 'P0001';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception 'The room is not playing.' using errcode = 'P0001'; end if;

  if exists (
    select 1 from public.proposals
    where room_id = p_room_id and status in ('waiting', 'paused')
  ) then
    raise exception 'Another move is already waiting for votes.' using errcode = 'P0001';
  end if;

  select * into v_game from public.game_states where room_id = p_room_id for update;
  if v_game.puzzle[p_cell_index + 1] <> 0 or v_game.grid[p_cell_index + 1] <> 0 then
    raise exception 'That cell is already filled.' using errcode = 'P0001';
  end if;

  -- Refresh active proposer presence so they are never rejected as stale
  update public.room_members
  set online = true, last_seen_at = now()
  where room_id = p_room_id and user_id = p_proposer_id;

  select coalesce(array_agg(user_id order by joined_at), '{}'::uuid[]) into v_eligible
  from public.room_members
  where room_id = p_room_id
    and online
    and last_seen_at >= now() - interval '60 seconds';
  if not (p_proposer_id = any(v_eligible)) then raise exception 'Your presence is stale; retry the move.' using errcode = 'P0001'; end if;

  insert into public.proposals(
    room_id,
    cell_index,
    value,
    proposer_id,
    eligible_voter_ids,
    board_revision,
    active_deadline_at
  )
  values (
    p_room_id,
    p_cell_index,
    p_value,
    p_proposer_id,
    v_eligible,
    v_game.revision,
    now() + interval '5 minutes'
  )
  returning id into v_id;

  -- Automatically and authoritatively record the proposer's Yes vote
  insert into public.proposal_votes(room_id, proposal_id, voter_id, vote)
  values (p_room_id, v_id, p_proposer_id, 'yes')
  on conflict (proposal_id, voter_id) do update set vote = 'yes';

  return v_id;
end;
$$;

revoke execute on function public.create_proposal_atomic(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.create_proposal_atomic(uuid, uuid, integer, integer) to service_role;
