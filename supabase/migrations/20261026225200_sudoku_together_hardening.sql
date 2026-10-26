-- Forward-only hardening for the already-applied Sudoku Together migrations.
-- Apply after 20261026224300_sudoku_together_transactions.sql.

alter table public.proposals
  add column if not exists is_correct boolean;

alter table public.move_history
  add column if not exists is_correct boolean not null default false;

-- Existing waiting/paused proposals move to the five-minute active deadline.
update public.proposals
set active_deadline_at = created_at + interval '5 minutes'
where status in ('waiting', 'paused');

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
  return v_room.id;
end;
$$;

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
  return v_id;
end;
$$;

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
      and last_seen_at >= now() - interval '60 seconds';

    if v_proposal.status = 'waiting' and v_online_count < v_required_count then
      update public.proposals
      set status = 'paused', paused_at = now(), disconnect_deadline_at = now() + interval '60 seconds'
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

  select online and last_seen_at >= now() - interval '60 seconds' into v_member_online
  from public.room_members
  where room_id = p_room_id and user_id = p_voter_id;
  if coalesce(v_member_online, false) = false then raise exception 'Your presence is stale; reconnect before voting.' using errcode = 'P0001'; end if;

  insert into public.proposal_votes(proposal_id, voter_id, vote)
  values (p_proposal_id, p_voter_id, p_vote);

  select count(*) into v_required_count from unnest(v_proposal.eligible_voter_ids);
  select count(*) into v_online_count
  from public.room_members
  where room_id = p_room_id
    and user_id = any(v_proposal.eligible_voter_ids)
    and online
    and last_seen_at >= now() - interval '60 seconds';
  if v_online_count < v_required_count then
    update public.proposals
    set status = 'paused', paused_at = now(), disconnect_deadline_at = now() + interval '60 seconds'
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

  v_is_correct := v_game.solution[v_proposal.cell_index + 1] = v_proposal.value;
  v_game.grid[v_proposal.cell_index + 1] := v_proposal.value;
  v_new_revision := v_game.revision + 1;

  update public.game_states
  set grid = v_game.grid,
      revision = v_new_revision,
      score = score + case when v_is_correct then
        case (select difficulty from public.rooms where id = p_room_id)
          when 'Easy' then 60 when 'Medium' then 100 when 'Hard' then 160 when 'Expert' then 250 when 'Master' then 360 else 500
        end
      else 0 end,
      completed_at = case when v_game.grid = v_game.solution then now() else completed_at end
  where room_id = p_room_id and revision = v_proposal.board_revision;

  insert into public.move_history(room_id, proposal_id, revision, cell_index, value, is_correct)
  values (p_room_id, p_proposal_id, v_new_revision, v_proposal.cell_index, v_proposal.value, v_is_correct);

  update public.proposals
  set status = 'approved', is_correct = v_is_correct, resolved_at = now()
  where id = p_proposal_id and status = 'waiting';

  if v_game.grid = v_game.solution then
    update public.rooms set status = 'completed' where id = p_room_id and status = 'playing';
  end if;
  return 'approved';
end;
$$;

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

  insert into public.game_states(room_id, puzzle, solution, grid, notes, elapsed, score, revision, started_at, completed_at)
  values (p_room_id, p_puzzle, p_solution, p_puzzle, '[]'::jsonb, 0, 0, 0, now(), null);
  update public.rooms set status = 'playing' where id = p_room_id and status = 'waiting';
end;
$$;

-- SECURITY DEFINER functions must never inherit default PUBLIC execution.
revoke execute on function public.join_room_atomic(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.create_proposal_atomic(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.sync_room_proposals(uuid) from public, anon, authenticated;
revoke execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) from public, anon, authenticated;
revoke execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) from public, anon, authenticated;

grant execute on function public.join_room_atomic(text, uuid, text) to service_role;
grant execute on function public.create_proposal_atomic(uuid, uuid, integer, integer) to service_role;
grant execute on function public.sync_room_proposals(uuid) to service_role;
grant execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) to service_role;
grant execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) to service_role;
