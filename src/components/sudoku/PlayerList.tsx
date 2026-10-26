import { Crown, Check, Clock, X } from "lucide-react";
import type { Player, Vote } from "@/lib/room";
import { cn } from "@/lib/utils";

const BG: Record<Player["color"], string> = { p1: "bg-p1", p2: "bg-p2", p3: "bg-p3", p4: "bg-p4" };

export function Avatar({ player, size = "md" }: { player: Player; size?: "sm" | "md" }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "flex items-center justify-center rounded-full font-bold text-primary-foreground ring-2 ring-card",
          BG[player.color],
          size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-base",
          !player.online && "opacity-40 grayscale",
        )}
        aria-hidden
      >
        {player.name.slice(0, 2).toUpperCase()}
      </span>
      <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card", player.online ? "bg-success" : "bg-muted-foreground")} />
    </span>
  );
}

export function PlayerRow({ player, vote, showReady }: { player: Player; vote?: Vote; showReady?: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar player={player} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-semibold">
          {player.name}
          {player.isYou && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
          {player.host && <Crown className="h-4 w-4 fill-warning text-warning" aria-label="Host" />}
        </p>
        <p className="text-xs text-muted-foreground">{player.online ? "Online" : "Disconnected"}</p>
      </div>
      {showReady && (
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", player.ready ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
          {player.ready ? "Ready" : "Not ready"}
        </span>
      )}
      {vote && <VoteBadge vote={player.online ? vote : "pending"} offline={!player.online} />}
    </li>
  );
}

function VoteBadge({ vote, offline }: { vote: Vote; offline?: boolean }) {
  if (offline) return <span className="text-xs text-muted-foreground">Skipped</span>;
  if (vote === "yes") return <span className="flex items-center gap-1 text-sm font-bold text-success"><Check className="h-4 w-4" />Yes</span>;
  if (vote === "no") return <span className="flex items-center gap-1 text-sm font-bold text-destructive"><X className="h-4 w-4" />No</span>;
  return <span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4 animate-pulse" />Waiting</span>;
}

export function PlayerBar({ players }: { players: Player[] }) {
  return (
    <div className="flex items-center gap-1" aria-label="Players">
      {players.map((p) => (
        <span key={p.id} title={`${p.name}${p.online ? "" : " (offline)"}`}>
          <Avatar player={p} size="sm" />
        </span>
      ))}
    </div>
  );
}
