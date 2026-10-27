import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Unit contract tests inspecting the forward migration that automatically records the proposer's Yes vote
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027223000_proposer_auto_yes_vote.sql"),
  "utf8",
);

describe("proposer auto yes vote migration contract", () => {
  it("updates create_proposal_atomic to insert proposer Yes vote into proposal_votes", () => {
    expect(migration).toContain("create or replace function public.create_proposal_atomic");
    expect(migration).toContain(
      "insert into public.proposal_votes(room_id, proposal_id, voter_id, vote)",
    );
    expect(migration).toContain("values (p_room_id, v_id, p_proposer_id, 'yes')");
    expect(migration).toContain("on conflict (proposal_id, voter_id) do update set vote = 'yes';");
  });

  it("secures create_proposal_atomic function execution permissions", () => {
    expect(migration).toContain(
      "revoke execute on function public.create_proposal_atomic(uuid, uuid, integer, integer) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.create_proposal_atomic(uuid, uuid, integer, integer) to service_role;",
    );
  });
});
