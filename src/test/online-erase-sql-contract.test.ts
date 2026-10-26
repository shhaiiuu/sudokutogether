import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Unit contract tests only: these inspect migration source and do not verify a live database.
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027021500_online_erase_realtime.sql"),
  "utf8",
);

describe("online erase migration contract (not database integration)", () => {
  it("defines a locked server-authoritative erase function with clue/correctness guards", () => {
    expect(migration).toContain("create or replace function public.erase_room_cell_atomic");
    expect(migration).toContain("from public.game_states");
    expect(migration).toContain("for update");
    expect(migration).toContain("Original clues cannot be erased.");
    expect(migration).toContain("Correct entries cannot be erased.");
    expect(migration).toContain("revision = v_game.revision");
    expect(migration).toContain(
      "add column if not exists state_revision bigint not null default 0",
    );
    expect(migration).toContain("set state_revision = state_revision + 1");
  });

  it("restricts execution and publishes game-state changes for room refreshes", () => {
    expect(migration).toContain(
      "revoke execute on function public.erase_room_cell_atomic(uuid, uuid, integer) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.erase_room_cell_atomic(uuid, uuid, integer) to service_role;",
    );
    expect(migration).toContain("tablename = 'game_states'");
  });
});
