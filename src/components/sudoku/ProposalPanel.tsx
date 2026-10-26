import { Check, X } from "lucide-react";
import { col, row } from "@/lib/sudoku";
import { missingVotes, type Player, type Proposal } from "@/lib/room";
import { PlayerRow } from "./PlayerList";
import { cn } from "@/lib/utils";

const STATUS: Record<Proposal["status"], { label: string; cls: string }> = {
  waiting: { label: "Waiting for votes", cls: "bg-accent text-accent-foreground" },
  paused: { label: "Paused · waiting for reconnection", cls: "bg-warning/15 text-warning" },
  approved: { label: "Approved · Move applied", cls: "bg-success/15 text-success" },
  rejected: { label: "Rejected", cls: "bg-destructive/10 text-destructive" },
  timeout: { label: "Timed out", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
};

export function ProposalPanel({
  proposal,
  players,
  youId,
  onVote,
  onDismiss,
  onCancel,
}: {
  proposal: Proposal;
  players: Player[];
  youId: string;
  onVote: (v: "yes" | "no") => void;
  onDismiss: () => void;
  onCancel?: () => void;
}) {
  const proposer = players.find((p) => p.id === proposal.proposerId);
  const myVote = proposal.votes[youId];
  const missing = missingVotes(proposal, players);
  const s = STATUS[proposal.status];
  return (
    <div
      className="rounded-3xl border bg-card p-4 shadow-soft animate-in slide-in-from-bottom-4 fade-in"
      role="region"
      aria-label="Move proposal"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-primary text-3xl text-primary">
          {proposal.value}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            Row {row(proposal.index) + 1}, Column {col(proposal.index) + 1}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            Proposed by {proposer?.isYou ? "you" : proposer?.name}
          </p>
          <span
            className={cn("mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold", s.cls)}
          >
            {s.label}
            {proposal.status === "waiting" && ` · ${missing} missing`}
          </span>
        </div>
      </div>
      <ul className="mt-2 divide-y">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} vote={proposal.votes[p.id] ?? "pending"} />
        ))}
      </ul>
      {proposal.status === "waiting" && myVote === "pending" ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => onVote("no")}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-muted font-bold text-destructive active:scale-95"
          >
            <X className="h-5 w-5" /> No
          </button>
          <button
            onClick={() => onVote("yes")}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground shadow-button active:scale-95"
          >
            <Check className="h-5 w-5" /> Yes
          </button>
        </div>
      ) : proposal.status === "waiting" && proposal.proposerId === youId && onCancel ? (
        <button
          onClick={onCancel}
          className="mt-3 min-h-11 w-full rounded-full bg-muted font-semibold text-destructive active:scale-95"
        >
          Cancel proposal
        </button>
      ) : proposal.status !== "waiting" ? (
        <button
          onClick={onDismiss}
          className="mt-3 min-h-11 w-full rounded-full bg-muted font-semibold text-foreground active:scale-95"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
