import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Unit contract tests inspecting the forward migration fixing vote difficulty and presence interval
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027233000_fix_vote_difficulty_and_presence.sql"),
  "utf8",
);

describe("fix vote difficulty and presence migration contract", () => {
  it("uses v_game.difficulty instead of non-existent v_proposal.difficulty in record_vote_and_resolve", () => {
    expect(migration).toContain("create or replace function public.record_vote_and_resolve");
    expect(migration).toContain("score = score + case v_game.difficulty");
    expect(migration).not.toContain("v_proposal.difficulty");
  });

  it("adds on conflict clause for idempotent proposal vote recording", () => {
    expect(migration).toContain(
      "on conflict (proposal_id, voter_id) do update set vote = excluded.vote;",
    );
  });

  it("uses 90 second interval for presence freshness across all functions", () => {
    expect(migration).toContain("last_seen_at >= now() - interval '90 seconds'");
    expect(migration).toContain("disconnect_deadline_at = now() + interval '90 seconds'");
  });

  it("secures function permissions for service_role", () => {
    expect(migration).toContain(
      "revoke execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice) to service_role;",
    );
  });
});
