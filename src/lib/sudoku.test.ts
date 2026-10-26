import { describe, expect, it } from "vitest";
import { ALL_LEVELS, conflicts, generatePuzzle, isValidSolution } from "./sudoku";

describe("sudoku", () => {
  it("generates an Easy puzzle with 40 clues that matches its solution", () => {
    const { puzzle, solution } = generatePuzzle("Easy");
    expect(puzzle.filter(Boolean).length).toBe(40);
    puzzle.forEach((v, i) => v && expect(v).toBe(solution[i]));
    expect(conflicts(solution).size).toBe(0);
  });

  it.each([
    ["Easy", 40],
    ["Medium", 33],
    ["Hard", 28],
    ["Expert", 24],
    ["Master", 21],
    ["Extreme", 17],
  ] as const)("supports the %s difficulty with a genuine puzzle profile", (difficulty, clues) => {
    expect(ALL_LEVELS.find((level) => level.level === difficulty)?.available).toBe(true);
    const { puzzle, solution } = generatePuzzle(difficulty);
    expect(puzzle.filter(Boolean).length).toBe(clues);
    expect(isValidSolution(solution)).toBe(true);
    puzzle.forEach((v, i) => v && expect(v).toBe(solution[i]));
  });
  it("flags duplicate numbers in a row as conflicts", () => {
    const g = Array(81).fill(0);
    g[0] = 5;
    g[8] = 5;
    expect([...conflicts(g)].sort()).toEqual([0, 8]);
  });
});
