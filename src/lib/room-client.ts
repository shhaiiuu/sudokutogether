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
type MessageListener = (message: ChatMessage) => void;

export class RoomClient {
  readonly configured = supabaseConfigured;
  userId: string | null = null;
  private channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
  private roomId: string | null = null;
  private heartbeat: number | undefined;
  private snapshotFallback: number | undefined;
  private refreshTimer: number | undefined;
  private currentSnapshot: RoomSnapshot | null = null;
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
    const snapshot = await this.command<RoomSnapshot>("propose", { roomId, index, value });
    // Immediately broadcast the new snapshot so the other player sees the proposal
    // without waiting for postgres_changes → scheduleRefresh → HTTP round-trip.
    this.broadcastSnapshot(snapshot);
    // Also push it to the local listener so the proposer's own UI updates right away.
    this.pushSnapshot(snapshot);
    return snapshot;
  }
  async vote(roomId: string, proposalId: string, vote: "yes" | "no") {
    const snapshot = await this.command<RoomSnapshot>("vote", { roomId, proposalId, vote });
    // Broadcast updated vote state so the other player sees it instantly.
    this.broadcastSnapshot(snapshot);
    // Push to local listener for immediate self-update.
    this.pushSnapshot(snapshot);
    return snapshot;
  }
  async cancelProposal(roomId: string, proposalId: string) {
    return this.command<RoomSnapshot>("cancel", { roomId, proposalId });
  }
  async toggleNote(roomId: string, index: number, value: number) {
    this.broadcastNote(index, value);
    const snapshot = await this.command<RoomSnapshot>("note", { roomId, index, value });
    this.broadcastSnapshot(snapshot);
    this.pushSnapshot(snapshot);
    return snapshot;
  }
  async clearNotes(roomId: string, index: number) {
    const snapshot = await this.command<RoomSnapshot>("clear-notes", { roomId, index });
    this.broadcastSnapshot(snapshot);
    this.pushSnapshot(snapshot);
    return snapshot;
  }
  async eraseCell(roomId: string, index: number) {
    const snapshot = await this.command<RoomSnapshot>("erase", { roomId, index });
    this.broadcastSnapshot(snapshot);
    this.pushSnapshot(snapshot);
    return snapshot;
  }
  async sendMessage(roomId: string, text: string) {
    const clean = text.slice(0, 300);
    if (this.channel && this.userId) {
      const broadcastMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        playerId: this.userId,
        text: clean,
        at: Date.now(),
        delivery: "sent",
      };
      void this.channel.send({
        type: "broadcast",
        event: "chat",
        payload: broadcastMsg,
      });
    }
    return this.command<RoomSnapshot>("message", { roomId, text: clean });
  }

  broadcastReady(roomId: string, ready: boolean) {
    if (!this.channel || !this.userId) return;
    void this.channel.send({
      type: "broadcast",
      event: "player-ready",
      payload: { userId: this.userId, ready },
    });
  }

  broadcastGameStart(snapshot: RoomSnapshot) {
    if (!this.channel) return;
    void this.channel.send({
      type: "broadcast",
      event: "game-start",
      payload: { snapshot },
    });
  }

  async watch(
    roomId: string,
    onSnapshot: SnapshotListener,
    onTyping?: TypingListener,
    onConnection?: ConnectionListener,
    onMessage?: MessageListener,
  ) {
    if (!supabase) throw new Error("Supabase is not configured.");
    await this.ensureIdentity();
    this.close();
    this.roomId = roomId;
    this.snapshotListener = (s) => {
      const localized = localizeSnapshot(s, this.userId);
      this.currentSnapshot = localized;
      onSnapshot(localized);
    };
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
        (payload) => {
          const oldRow = payload.old as Record<string, unknown> | undefined;
          const newRow = payload.new as Record<string, unknown> | undefined;
          // Only refresh if membership changed or ready/online/name status toggled
          if (
            payload.eventType === "INSERT" ||
            payload.eventType === "DELETE" ||
            oldRow?.["ready"] !== newRow?.["ready"] ||
            oldRow?.["online"] !== newRow?.["online"] ||
            oldRow?.["name"] !== newRow?.["name"]
          ) {
            refresh();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proposals", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proposal_votes", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_notes", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_states", filter: `room_id=eq.${roomId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        ({ new: row }) => {
          onMessage?.({
            id: String(row["id"]),
            playerId: String(row["user_id"]),
            text: String(row["text"]),
            at: Date.parse(String(row["created_at"])),
            delivery: "sent",
          });
        },
      )
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        if (payload && payload.playerId !== this.userId) {
          onMessage?.(payload as ChatMessage);
        }
      })
      .on("broadcast", { event: "player-ready" }, ({ payload }) => {
        if (payload && payload.userId !== this.userId) {
          if (this.currentSnapshot) {
            const updated: RoomSnapshot = {
              ...this.currentSnapshot,
              players: this.currentSnapshot.players.map((p) =>
                p.id === payload.userId ? { ...p, ready: Boolean(payload.ready) } : p,
              ),
            };
            this.currentSnapshot = updated;
            this.snapshotListener?.(updated);
          }
          refresh();
        }
      })
      .on("broadcast", { event: "game-start" }, ({ payload }) => {
        if (payload?.snapshot) {
          const s = payload.snapshot as RoomSnapshot;
          this.currentSnapshot = s;
          this.snapshotListener?.(s);
        }
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId !== this.userId) this.typingListener?.(payload.name || null);
      })
      .on("broadcast", { event: "proposal-opened" }, ({ payload }) => {
        if (payload && payload.from !== this.userId && payload.proposal) {
          if (this.currentSnapshot) {
            const prop = payload.proposal as Proposal;
            const updated: RoomSnapshot = {
              ...this.currentSnapshot,
              proposal: {
                ...prop,
                votes: {
                  ...prop.votes,
                  [prop.proposerId]: "yes",
                },
              },
            };
            this.currentSnapshot = updated;
            this.snapshotListener?.(updated);
          }
        }
      })
      .on("broadcast", { event: "vote-cast" }, ({ payload }) => {
        if (payload && payload.from !== this.userId) {
          if (this.currentSnapshot && this.currentSnapshot.proposal) {
            const curProp = this.currentSnapshot.proposal;
            const updated: RoomSnapshot = {
              ...this.currentSnapshot,
              proposal: {
                ...curProp,
                votes: {
                  ...curProp.votes,
                  [payload.voterId]: payload.vote,
                },
              },
            };
            this.currentSnapshot = updated;
            this.snapshotListener?.(updated);
          }
        }
      })
      .on("broadcast", { event: "proposal-cancelled" }, ({ payload }) => {
        if (payload && payload.from !== this.userId) {
          if (this.currentSnapshot) {
            const updated: RoomSnapshot = {
              ...this.currentSnapshot,
              proposal: null,
            };
            this.currentSnapshot = updated;
            this.snapshotListener?.(updated);
          }
        }
      })
      .on("broadcast", { event: "note-toggled" }, ({ payload }) => {
        if (payload && payload.from !== this.userId && this.currentSnapshot?.game) {
          const game = this.currentSnapshot.game;
          const idx = Number(payload.index);
          const val = Number(payload.value);
          const cellNotes = game.notes[idx] ?? [];
          const nextNotes = cellNotes.includes(val)
            ? cellNotes.filter((v: number) => v !== val)
            : [...cellNotes, val].sort((a: number, b: number) => a - b);
          const updatedGame: RoomGameState = {
            ...game,
            notes: game.notes.map((arr, i) => (i === idx ? nextNotes : arr)),
          };
          const updated: RoomSnapshot = {
            ...this.currentSnapshot,
            game: updatedGame,
          };
          this.currentSnapshot = updated;
          this.snapshotListener?.(updated);
        }
      })
      .on("broadcast", { event: "room-snapshot" }, ({ payload }) => {
        // Accept the snapshot broadcast by the *other* player after propose/vote.
        // This eliminates the postgres_changes → HTTP round-trip delay for them.
        if (payload && payload.from !== this.userId && payload.snapshot) {
          const s = localizeSnapshot(payload.snapshot as RoomSnapshot, this.userId);
          this.currentSnapshot = s;
          this.snapshotListener?.(s);
        }
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
          await this.channel?.track({ online: true, userId: this.userId, at: Date.now() });
          await this.touch(true);
          await this.refreshSnapshot();
        }
      });
    // Fallback heartbeat to refresh persistent last_seen_at every 15s
    this.heartbeat = window.setInterval(() => {
      void this.touch(true);
    }, 15000);
    this.snapshotFallback = window.setInterval(() => void this.refreshSnapshot(), 30000);
  }

  broadcastTyping(name: string, typing: boolean) {
    if (!this.channel || !this.userId) return;
    void this.channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: this.userId, name: typing ? name : null },
    });
  }

  broadcastProposal(proposal: Proposal) {
    if (!this.channel || !this.userId) return;
    const enriched: Proposal = {
      ...proposal,
      votes: {
        ...proposal.votes,
        [proposal.proposerId]: "yes",
      },
    };
    void this.channel.send({
      type: "broadcast",
      event: "proposal-opened",
      payload: { proposal: enriched, from: this.userId },
    });
  }

  broadcastVote(proposalId: string, voterId: string, vote: "yes" | "no") {
    if (!this.channel || !this.userId) return;
    void this.channel.send({
      type: "broadcast",
      event: "vote-cast",
      payload: { proposalId, voterId, vote, from: this.userId },
    });
  }

  broadcastProposalCancel(proposalId: string) {
    if (!this.channel || !this.userId) return;
    void this.channel.send({
      type: "broadcast",
      event: "proposal-cancelled",
      payload: { proposalId, from: this.userId },
    });
  }

  broadcastNote(index: number, value: number) {
    if (!this.channel || !this.userId) return;
    void this.channel.send({
      type: "broadcast",
      event: "note-toggled",
      payload: { index, value, from: this.userId },
    });
  }

  /** Broadcast the current room snapshot to all channel subscribers instantly.
   *  Used after propose/vote so the other player sees the new state without
   *  waiting for the postgres_changes → scheduleRefresh → HTTP round-trip.
   */
  broadcastSnapshot(snapshot: RoomSnapshot) {
    if (!this.channel || !this.userId) return;
    // Strip isYou: true before broadcasting so receivers localize it to their own userId.
    const sanitizedSnapshot: RoomSnapshot = {
      ...snapshot,
      players: snapshot.players.map((p) => ({
        ...p,
        isYou: false,
      })),
    };
    void this.channel.send({
      type: "broadcast",
      event: "room-snapshot",
      payload: { snapshot: sanitizedSnapshot, from: this.userId },
    });
  }

  /** Push a snapshot directly to the local listener (no network call).
   *  Used to update the proposer's own UI immediately after a propose/vote resolves.
   */
  pushSnapshot(snapshot: RoomSnapshot) {
    const localized = localizeSnapshot(snapshot, this.userId);
    this.currentSnapshot = localized;
    this.snapshotListener?.(localized);
  }

  close() {
    if (this.heartbeat !== undefined) window.clearInterval(this.heartbeat);
    if (this.snapshotFallback !== undefined) window.clearInterval(this.snapshotFallback);
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.heartbeat = undefined;
    this.snapshotFallback = undefined;
    this.refreshTimer = undefined;
    if (this.roomId && supabase && this.userId)
      void this.command("presence", { roomId: this.roomId, online: false });
    if (this.channel && supabase) void supabase.removeChannel(this.channel);
    this.channel = null;
    this.roomId = null;
    this.currentSnapshot = null;
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
      this.currentSnapshot = snapshot;
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
    if (error) {
      let serverErrorMsg = error.message;
      try {
        if ("context" in error && error.context) {
          const res = error.context as Response;
          if (typeof res.json === "function") {
            const body = (await res.json()) as { error?: string };
            if (body?.error) serverErrorMsg = body.error;
          }
        }
      } catch {
        /* fallback to error.message */
      }
      throw new Error(serverErrorMsg || "The multiplayer server rejected the request.");
    }
    if (!data?.ok) throw new Error(data?.error || "The multiplayer server rejected the request.");
    return data.data as T;
  }
}

export function playerNameError(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Enter your name before continuing.";
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

export function localizeSnapshot(snapshot: RoomSnapshot, myUserId: string | null): RoomSnapshot {
  if (!myUserId || !snapshot) return snapshot;
  return {
    ...snapshot,
    players: snapshot.players.map((p) => ({
      ...p,
      isYou: p.id === myUserId,
    })),
  };
}

export type { ChatMessage, Player, Proposal, RoomSnapshot, RoomStatus, RoomGameState };
