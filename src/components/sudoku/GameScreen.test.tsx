import { describe, expect, it } from "vitest";
import { canEraseCell } from "./GameScreen";

describe("Erase eligibility", () => {
  const givens = Array(81).fill(false);
  const grid = Array(81).fill(0);
  const solution = Array(81).fill(1);

  it("allows erasing a note-only cell", () => {
    expect(
      canEraseCell(0, givens, grid, solution, [[3], ...Array.from({ length: 80 }, () => [])]),
    ).toBe(true);
  });

  it("preserves erase behavior for an incorrect entered digit", () => {
    const entered = [...grid];
    entered[0] = 2;
    expect(
      canEraseCell(
        0,
        givens,
        entered,
        solution,
        Array.from({ length: 81 }, () => []),
      ),
    ).toBe(true);
  });

  it("protects correct entered digits and original clues", () => {
    const correct = [...grid];
    correct[0] = 1;
    expect(
      canEraseCell(
        0,
        givens,
        correct,
        solution,
        Array.from({ length: 81 }, () => []),
      ),
    ).toBe(false);

    const clueGivens = [...givens];
    clueGivens[0] = true;
    const clue = [...grid];
    clue[0] = 1;
    expect(
      canEraseCell(0, clueGivens, clue, solution, [[3], ...Array.from({ length: 80 }, () => [])]),
    ).toBe(false);
  });

  it("allows only note-only erasure for multiplayer cells", () => {
    const committed = [...grid];
    committed[0] = 4;
    expect(
      canEraseCell(
        0,
        givens,
        committed,
        Array(81).fill(0),
        Array.from({ length: 81 }, () => []),
        true,
      ),
    ).toBe(false);
    expect(
      canEraseCell(
        0,
        givens,
        grid,
        Array(81).fill(0),
        [[3], ...Array.from({ length: 80 }, () => [])],
        true,
      ),
    ).toBe(true);
  });

  it("uses authoritative erasability for incorrect online entries", () => {
    const incorrect = [...grid];
    incorrect[0] = 4;
    const erasable = Array(81).fill(false);
    erasable[0] = true;
    expect(canEraseCell(0, givens, incorrect, Array(81).fill(0), [], true, erasable)).toBe(true);
    erasable[0] = false;
    expect(canEraseCell(0, givens, incorrect, Array(81).fill(0), [], true, erasable)).toBe(false);
  });
});
