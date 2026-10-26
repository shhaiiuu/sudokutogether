import { supabase, supabaseConfigured, ensureSupabaseSession } from "./supabase";
import type { Difficulty } from "./sudoku";
import type {
  ChatMessage,
  Player,
  Proposal,
  RoomSnapshot,
  RoomStatus,
  RoomGameState,
} from "./room";

export type RoomEvent = "snapshot" | "typing" | "connection";
export type RoomConnection = "online" | "reconnecting" | "offline";

type SnapshotListener = (snapshot: RoomSnapshot) => void;
type TypingListener = (name: string | null) => void;
type ConnectionListener = (status: RoomConnection) => void;

export class RoomClient {
  readonly configured = supabaseConfigured;
  userId: string | null = null;
  private channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
  private roomId: string | null = null;
  private heartbeat: number | undefined;
  private refreshTimer: number | undefined;
  private snapshotListener: SnapshotListener | null = null;
  private typingListener: TypingListener | null = null;
  private connectionListener: ConnectionListener | null = null;

  async ensureIdentity() {
    if (!supabase)
      throw new Error(
        "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
    const user = await ensureSupabaseSession();
    if (!user) throw new Error("Could not establish a multiplayer session.");
    this.userId = user.id;
    return user.id;
  }

  async createRoom(name: string) {
    const normalizedName = normalizePlayerName(name);
    await this.ensureIdentity();
    return this.command<RoomSnapshot>("create", { name: normalizedName });
  }

  async joinRoom(code: string, name: string) {
    const normalizedName = normalizePlayerName(name);
    await this.ensureIdentity();
    return this.command<RoomSnapshot>("join", {
      code: code.trim().toUpperCase(),
      name: normalizedName,
    });
  }

  async leaveRoom() {
    if (!this.roomId || !supabase) return;
    try {
      await this.command("leave", { roomId: this.roomId });
    } finally {
      this.close();
    }
  }

  async setReady(roomId: string, ready: boolean) {
    return this.command<RoomSnapshot>("ready", { roomId, ready });
  }
  async setDifficulty(roomId: string, difficulty: Difficulty) {
    return this.command<RoomSnapshot>("difficulty", { roomId, difficulty });
  }
  async startGame(roomId: string) {
    return this.command<RoomSnapshot>("start", { roomId });
  }
  async proposeMove(roomId: string, index: number, value: number) {
    return this.command<RoomSnapshot>("propose", { roomId, index, value });
  }
  async vote(roomId: string, proposalId: string, vote: "yes" | "no") {
    return this.command<RoomSnapshot>("vote", { roomId, proposalId, vote });
  }
  async cancelProposal(roomId: string, proposalId: string) {
    return this.command<RoomSnapshot>("cancel", { roomId, proposalId });
  }
  async toggleNote(roomId: string, index: number, value: number) {
    return this.command<RoomSnapshot>("note", { roomId, index, value });
  }
  async clearNotes(roomId: string, index: number) {
    return this.command<RoomSnapshot>("clear-notes", { roomId, index });
  }
  async sendMessage(roomId: string, text: string) {
    return this.command<RoomSnapshot>("message", { roomId, text: text.slice(0, 300) });
  }

  async watch(
    roomId: string,
    onSnapshot: SnapshotListener,
    onTyping?: TypingListener,
    onConnection?: ConnectionListener,
  ) {
    if (!supabase) throw new Error("Supabase is not configured.");
    await this.ensureIdentity();
    this.close();
    this.roomId = roomId;
    this.snapshotListener = onSnapshot;
    this.typingListener = onTyping ?? null;
    this.connectionListener = onConnection ?? null;
    const channel = this.userId
      ? supabase.channel(`sudoku-room:${roomId}`, { config: { presence: { key: this.userId } } })
      : supabase.channel(`sudoku-room:${roomId}`);
    this.channel = channel;
    const refresh = () => this.scheduleRefresh();
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proposals", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "proposal_votes" }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_notes", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId !== this.userId) this.typingListener?.(payload.name || null);
      })
      .on("presence", { event: "sync" }, () => refresh())
      .subscribe(async (status) => {
        const connection: RoomConnection =
          status === "SUBSCRIBED"
            ? "online"
            : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? "offline"
              : "reconnecting";
        this.connectionListener?.(connection);
        if (status === "SUBSCRIBED") {
          await this.touch(true);
          await this.refreshSnapshot();
        }
      });
    this.heartbeat = window.setInterval(() => {
      void this.touch(true);
      void this.refreshSnapshot();
    }, 5000);
  }

  broadcastTyping(name: string, typing: boolean) {
    if (!this.channel || !this.userId) return;
    void this.channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: this.userId, name: typing ? name : null },
    });
  }

  close() {
    if (this.heartbeat !== undefined) window.clearInterval(this.heartbeat);
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.heartbeat = undefined;
    this.refreshTimer = undefined;
    if (this.roomId && supabase && this.userId)
      void this.command("presence", { roomId: this.roomId, online: false });
    if (this.channel && supabase) void supabase.removeChannel(this.channel);
    this.channel = null;
    this.roomId = null;
    this.snapshotListener = null;
    this.typingListener = null;
    this.connectionListener = null;
  }

  private async touch(online: boolean) {
    if (!this.roomId || !this.userId) return;
    try {
      await this.command("presence", { roomId: this.roomId, online });
    } catch {
      /* heartbeat retries on the next tick */
    }
  }

  private scheduleRefresh() {
    if (this.refreshTimer !== undefined) return;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refreshSnapshot();
    }, 80);
  }

  private async refreshSnapshot() {
    if (!this.roomId) return;
    try {
      const snapshot = await this.command<RoomSnapshot>("snapshot", { roomId: this.roomId });
      this.snapshotListener?.(snapshot);
    } catch {
      /* connection banner communicates a transient failure */
    }
  }

  private async command<T = unknown>(action: string, payload: Record<string, unknown>) {
    if (!supabase)
      throw new Error(
        "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
    const { data, error } = await supabase.functions.invoke("sudoku-room", {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message || "The multiplayer server rejected the request.");
    if (!data?.ok) throw new Error(data?.error || "The multiplayer server rejected the request.");
    return data.data as T;
  }
}

export function playerNameError(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Please enter your name.";
  if (trimmed.length > 32) return "Name must be 32 characters or fewer.";
  if (!trimmed.replace(/[^\p{L}\p{N} _-]/gu, ""))
    return "Enter a name using letters, numbers, spaces, - or _.";
  return null;
}

export function normalizePlayerName(name: string) {
  const error = playerNameError(name);
  if (error) throw new Error(error);
  return name.trim().replace(/[^\p{L}\p{N} _-]/gu, "");
}

export function snapshotGameToUi(snapshot: RoomSnapshot) {
  const game = snapshot.game;
  if (!game) return null;
  return {
    puzzle: game.puzzle,
    solution: Array(81).fill(0),
    grid: game.grid,
    notes: game.notes,
    mistakes: 0,
    elapsed: game.elapsed,
    difficulty: snapshot.difficulty,
    score: game.score,
    hintsLeft: 3,
  };
}

export function normalizeSnapshot(raw: unknown): RoomSnapshot {
  return raw as RoomSnapshot;
}

export type { ChatMessage, Player, Proposal, RoomSnapshot, RoomStatus, RoomGameState };
