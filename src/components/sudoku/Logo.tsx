import { cn } from "@/lib/utils";

const CELLS = [1, 2, 3, 6, 0, 4, 7, 8, 9];
const BLUE = new Set([2, 6, 9, 7]);

/** 3×3 mini-grid app icon. `animate` reveals digits in sequence. */
export function GridIcon({
  size = 96,
  animate = false,
  className,
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 grid-rows-3 overflow-hidden rounded-[22%] bg-card shadow-soft",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {CELLS.map((n, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-center border-grid-strong/40",
            i % 3 !== 2 && "border-r",
            i < 6 && "border-b",
            BLUE.has(n) ? "text-cell-entered" : "text-cell-given",
            animate && n && "animate-cell-pop fill-mode-both",
          )}
          style={{ fontSize: size * 0.27, animationDelay: animate ? `${i * 90}ms` : undefined }}
        >
          {n || ""}
        </div>
      ))}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <h1 className={cn("text-2xl font-extrabold tracking-tight text-foreground", className)}>
      Sudoku<span className="text-primary">Together</span>
    </h1>
  );
}

/** Open 3×3 letter grid logo for Home screen (Section 2.2). */
export function LetterGridLogo({
  size = 168,
  animate = true,
  className,
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const letters = ["S", "U", "D", "O", "K", "U", "", "2", ""];
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div
        className="grid grid-cols-3 grid-rows-3"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {letters.map((char, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center justify-center font-extrabold text-foreground",
              i % 3 !== 2 && "border-r-[3px] border-primary",
              i < 6 && "border-b-[3px] border-primary",
              animate && "animate-cell-pop fill-mode-both",
            )}
            style={{
              fontSize: size * 0.22,
              animationDelay: animate ? `${i * 70}ms` : undefined,
            }}
          >
            {char === "2" ? (
              <span
                className="flex items-center justify-center rounded-full bg-accent text-primary font-extrabold"
                style={{ width: size * 0.24, height: size * 0.24 }}
              >
                2
              </span>
            ) : (
              char
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-[0.4em] text-primary">TOGETHER</p>
    </div>
  );
}
