import { box, col, row } from "@/lib/sudoku";
import { cn } from "@/lib/utils";

export interface BoardProps {
  grid: number[];
  givens: boolean[];
  notes: number[][];
  sharedNotes?: number[][] | undefined;
  selected: number | null;
  conflicts: Set<number>;
  wrong: Set<number>;
  pendingCell?: { index: number; value: number } | null | undefined;
  highlightRelated: boolean;
  highlightSame: boolean;
  onSelect: (i: number) => void;
}

export function SudokuBoard(p: BoardProps) {
  const sel = p.selected;
  const selVal = sel !== null ? p.grid[sel] : 0;
  return (
    <div
      role="grid"
      aria-label="Sudoku board"
      className="grid aspect-square w-full min-h-0 min-w-0 grid-cols-9 grid-rows-9 rounded-2xl overflow-hidden border-2 border-grid-strong bg-card select-none"
    >
      {p.grid.map((v, i) => {
        const r = row(i),
          c = col(i);
        const related =
          sel !== null &&
          p.highlightRelated &&
          (row(sel) === r || col(sel) === c || box(sel) === box(i));
        const same = p.highlightSame && selVal !== 0 && v === selVal;
        const isSel = sel === i;
        const bad = p.wrong.has(i) || (p.conflicts.has(i) && !p.givens[i]);
        const pending = p.pendingCell?.index === i;
        return (
          <button
            key={i}
            role="gridcell"
            aria-label={`Row ${r + 1}, Column ${c + 1}${v ? `, ${v}` : ", empty"}${p.givens[i] ? ", given" : ""}`}
            aria-selected={isSel}
            onClick={() => p.onSelect(i)}
            className={cn(
              "relative flex h-full min-h-0 min-w-0 w-full items-center justify-center overflow-hidden border-grid-line p-0 text-[min(7.5vw,2.25rem)] leading-none outline-none transition-colors",
              c < 8 && (c % 3 === 2 ? "border-r-2 border-r-grid-strong" : "border-r"),
              r < 8 && (r % 3 === 2 ? "border-b-2 border-b-grid-strong" : "border-b"),
              related && "bg-cell-related",
              same && "bg-cell-same",
              bad && "bg-cell-conflict",
              isSel && "bg-cell-selected",
              p.givens[i] ? "text-cell-given" : bad ? "text-destructive" : "text-cell-entered",
            )}
          >
            {v ? (
              <span key={v} className={cn(!p.givens[i] && "animate-cell-pop")}>
                {v}
              </span>
            ) : pending ? (
              <span className="flex h-[70%] w-[70%] items-center justify-center rounded-md border-2 border-dashed border-primary text-[0.8em] text-primary/70 animate-pulse">
                {p.pendingCell!.value}
              </span>
            ) : (
              <NoteGrid notes={p.notes[i] ?? []} shared={p.sharedNotes?.[i]} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function NoteGrid({ notes, shared }: { notes: number[]; shared?: number[] | undefined }) {
  const combined = notes.length ? notes : (shared ?? []);
  if (!combined.length) return null;
  return (
    <span className="grid h-full min-h-0 min-w-0 w-full grid-cols-3 grid-rows-3 overflow-hidden p-[6%] text-[min(2.6vw,0.75rem)] leading-none text-muted-foreground">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <span
          key={n}
          className="flex h-full min-h-0 min-w-0 w-full items-center justify-center font-normal"
        >
          {combined.includes(n) ? n : ""}
        </span>
      ))}
    </span>
  );
}
