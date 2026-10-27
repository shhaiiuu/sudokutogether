import { useState } from "react";
import {
  Clock,
  Flame,
  Trophy,
  Users,
  Sun,
  Mountain,
  Leaf,
  Settings as SettingsIcon,
} from "lucide-react";
import { Wordmark, LetterGridLogo } from "./Logo";
import { PrimaryButton, SecondaryButton } from "./Sheet";
import { formatTime, type Difficulty } from "@/lib/sudoku";
import { cn } from "@/lib/utils";
import { SettingsDialog, type Settings } from "./Dialogs";

export interface SavedSummary {
  elapsed: number;
  difficulty: Difficulty;
}

const SETTINGS_KEY = "st.settings";
const DEFAULT_SETTINGS: Settings = {
  sound: true,
  highlightRelated: true,
  highlightSame: true,
  showMistakes: true,
};

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Event periods are explicit UTC timestamps for tests and scheduled challenges.
export const EVENTS = [
  {
    title: "Morning Calm",
    icon: Sun,
    color: "bg-event-1",
    startAt: "2026-10-20T00:00:00Z",
    endAt: "2026-11-01T12:00:00Z",
    difficulty: "Easy" as Difficulty,
  },
  {
    title: "Forest Trail",
    icon: Leaf,
    color: "bg-event-2",
    startAt: "2026-10-22T00:00:00Z",
    endAt: "2026-11-05T03:00:00Z",
    difficulty: "Medium" as Difficulty,
  },
  {
    title: "Summit Climb",
    icon: Mountain,
    color: "bg-event-3",
    startAt: "2026-10-25T00:00:00Z",
    endAt: "2026-11-08T20:00:00Z",
    difficulty: "Hard" as Difficulty,
  },
];

export function getEventCountdown(endAt: string, now = Date.now()) {
  const remaining = Math.max(0, Date.parse(endAt) - now);
  if (remaining === 0) return { label: "Ended", ended: true };

  const minute = 60 * 1000;
  const hour = 60 * minute;
  if (remaining < hour)
    return { label: `${Math.max(1, Math.ceil(remaining / minute))}m`, ended: false };

  const totalHours = Math.floor(remaining / hour);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return { label: days > 0 ? `${days}d ${hours}h` : `${totalHours}h`, ended: false };
}

export function HomeScreen({
  best,
  saved,
  onContinue,
  onNewGame,
  onMultiplayer,
}: {
  best: number;
  saved: SavedSummary | null;
  onContinue: () => void;
  onNewGame: () => void;
  onMultiplayer: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(readSettings);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div className="app-backdrop flex h-dvh flex-col overflow-hidden">
      {/* Header — Centered Wordmark, Right: 40px round white Settings button */}
      <header className="relative flex shrink-0 items-center justify-center px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <Wordmark />
        <button
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          className="absolute right-5 flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition hover:bg-muted active:scale-95"
        >
          <SettingsIcon className="h-5 w-5" aria-hidden />
        </button>
      </header>

      {/* Main Content — fills remaining space without scrolling */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-evenly px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Logo */}
        <div className="flex items-center justify-center">
          <LetterGridLogo size={152} />
        </div>

        {/* All-Time Best Score */}
        <div className="flex flex-col items-center justify-center">
          <p className="text-sm font-medium text-muted-foreground">All-Time Best Score</p>
          <p className="mt-1 flex items-center gap-2 text-4xl font-extrabold text-foreground">
            <Trophy className="h-8 w-8 fill-warning text-warning" aria-hidden />
            {best.toLocaleString()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex w-full max-w-md flex-col gap-3">
          {saved ? (
            <PrimaryButton onClick={onContinue}>
              <span>Continue Game</span>
              <span className="flex items-center gap-1 text-sm font-medium opacity-90">
                <Clock className="h-3.5 w-3.5" aria-hidden /> {formatTime(saved.elapsed)} ·{" "}
                {saved.difficulty}
              </span>
            </PrimaryButton>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No game in progress — start a fresh puzzle below.
            </p>
          )}

          <SecondaryButton
            onClick={onNewGame}
            className={cn(
              "relative",
              !saved
                ? "bg-primary text-primary-foreground shadow-button"
                : "bg-card text-foreground shadow-soft",
            )}
          >
            New Game
            <span className="absolute -right-1 -top-3 flex items-center gap-0.5 rounded-full bg-card px-2 py-1 text-sm text-streak shadow-soft">
              <Flame className="h-4 w-4 fill-streak" aria-hidden />
              +1
            </span>
          </SecondaryButton>

          <button
            onClick={onMultiplayer}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary/40 font-bold text-primary transition hover:bg-primary/5 active:scale-[0.98]"
          >
            <Users className="h-5 w-5" aria-hidden /> Play with Friends
          </button>
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={updateSettings}
      />
    </div>
  );
}
