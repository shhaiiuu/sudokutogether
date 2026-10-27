import { GridIcon } from "./Logo";

export function LoadingScreen() {
  return (
    <div
      className="app-backdrop flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden"
      role="status"
      aria-label="Loading Sudoku Together"
    >
      <GridIcon size={112} animate />
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-primary animate-loader-dot"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
