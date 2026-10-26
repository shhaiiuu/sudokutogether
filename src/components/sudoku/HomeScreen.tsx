import { useEffect, useState } from "react";
import { Clock, Flame, Trophy, Users, Sun, Mountain, Leaf } from "lucide-react";
import { Wordmark } from "./Logo";
import { PrimaryButton, SecondaryButton } from "./Sheet";
import { formatTime, type Difficulty } from "@/lib/sudoku";
import { cn } from "@/lib/utils";
import { BottomNav, type NavigationPage } from "./BottomNav";

export interface SavedSummary {
  elapsed: number;
  difficulty: Difficulty;
}

// Event periods are explicit UTC timestamps so refreshes and device timezone changes
// calculate the same remaining duration from the actual end time.
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
  streak,
  best,
  saved,
  onContinue,
  onNewGame,
  onMultiplayer,
  onEvent,
  onNavigate,
}: {
  streak: number;
  best: number;
  saved: SavedSummary | null;
  onContinue: () => void;
  onNewGame: () => void;
  onMultiplayer: () => void;
  onEvent: (d: Difficulty) => void;
  onNavigate: (page: NavigationPage) => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <div className="app-backdrop flex min-h-dvh flex-col overflow-hidden">
      <header className="relative flex items-center justify-center px-5 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Wordmark />
        <div
          className="absolute right-5 flex items-center gap-1 text-lg font-bold"
          aria-label={`${streak} day streak`}
        >
          <Flame className="h-6 w-6 fill-streak text-streak" aria-hidden />
          {streak}
        </div>
      </header>

      <section aria-label="Events" className="overflow-x-auto py-3 [scrollbar-width:none]">
        <div className="mx-auto flex w-max min-w-full justify-center gap-3 px-5">
          {EVENTS.map((e) => {
            const countdown = getEventCountdown(e.endAt, now);
            return (
              <article
                key={e.title}
                className={cn(
                  "flex w-44 shrink-0 snap-center flex-col items-center gap-2 rounded-2xl p-4 text-primary-foreground shadow-soft sm:w-52",
                  e.color,
                )}
              >
                <span className="flex items-center gap-1 self-end rounded-md bg-foreground/20 px-1.5 py-0.5 text-xs font-semibold">
                  <Clock className="h-3 w-3" aria-hidden /> {countdown.label}
                </span>
                <e.icon className="h-10 w-10" aria-hidden />
                <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
                  Event
                </p>
                <h2 className="text-center text-base font-bold leading-tight">{e.title}</h2>
                <button
                  onClick={() => onEvent(e.difficulty)}
                  disabled={countdown.ended}
                  className="mt-1 rounded-full bg-primary-foreground/25 px-7 py-1.5 font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {countdown.ended ? "Ended" : "Play"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <p className="text-muted-foreground">All-Time Best Score</p>
        <p className="flex items-center gap-2 text-4xl font-extrabold">
          <Trophy className="h-8 w-8 fill-warning text-warning" aria-hidden />
          {best.toLocaleString()}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-8 pb-6">
        {saved ? (
          <PrimaryButton onClick={onContinue}>
            <span>Continue Game</span>
            <span className="flex items-center gap-1 text-sm font-medium opacity-90">
              <Clock className="h-3.5 w-3.5" aria-hidden /> {formatTime(saved.elapsed)} -{" "}
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
          className={cn(!saved && "bg-primary text-primary-foreground shadow-button")}
        >
          New Game
          <span className="absolute -right-1 -top-3 flex items-center gap-0.5 rounded-full bg-card px-2 py-1 text-sm text-streak shadow-soft">
            <Flame className="h-4 w-4 fill-streak" aria-hidden />
            +1
          </span>
        </SecondaryButton>
        <button
          onClick={onMultiplayer}
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary/40 font-bold text-primary transition active:scale-[0.98]"
        >
          <Users className="h-5 w-5" aria-hidden /> Play with Friends
        </button>
      </div>

      <BottomNav active="main" onNavigate={onNavigate} />
    </div>
  );
}
