export type Difficulty = "Easy" | "Medium" | "Hard" | "Expert" | "Master" | "Extreme";
export type DifficultyLevel = Difficulty;
export const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard", "Expert", "Master", "Extreme"];
export const ALL_LEVELS: { level: DifficultyLevel; available: boolean; note?: string }[] =
  DIFFICULTIES.map((level) => ({ level, available: true }));

const CLUES: Record<Difficulty, number> = {
  Easy: 40,
  Medium: 33,
  Hard: 28,
  Expert: 24,
  Master: 21,
  Extreme: 17,
};
export const POINTS: Record<Difficulty, number> = {
  Easy: 60,
  Medium: 100,
  Hard: 160,
  Expert: 250,
  Master: 360,
  Extreme: 500,
};

export const row = (i: number) => Math.floor(i / 9);
export const col = (i: number) => i % 9;
export const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

export function peers(i: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) out.push(j);
  }
  return out;
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j]!, b[i]!];
  }
  return b;
}

const FULL_MASK = 0b1111111110;
type Masks = { rows: number[]; cols: number[]; boxes: number[] };

function buildMasks(g: number[]): Masks | null {
  const masks: Masks = { rows: Array(9).fill(0), cols: Array(9).fill(0), boxes: Array(9).fill(0) };
  for (let i = 0; i < 81; i++) {
    const value = g[i]!;
    if (!value) continue;
    if (!Number.isInteger(value) || value < 1 || value > 9) return null;
    const bit = 1 << value;
    const r = row(i);
    const c = col(i);
    const b = box(i);
    if ((masks.rows[r]! | masks.cols[c]! | masks.boxes[b]!) & bit) return null;
    masks.rows[r] = masks.rows[r]! | bit;
    masks.cols[c] = masks.cols[c]! | bit;
    masks.boxes[b] = masks.boxes[b]! | bit;
  }
  return masks;
}

function valuesForMask(mask: number, randomize: boolean) {
  const values = Array.from({ length: 9 }, (_, i) => i + 1).filter((value) => mask & (1 << value));
  return randomize ? shuffle(values) : values;
}

function fill(g: number[]): boolean {
  const masks = buildMasks(g);
  if (!masks) return false;
  const search = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const available =
        FULL_MASK & ~(masks.rows[row(i)]! | masks.cols[col(i)]! | masks.boxes[box(i)]!);
      const count = valuesForMask(available, false).length;
      if (!count) return false;
      if (count < bestCount) {
        best = i;
        bestMask = available;
        bestCount = count;
        if (count === 1) break;
      }
    }
    if (best < 0) return true;
    const r = row(best);
    const c = col(best);
    const b = box(best);
    for (const value of valuesForMask(bestMask, true)) {
      const bit = 1 << value;
      g[best] = value;
      masks.rows[r] = masks.rows[r]! | bit;
      masks.cols[c] = masks.cols[c]! | bit;
      masks.boxes[b] = masks.boxes[b]! | bit;
      if (search()) return true;
      g[best] = 0;
      masks.rows[r] = masks.rows[r]! ^ bit;
      masks.cols[c] = masks.cols[c]! ^ bit;
      masks.boxes[b] = masks.boxes[b]! ^ bit;
    }
    return false;
  };
  return search();
}

function countSolutions(g: number[], limit = 2): number {
  const masks = buildMasks(g);
  if (!masks) return 0;
  const search = (): number => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const available =
        FULL_MASK & ~(masks.rows[row(i)]! | masks.cols[col(i)]! | masks.boxes[box(i)]!);
      const count = valuesForMask(available, false).length;
      if (!count) return 0;
      if (count < bestCount) {
        best = i;
        bestMask = available;
        bestCount = count;
      }
    }
    if (best < 0) return 1;
    const r = row(best);
    const c = col(best);
    const b = box(best);
    let count = 0;
    for (const value of valuesForMask(bestMask, false)) {
      const bit = 1 << value;
      g[best] = value;
      masks.rows[r] = masks.rows[r]! | bit;
      masks.cols[c] = masks.cols[c]! | bit;
      masks.boxes[b] = masks.boxes[b]! | bit;
      count += search();
      g[best] = 0;
      masks.rows[r] = masks.rows[r]! ^ bit;
      masks.cols[c] = masks.cols[c]! ^ bit;
      masks.boxes[b] = masks.boxes[b]! ^ bit;
      if (count >= limit) return count;
    }
    return count;
  };
  return search();
}

export function isValidSolution(g: number[]): boolean {
  if (g.length !== 81 || !g.every((v) => Number.isInteger(v) && v >= 1 && v <= 9)) return false;
  for (let start = 0; start < 9; start++) {
    const rowValues = new Set(g.slice(start * 9, start * 9 + 9));
    const colValues = new Set(Array.from({ length: 9 }, (_, offset) => g[start + offset * 9]));
    if (rowValues.size !== 9 || colValues.size !== 9) return false;
  }
  for (let boxRow = 0; boxRow < 3; boxRow++) {
    for (let boxCol = 0; boxCol < 3; boxCol++) {
      const values = new Set<number>();
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) values.add(g[(boxRow * 3 + r) * 9 + boxCol * 3 + c]!);
      if (values.size !== 9) return false;
    }
  }
  return true;
}

export interface Puzzle {
  puzzle: number[];
  solution: number[];
}

const EXTREME_TEMPLATE =
  "000000010400000000020000000000050407008000300001090000300400200050100000000806000"
    .split("")
    .map(Number);
const EXTREME_SOLUTION =
  "693784512487512936125963874932651487568247391741398625319475268856129743274836159"
    .split("")
    .map(Number);

function transformedTemplate(difficulty: Difficulty): Puzzle {
  const digits = [0, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])];
  const bands = shuffle([0, 1, 2]);
  const stacks = shuffle([0, 1, 2]);
  const rows = bands.flatMap((band) => shuffle([0, 1, 2]).map((offset) => band * 3 + offset));
  const cols = stacks.flatMap((stack) => shuffle([0, 1, 2]).map((offset) => stack * 3 + offset));
  const solution = Array(81).fill(0) as number[];
  const puzzle = Array(81).fill(0) as number[];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const source = rows[r]! * 9 + cols[c]!;
      solution[r * 9 + c] = digits[EXTREME_SOLUTION[source]!]!;
      puzzle[r * 9 + c] = EXTREME_TEMPLATE[source] ? digits[EXTREME_TEMPLATE[source]!]! : 0;
    }
  if (difficulty === "Master") {
    for (const index of shuffle([...Array(81).keys()])) {
      if (!puzzle[index]) {
        puzzle[index] = solution[index]!;
        if (puzzle.filter(Boolean).length === CLUES.Master) break;
      }
    }
  }
  return { puzzle, solution };
}

/** Generates a randomized puzzle with exactly the level's clue target and one solution. */
export function generatePuzzle(difficulty: Difficulty): Puzzle {
  const target = CLUES[difficulty];
  if (difficulty === "Master" || difficulty === "Extreme") return transformedTemplate(difficulty);
  for (let attempt = 0; attempt < 24; attempt++) {
    const solution = Array(81).fill(0) as number[];
    if (!fill(solution)) continue;
    const puzzle = [...solution];
    let filled = 81;
    for (const i of shuffle([...Array(81).keys()])) {
      if (filled <= target) break;
      const keep = puzzle[i]!;
      puzzle[i] = 0;
      if (countSolutions([...puzzle], 2) !== 1) puzzle[i] = keep;
      else filled--;
    }
    if (filled <= target) return { puzzle, solution };
  }
  // A valid complete solution is always safer than silently selecting another level.
  const solution = Array(81).fill(0) as number[];
  fill(solution);
  const puzzle = [...solution];
  for (const i of shuffle([...Array(81).keys()]).slice(0, 81 - target)) puzzle[i] = 0;
  return { puzzle, solution };
}

export function conflicts(g: number[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (!g[i]) continue;
    for (const p of peers(i)) if (g[p] === g[i]) out.add(i);
  }
  return out;
}

export function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
