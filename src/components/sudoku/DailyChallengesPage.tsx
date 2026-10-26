import { CalendarDays, LockKeyhole } from "lucide-react";
import { BottomNav, type NavigationPage } from "./BottomNav";

export function DailyChallengesPage({
  onNavigate,
}: {
  onNavigate: (page: NavigationPage) => void;
}) {
  return (
    <div className="app-backdrop flex min-h-dvh flex-col overflow-hidden">
      <header className="px-5 pb-3 pt-18 text-center">
        <h1 className="text-3xl  font-extrabold">
          <span className="text-foreground">Daily </span>
          <span className="text-primary">Challenges</span>
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <section className="w-full max-w-md rounded-3xl bg-card p-8 text-center shadow-soft">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-primary">
            <CalendarDays className="h-11 w-11" aria-hidden />
          </div>
          <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden /> Coming Soon
          </span>
          <h2 className="mt-4 text-2xl font-extrabold">Something exciting is coming!</h2>
          <p className="mt-3 text-muted-foreground">
            Daily Sudoku challenges are on their way. Come back soon to test your skills and build
            your streak!
          </p>
          <div className="mt-7 grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground">
            <span className="rounded-2xl bg-muted px-2 py-3">Daily Puzzles</span>
            <span className="rounded-2xl bg-muted px-2 py-3">Personal Bests</span>
            <span className="rounded-2xl bg-muted px-2 py-3">Streaks</span>
          </div>
        </section>
      </main>

      <BottomNav active="daily" onNavigate={onNavigate} />
    </div>
  );
}
