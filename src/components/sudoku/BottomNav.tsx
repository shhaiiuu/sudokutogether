import { CalendarDays, Home, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavigationPage = "main" | "daily" | "me";

export function BottomNav({
  active,
  onNavigate,
}: {
  active: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
}) {
  const items = [
    { page: "main" as const, label: "Main", icon: Home },
    { page: "daily" as const, label: "Daily Challenges", icon: CalendarDays },
    { page: "me" as const, label: "Me", icon: User },
  ];
  return (
    <nav
      className="grid grid-cols-3 border-t bg-card pb-[env(safe-area-inset-bottom)]"
      aria-label="Main"
    >
      {items.map((it) => (
        <button
          key={it.page}
          aria-current={active === it.page ? "page" : undefined}
          onClick={() => onNavigate(it.page)}
          className={cn(
            "flex flex-col items-center gap-1 py-2.5 text-sm transition",
            active === it.page ? "text-primary" : "text-muted-foreground",
          )}
        >
          <it.icon className={cn("h-7 w-7", active === it.page && "fill-primary/20")} aria-hidden />
          {it.label}
        </button>
      ))}
    </nav>
  );
}
