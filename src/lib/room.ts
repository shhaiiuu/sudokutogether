export type Vote = "yes" | "no" | "pending";
export type RoomStatus = "waiting" | "playing" | "completed";

export interface Player {
  id: string;
  name: string;
  color: "p1" | "p2" | "p3" | "p4";
  online: boolean;
  ready: boolean;
  host: boolean;
  isYou?: boolean;
}

export interface Proposal {
  id?: string;
  index: number;
  value: number;
  proposerId: string;
  votes: Record<string, Vote>;
  status: "waiting" | "paused" | "approved" | "rejected" | "timeout" | "cancelled";
  createdAt: number;
  eligibleVoterIds?: string[];
  activeDeadlineAt?: number;
  disconnectDeadlineAt?: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  text: string;
  at: number;
  delivery?: "sending" | "sent" | "failed";
}

export interface RoomGameState {
  puzzle: number[];
  grid: number[];
  erasable: boolean[];
  notes: number[][];
  elapsed: number;
  score: number;
  mistakes?: number;
  completed: boolean;
  revision: number;
}

export interface RoomSnapshot {
  roomId: string;
  code: string;
  hostId: string;
  difficulty: import("./sudoku").Difficulty;
  status: RoomStatus;
  players: Player[];
  game: RoomGameState | null;
  proposal: Proposal | null;
  messages: ChatMessage[];
}

export const MAX_PLAYERS = 4;
export const PROPOSAL_TIMEOUT_MS = 300_000;
export const RECONNECTION_GRACE_MS = 60_000;

export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const merged = [...current];
  for (const message of incoming) {
    const exact = merged.findIndex((item) => item.id === message.id);
    if (exact >= 0) {
      merged[exact] = { ...merged[exact], ...message, delivery: "sent" };
      continue;
    }
    const optimistic = merged.findIndex(
      (item) =>
        (item.id.startsWith("temp-") || item.id.startsWith("msg-")) &&
        item.playerId === message.playerId &&
        item.text === message.text &&
        Math.abs(item.at - message.at) < 30_000,
    );
    if (optimistic >= 0) merged.splice(optimistic, 1);
    merged.push({ ...message, delivery: "sent" });
  }
  return merged.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** Pure display helper retained for unit tests; the server is authoritative in multiplayer. */
export function resolveProposal(
  p: Proposal,
  players: Player[],
  now = Date.now(),
): Proposal["status"] {
  if (p.status !== "waiting" && p.status !== "paused") return p.status;
  const electorate = players.filter((pl) => p.eligibleVoterIds?.includes(pl.id) ?? true);
  const everyoneOnline = electorate.length > 0 && electorate.every((pl) => pl.online);
  if (!everyoneOnline) {
    if (
      p.status === "paused" &&
      p.disconnectDeadlineAt !== undefined &&
      now >= p.disconnectDeadlineAt
    )
      return "cancelled";
    return "paused";
  }
  if (electorate.some((pl) => p.votes[pl.id] === "no")) return "rejected";
  if (electorate.every((pl) => p.votes[pl.id] === "yes")) return "approved";
  if (
    p.activeDeadlineAt !== undefined
      ? now >= p.activeDeadlineAt
      : now - p.createdAt >= PROPOSAL_TIMEOUT_MS
  )
    return "timeout";
  return "waiting";
}

export function missingVotes(p: Proposal, players: Player[]) {
  return players.filter(
    (pl) =>
      (p.eligibleVoterIds?.includes(pl.id) ?? true) &&
      pl.online &&
      p.votes[pl.id] !== "yes" &&
      p.votes[pl.id] !== "no",
  ).length;
}

export function canCastVote(p: Proposal, voterId: string, players: Player[]) {
  const player = players.find((pl) => pl.id === voterId);
  return (
    p.status === "waiting" &&
    Boolean(player?.online) &&
    (p.eligibleVoterIds?.includes(voterId) ?? true)
  );
}

export function applyApprovedMove(
  state: { revision: number; puzzle: number[]; grid: number[]; solution: number[] },
  proposal: Pick<Proposal, "index" | "value"> & { boardRevision: number },
) {
  if (
    state.revision !== proposal.boardRevision ||
    state.puzzle[proposal.index] !== 0 ||
    state.grid[proposal.index] !== 0
  ) {
    return { status: "rejected" as const, state };
  }
  const grid = [...state.grid];
  grid[proposal.index] = proposal.value;
  return {
    status: "approved" as const,
    isCorrect: state.solution[proposal.index] === proposal.value,
    state: { ...state, grid, revision: state.revision + 1 },
  };
}

export function makeRoomCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}
