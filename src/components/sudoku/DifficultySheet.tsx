import { Lock } from "lucide-react";
import { ALL_LEVELS, type Difficulty } from "@/lib/sudoku";
import { Sheet } from "./Sheet";
import { cn } from "@/lib/utils";

export function DifficultySheet({
  open,
  onClose,
  onPick,
  onRestart,
  selected,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (d: Difficulty) => void;
  onRestart?: () => void;
  selected?: Difficulty;
  title?: string;
}) {
  const item = "flex min-h-[3.75rem] w-full items-center justify-center text-xl font-medium transition active:bg-accent focus-visible:bg-accent focus-visible:outline-none";
  return (
    <Sheet open={open} onClose={onClose} label="Choose difficulty">
      <div className="px-6 py-2">
        {title && <p className="pt-3 text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>}
        <ul className="divide-y divide-border">
          {ALL_LEVELS.map(({ level, available, note }) =>
            available ? (
              <li key={level}>
                <button className={cn(item, "text-primary", selected === level && "font-bold")} onClick={() => onPick(level as Difficulty)} aria-pressed={selected === level}>
                  {level}
                </button>
              </li>
            ) : (
              <li key={level} className="relative flex min-h-[3.75rem] flex-col items-center justify-center text-muted-foreground/60" aria-disabled="true">
                <Lock className="absolute left-0 h-5 w-5" aria-hidden />
                <span className="text-xl">{level}</span>
                <span className="text-xs">{note}</span>
              </li>
            ),
          )}
          {onRestart && (
            <li>
              <button className={cn(item, "text-primary")} onClick={onRestart}>
                Restart
              </button>
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}
