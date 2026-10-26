import { describe, expect, it } from "vitest";
import { normalizePlayerName, playerNameError } from "./room-client";

describe("player-name validation", () => {
  it("rejects an empty name", () => {
    expect(playerNameError("")).toBe("Enter your name before continuing.");
    expect(() => normalizePlayerName("")).toThrow("Enter your name before continuing.");
  });

  it("rejects a whitespace-only name", () => {
    expect(playerNameError("   \t ")).toBe("Enter your name before continuing.");
  });

  it("trims and accepts a valid name", () => {
    expect(playerNameError("  Ada Lovelace  ")).toBeNull();
    expect(normalizePlayerName("  Ada Lovelace  ")).toBe("Ada Lovelace");
  });

  it("rejects names longer than 32 characters", () => {
    const tooLong = "a".repeat(33);
    expect(playerNameError(tooLong)).toBe("Name must be 32 characters or fewer.");
    expect(() => normalizePlayerName(tooLong)).toThrow("Name must be 32 characters or fewer.");
  });
});
