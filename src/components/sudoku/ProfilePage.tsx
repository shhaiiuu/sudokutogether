import { Award, BarChart3, Clock3, Flame, LockKeyhole, UserRound } from "lucide-react";
import { BottomNav, type NavigationPage } from "./BottomNav";

const previews = [
  { title: "Statistics", text: "Track your progress.", icon: BarChart3 },
  { title: "Streaks", text: "Build a daily streak.", icon: Flame },
  { title: "Achievements", text: "Celebrate milestones.", icon: Award },
  { title: "Game History", text: "Review past games.", icon: Clock3 },
];

export function ProfilePage({ onNavigate }: { onNavigate: (page: NavigationPage) => void }) {
  return (
    <div className="app-backdrop flex min-h-dvh flex-col overflow-hidden">
      <main className="flex flex-1 flex-col items-center px-6 py-6">
        <section className="w-full max-w-md rounded-3xl bg-card p-7 text-center shadow-soft">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent text-primary">
            <UserRound className="h-11 w-11" aria-hidden />
          </div>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden /> Coming Soon
          </span>
          <h2 className="mt-4 text-2xl font-extrabold">
            <span className="text-foreground"> Your </span>
            <span className="text-primary">Space</span>
          </h2>
          <p className="mt-2 text-muted-foreground">
            Your personal Sudoku progress will live here soon.
          </p>
        </section>

        <section
          className="mt-5 grid w-full max-w-md grid-cols-2 gap-3"
          aria-label="Profile previews"
        >
          {previews.map(({ title, text, icon: Icon }) => (
            <article key={title} className="rounded-2xl bg-card p-4 shadow-soft">
              <Icon className="h-6 w-6 text-primary" aria-hidden />
              <h3 className="mt-3 font-bold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </article>
          ))}
        </section>
      </main>

      <BottomNav active="me" onNavigate={onNavigate} />
    </div>
  );
}
