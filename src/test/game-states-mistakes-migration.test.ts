import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027040000_game_states_mistakes.sql"),
  "utf8",
);

describe("game_states mistakes migration contract", () => {
  it("adds mistakes column with not null default 0 to game_states", () => {
    expect(migration).toContain("alter table public.game_states");
    expect(migration).toContain("add column if not exists mistakes integer not null default 0;");
  });

  it("updates start_game_atomic to explicitly initialise mistakes to 0 and secures permissions", () => {
    expect(migration).toContain("create or replace function public.start_game_atomic");
    expect(migration).toContain("mistakes");
    expect(migration).toContain(
      "revoke execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.start_game_atomic(uuid, uuid, integer[], integer[]) to service_role;",
    );
  });
});
