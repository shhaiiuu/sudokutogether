import { PartyPopper, Pause } from "lucide-react";
import { formatTime, type Difficulty } from "@/lib/sudoku";
import { PrimaryButton, SecondaryButton, Sheet } from "./Sheet";

export interface Settings {
  sound: boolean;
  highlightRelated: boolean;
  highlightSame: boolean;
  showMistakes: boolean;
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const rows: [keyof Settings, string, string][] = [
    ["sound", "Sound", "Play subtle feedback sounds"],
    ["highlightRelated", "Highlight areas", "Row, column and box of the selected cell"],
    ["highlightSame", "Highlight identical numbers", "Shade matching digits on the board"],
    ["showMistakes", "Mistake limit", "End the game after 3 mistakes"],
  ];
  return (
    <Sheet open={open} onClose={onClose} label="Settings">
      <div className="p-6">
        <h2 className="mb-2 text-xl font-bold">Settings</h2>
        <ul className="divide-y">
          {rows.map(([k, label, hint]) => (
            <li key={k} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-semibold">{label}</p>
                <p className="text-sm text-muted-foreground">{hint}</p>
              </div>
              <button
                role="switch"
                aria-checked={settings[k]}
                aria-label={label}
                onClick={() => onChange({ ...settings, [k]: !settings[k] })}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${settings[k] ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-all ${settings[k] ? "left-6" : "left-1"}`}
                />
              </button>
            </li>
          ))}
        </ul>
        <PrimaryButton className="mt-4" onClick={onClose}>
          Done
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

export function PauseDialog({
  open,
  elapsed,
  difficulty,
  onResume,
  onHome,
}: {
  open: boolean;
  elapsed: number;
  difficulty: Difficulty;
  onResume: () => void;
  onHome: () => void;
}) {
  return (
    <Sheet open={open} onClose={onResume} label="Paused">
      <div className="flex flex-col items-center gap-2 p-6">
        <Pause className="h-10 w-10 text-primary" />
        <h2 className="text-2xl font-bold">Paused</h2>
        <p className="text-muted-foreground">
          {formatTime(elapsed)} · {difficulty}
        </p>
        <PrimaryButton className="mt-4" onClick={onResume}>
          Resume
        </PrimaryButton>
        <SecondaryButton onClick={onHome}>Main menu</SecondaryButton>
      </div>
    </Sheet>
  );
}

export function LeaveGameDialog({
  open,
  leaving = false,
  onStay,
  onLeave,
}: {
  open: boolean;
  leaving?: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <Sheet open={open} {...(leaving ? {} : { onClose: onStay })} label="Leave this game">
      <div className="flex flex-col gap-3 p-6 text-center">
        <h2 className="text-2xl font-bold">Leave this game?</h2>
        <p className="text-muted-foreground">Are you sure you want to leave this game?</p>
        <PrimaryButton className="mt-3" onClick={onLeave} disabled={leaving}>
          {leaving ? "Leaving…" : "Leave Game"}
        </PrimaryButton>
        <SecondaryButton onClick={onStay} disabled={leaving}>
          Stay
        </SecondaryButton>
      </div>
    </Sheet>
  );
}

export function LeaveRoomDialog({
  open,
  leaving = false,
  onStay,
  onLeave,
}: {
  open: boolean;
  leaving?: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <Sheet open={open} {...(leaving ? {} : { onClose: onStay })} label="Leave this room">
      <div className="flex flex-col gap-3 p-6 text-center">
        <h2 className="text-2xl font-bold">Leave this room?</h2>
        <p className="text-muted-foreground">Are you sure you want to leave this room?</p>
        <PrimaryButton className="mt-3" onClick={onLeave} disabled={leaving}>
          {leaving ? "Leaving…" : "Leave Room"}
        </PrimaryButton>
        <SecondaryButton onClick={onStay} disabled={leaving}>
          Stay
        </SecondaryButton>
      </div>
    </Sheet>
  );
}

export function CompleteDialog({
  open,
  won,
  elapsed,
  difficulty,
  score,
  shared,
  onAgain,
  onHome,
}: {
  open: boolean;
  won: boolean;
  elapsed: number;
  difficulty: Difficulty;
  score: number;
  shared?: boolean;
  onAgain: () => void;
  onHome: () => void;
}) {
  return (
    <Sheet open={open} label={won ? "Puzzle solved" : "Game over"}>
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-primary">
          <PartyPopper className="h-8 w-8" />
        </span>
        <h2 className="text-2xl font-extrabold">
          {won ? (shared ? "Solved together!" : "Puzzle solved!") : "Out of mistakes"}
        </h2>
        <dl className="grid w-full grid-cols-3 gap-2 rounded-2xl bg-muted p-3">
          <div>
            <dt className="text-xs text-muted-foreground">Time</dt>
            <dd className="font-bold">{formatTime(elapsed)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Difficulty</dt>
            <dd className="font-bold">{difficulty}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Score</dt>
            <dd className="font-bold">{score.toLocaleString()}</dd>
          </div>
        </dl>
        <PrimaryButton className="mt-2" onClick={onAgain}>
          Play Again
        </PrimaryButton>
        <SecondaryButton onClick={onHome}>Home</SecondaryButton>
      </div>
    </Sheet>
  );
}
