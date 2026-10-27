import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Unit contract tests inspecting the forward migration adding room_id to proposal_votes
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027030000_proposal_votes_room_id.sql"),
  "utf8",
);

describe("proposal votes room_id migration contract", () => {
  it("adds room_id column and index on proposal_votes for Realtime filtering", () => {
    expect(migration).toContain("alter table public.proposal_votes");
    expect(migration).toContain(
      "add column if not exists room_id uuid references public.rooms(id)",
    );
    expect(migration).toContain("create index if not exists idx_proposal_votes_room_id");
    expect(migration).toContain("on public.proposal_votes(room_id)");
  });

  it("backfills existing proposal_votes rows with room_id from proposals", () => {
    expect(migration).toContain("update public.proposal_votes pv");
    expect(migration).toContain("set room_id = p.room_id");
    expect(migration).toContain("from public.proposals p");
    expect(migration).toContain("where pv.proposal_id = p.id");
  });

  it("updates record_vote_and_resolve to insert room_id and secures function permissions", () => {
    expect(migration).toContain("create or replace function public.record_vote_and_resolve");
    expect(migration).toContain(
      "insert into public.proposal_votes(room_id, proposal_id, voter_id, vote)",
    );
    expect(migration).toContain("values (p_room_id, p_proposal_id, p_voter_id, p_vote)");
    expect(migration).toContain(
      "revoke execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) to service_role;",
    );
  });

  it("updates create_proposal_atomic to refresh proposer presence", () => {
    expect(migration).toContain("create or replace function public.create_proposal_atomic");
    expect(migration).toContain(
      "update public.room_members\n  set online = true, last_seen_at = now()\n  where room_id = p_room_id and user_id = p_proposer_id;",
    );
    expect(migration).toContain(
      "grant execute on function public.create_proposal_atomic(uuid, uuid, integer, integer) to service_role;",
    );
  });
});
