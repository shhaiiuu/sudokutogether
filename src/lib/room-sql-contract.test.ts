import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Unit contract tests only: these inspect the forward migration source.
// They are not a substitute for applying the migration and running DB integration tests.
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261026225200_sudoku_together_hardening.sql"),
  "utf8",
);

const privilegedFunctions = [
  "join_room_atomic(text, uuid, text)",
  "create_proposal_atomic(uuid, uuid, integer, integer)",
  "sync_room_proposals(uuid)",
  "record_vote_and_resolve(uuid, uuid, uuid, public.vote_choice)",
  "start_game_atomic(uuid, uuid, integer[], integer[])",
];

describe("forward migration unit contracts (not database integration)", () => {
  it("revokes default execution and grants each privileged function only to service_role", () => {
    for (const signature of privilegedFunctions) {
      expect(migration).toContain(
        `revoke execute on function public.${signature} from public, anon, authenticated;`,
      );
      expect(migration).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(migration).not.toMatch(
      /grant execute on function public\.[^;]+ to (public|anon|authenticated);/,
    );
  });

  it("encodes the five-minute active deadline and expired-grace check before resume", () => {
    expect(migration).toContain("now() + interval '5 minutes'");
    const expired = migration.indexOf("now() >= v_proposal.disconnect_deadline_at");
    const resume = migration.indexOf("v_online_count = v_required_count");
    expect(expired).toBeGreaterThan(-1);
    expect(resume).toBeGreaterThan(expired);
  });

  it("blocks both waiting and paused proposals and stores correctness separately", () => {
    expect(migration).toContain("status in ('waiting', 'paused')");
    expect(migration).toContain("add column if not exists is_correct boolean");
    expect(migration).toContain(
      "move_history(room_id, proposal_id, revision, cell_index, value, is_correct)",
    );
  });

  it("contains locked transactional startup and revision-guarded move application", () => {
    expect(migration).toContain("create or replace function public.start_game_atomic");
    expect(migration).toContain("from public.rooms where id = p_room_id for update");
    expect(migration).toContain("from public.game_states where room_id = p_room_id for update");
    expect(migration).toContain(
      "where room_id = p_room_id and revision = v_proposal.board_revision",
    );
  });
});
