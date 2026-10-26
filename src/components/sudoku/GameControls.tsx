import { Check, Eraser, Lightbulb, PencilLine, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function GameControls({
  notesOn,
  hintsLeft,
  canUndo,
  canErase,
  onUndo,
  onErase,
  onNotes,
  onHint,
  disabled,
}: {
  notesOn: boolean;
  hintsLeft: number;
  canUndo: boolean;
  canErase: boolean;
  onUndo: () => void;
  onErase: () => void;
  onNotes: () => void;
  onHint: () => void;
  disabled?: boolean;
}) {
  const btn =
    "relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-sm text-muted-foreground transition active:scale-90 active:bg-accent disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="grid grid-cols-4 place-items-center">
      <button className={btn} onClick={onUndo} disabled={disabled || !canUndo}>
        <Undo2 className="h-7 w-7" aria-hidden /> Undo
      </button>
      <button className={btn} onClick={onErase} disabled={disabled || !canErase}>
        <Eraser className="h-7 w-7" aria-hidden /> Erase
      </button>
      <button
        className={cn(btn, notesOn && "text-primary")}
        onClick={onNotes}
        aria-pressed={notesOn}
        disabled={disabled}
      >
        <PencilLine className="h-7 w-7" aria-hidden /> Notes
        <span
          className={cn(
            "absolute -top-1 right-0 rounded-full px-1.5 text-[10px] font-bold",
            notesOn
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/40 text-primary-foreground",
          )}
        >
          {notesOn ? "ON" : "OFF"}
        </span>
      </button>
      <button className={btn} onClick={onHint} disabled={disabled || hintsLeft === 0}>
        <Lightbulb className="h-7 w-7" aria-hidden /> Hint
        <span className="absolute -top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {hintsLeft}
        </span>
      </button>
    </div>
  );
}

export function NumberPad({
  grid,
  onNumber,
  notesOn,
  disabled,
}: {
  grid: number[];
  onNumber: (n: number) => void;
  notesOn: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-9" aria-label="Number pad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const done = grid.filter((v) => v === n).length >= 9;
        return (
          <button
            key={n}
            onClick={() => onNumber(n)}
            disabled={disabled || done}
            aria-label={done ? `${n} complete` : `Enter ${n}`}
            className={cn(
              "flex h-16 items-center justify-center rounded-xl text-[min(10vw,2.75rem)] font-normal transition active:scale-90 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground",
              notesOn ? "text-muted-foreground" : "text-cell-entered",
            )}
          >
            {done ? <Check className="h-6 w-6" aria-hidden /> : n}
          </button>
        );
      })}
    </div>
  );
}
