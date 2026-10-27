-- Migration: 20261027233000_fix_vote_difficulty_and_presence.sql
-- Fix: v_proposal has no field difficulty -> use v_game.difficulty
-- Fix: add on conflict to proposal_votes insert in record_vote_and_resolve
-- Fix: increase presence expiration interval to 90 seconds to avoid mobile timer throttle disconnects

create or replace function public.record_vote_and_resolve(
  p_room_id uuid,
  p_proposal_id uuid,
  p_voter_id uuid,
  p_vote public.vote_choice
)
returns public.proposal_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_game public.game_states%rowtype;
  v_required_count integer;
  v_online_count integer;
  v_yes_count integer;
  v_no_count integer;
  v_new_revision bigint;
  v_is_correct boolean;
  v_member_online boolean;
begin
  perform public.sync_room_proposals(p_room_id);

  select * into v_proposal
  from public.proposals
  where id = p_proposal_id and room_id = p_room_id
  for update;
  if not found then raise exception 'Proposal not found.' using errcode = 'P0001'; end if;
  if v_proposal.status = 'paused' then raise exception 'Voting is paused until every eligible player reconnects.' using errcode = 'P0001'; end if;
  if v_proposal.status <> 'waiting' then return v_proposal.status; end if;
  if not (p_voter_id = any(v_proposal.eligible_voter_ids)) then raise exception 'You are not eligible to vote on this proposal.' using errcode = 'P0001'; end if;

  -- Refresh active voter presence so they are never rejected as stale
  update public.room_members
  set online = true, last_seen_at = now()
  where room_id = p_room_id and user_id = p_voter_id;

  select online and last_seen_at >= now() - interval '90 seconds' into v_member_online
  from public.room_members
  where room_id = p_room_id and user_id = p_voter_id;
  if coalesce(v_member_online, false) = false then raise exception 'Your presence is stale; reconnect before voting.' using errcode = 'P0001'; end if;

  insert into public.proposal_votes(room_id, proposal_id, voter_id, vote)
  values (p_room_id, p_proposal_id, p_voter_id, p_vote)
  on conflict (proposal_id, voter_id) do update set vote = excluded.vote;

  select count(*) into v_required_count from unnest(v_proposal.eligible_voter_ids);
  select count(*) into v_online_count
  from public.room_members
  where room_id = p_room_id
    and user_id = any(v_proposal.eligible_voter_ids)
    and online
    and last_seen_at >= now() - interval '90 seconds';
  if v_online_count < v_required_count then
    update public.proposals
    set status = 'paused', paused_at = now(), disconnect_deadline_at = now() + interval '90 seconds'
    where id = p_proposal_id and status = 'waiting';
    return 'paused';
  end if;

  select count(*) into v_no_count from public.proposal_votes where proposal_id = p_proposal_id and vote = 'no';
  if v_no_count > 0 then
    update public.proposals set status = 'rejected', resolved_at = now() where id = p_proposal_id and status = 'waiting';
    return 'rejected';
  end if;

  select count(*) into v_yes_count from public.proposal_votes where proposal_id = p_proposal_id and vote = 'yes';
  if v_yes_count < v_required_count then return 'waiting'; end if;

  select * into v_game from public.game_states where room_id = p_room_id for update;
  if v_game.revision <> v_proposal.board_revision
     or v_game.puzzle[v_proposal.cell_index + 1] <> 0
     or v_game.grid[v_proposal.cell_index + 1] <> 0 then
    update public.proposals set status = 'rejected', resolved_at = now() where id = p_proposal_id and status = 'waiting';
    return 'rejected';
  end if;

  v_is_correct := (v_game.solution[v_proposal.cell_index + 1] = v_proposal.value);
  v_new_revision := v_game.revision + 1;

  if v_is_correct then
    update public.game_states
    set grid[v_proposal.cell_index + 1] = v_proposal.value,
        revision = v_new_revision,
        score = score + case v_game.difficulty
          when 'Easy' then 100
          when 'Medium' then 200
          when 'Hard' then 300
          when 'Expert' then 400
          when 'Master' then 500
          when 'Extreme' then 600
          else 100
        end
    where room_id = p_room_id and revision = v_proposal.board_revision;
  else
    update public.game_states
    set grid[v_proposal.cell_index + 1] = v_proposal.value,
        revision = v_new_revision,
        mistakes = mistakes + 1
    where room_id = p_room_id and revision = v_proposal.board_revision;
  end if;

  insert into public.move_history(room_id, proposal_id, revision, cell_index, value, is_correct)
  values (p_room_id, p_proposal_id, v_new_revision, v_proposal.cell_index, v_proposal.value, v_is_correct);

  update public.proposals
  set status = 'approved',
      resolved_at = now()
  where id = p_proposal_id and status = 'waiting';

  delete from public.room_notes
  where room_id = p_room_id and cell_index = v_proposal.cell_index;

  if not exists (
    select 1
    from unnest((select grid from public.game_states where room_id = p_room_id)) as g(v),
         unnest((select solution from public.game_states where room_id = p_room_id)) as s(v)
    where g.v <> s.v
  ) then
    update public.rooms
    set status = 'completed',
        completed_at = now()
    where id = p_room_id;
  end if;

  return 'approved';
end;
$$;

revoke execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) from public, anon, authenticated;
grant execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) to service_role;

create or replace function public.sync_room_proposals(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.proposals%rowtype;
  v_online_count integer;
  v_required_count integer;
begin
  for v_proposal in
    select * from public.proposals
    where room_id = p_room_id and status in ('waiting', 'paused')
    for update
  loop
    select count(*) into v_required_count from unnest(v_proposal.eligible_voter_ids);
    select count(*) into v_online_count
    from public.room_members
    where room_id = p_room_id
      and user_id = any(v_proposal.eligible_voter_ids)
      and online
      and last_seen_at >= now() - interval '90 seconds';

    if v_proposal.status = 'waiting' and v_online_count < v_required_count then
      update public.proposals
      set status = 'paused', paused_at = now(), disconnect_deadline_at = now() + interval '90 seconds'
      where id = v_proposal.id and status = 'waiting';
    elsif v_proposal.status = 'paused' and now() >= v_proposal.disconnect_deadline_at then
      update public.proposals
      set status = 'cancelled', resolved_at = now()
      where id = v_proposal.id and status = 'paused';
    elsif v_proposal.status = 'paused' and v_online_count = v_required_count then
      update public.proposals
      set status = 'waiting',
          active_deadline_at = active_deadline_at + greatest(now() - paused_at, interval '0 seconds'),
          paused_at = null,
          disconnect_deadline_at = null
      where id = v_proposal.id and status = 'paused';
    elsif v_proposal.status = 'waiting' and now() >= v_proposal.active_deadline_at then
      update public.proposals
      set status = 'timeout', resolved_at = now()
      where id = v_proposal.id and status = 'waiting';
    end if;
  end loop;
end;
$$;

revoke execute on function public.sync_room_proposals(uuid) from public, anon, authenticated;
grant execute on function public.sync_room_proposals(uuid) to service_role;

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
    and last_seen_at >= now() - interval '90 seconds';
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
