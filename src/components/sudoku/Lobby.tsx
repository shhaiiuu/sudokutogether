import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Share2, Users, LogIn, Info } from "lucide-react";
import { toast } from "sonner";
import { ALL_LEVELS, type Difficulty } from "@/lib/sudoku";
import { MAX_PLAYERS, type RoomSnapshot } from "@/lib/room";
import { normalizePlayerName, playerNameError, RoomClient } from "@/lib/room-client";
import { PlayerRow } from "./PlayerList";
import { PrimaryButton, SecondaryButton } from "./Sheet";
import { LeaveRoomDialog } from "./Dialogs";
import { cn } from "@/lib/utils";

export function Lobby({
  client,
  room,
  initialCode = "",
  onBack,
  onRoom,
  onStart,
}: {
  client: RoomClient;
  room: RoomSnapshot | null;
  initialCode?: string;
  onBack: () => void;
  onRoom: (room: RoomSnapshot | null) => void;
  onStart: (room: RoomSnapshot) => void;
}) {
  const [joinInput, setJoinInput] = useState(initialCode.toUpperCase());
  const [name, setName] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("st.playerName") || "",
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const started = useRef<string | null>(null);
  const stage = room ? "room" : "choose";
  const currentRoom = room!;
  const me = room?.players.find((p) => p.isYou);
  const isHost = me?.host ?? false;
  const allReady = Boolean(
    room && room.players.length >= 2 && room.players.every((p) => p.ready && p.online),
  );

  useEffect(() => {
    if (!room || room.status !== "playing" || !room.game || started.current === room.roomId) return;
    started.current = room.roomId;
    onStart(room);
  }, [onStart, room]);

  useEffect(() => {
    if (!room || room.status !== "waiting") return;
    const interval = window.setInterval(() => {
      void client.refresh().then((snap) => {
        if (snap) onRoom(snap);
      });
    }, 1500);
    return () => window.clearInterval(interval);
  }, [client, onRoom, room?.status, room?.roomId]);

  const validatedName = () => {
    const error = playerNameError(name);
    setNameError(error);
    if (error) return null;
    return normalizePlayerName(name);
  };

  const create = async () => {
    const enteredName = validatedName();
    if (busy || !enteredName) return;
    setBusy(true);
    try {
      const next = await client.createRoom(enteredName);
      localStorage.setItem("st.playerName", enteredName);
      onRoom(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create room");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const enteredName = validatedName();
    if (busy || joinInput.length !== 6 || !enteredName) return;
    setBusy(true);
    try {
      const next = await client.joinRoom(joinInput, enteredName);
      localStorage.setItem("st.playerName", enteredName);
      onRoom(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't join room");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await client.leaveRoom();
    } finally {
      onRoom(null);
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy — select it manually");
    }
  };

  const inviteLink =
    typeof window !== "undefined" && room ? `${window.location.origin}/?room=${room.code}` : "";

  return (
    <div className="app-backdrop flex h-dvh flex-col overflow-hidden">
      <header className="grid grid-cols-[auto_1fr_auto] items-center px-3 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={stage === "room" ? () => setShowLeaveDialog(true) : onBack}
          aria-label="Back"
          className="rounded-full p-2 text-primary"
          disabled={busy}
        >
          <ArrowLeft className="h-7 w-7" />
        </button>
        <h1 className="text-center text-xl font-extrabold">
          <span className="text-foreground">Play with </span>
          <span className="text-primary"> Friends</span>
        </h1>
        <span className="w-11" />
      </header>

      <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col gap-3 sm:gap-2.5 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="flex items-start gap-2 rounded-2xl bg-accent px-3 py-2 text-xs text-accent-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Live rooms use Supabase for membership,
          puzzle state, votes, presence, and chat. Your guest identity is private to this room.
        </p>
        {!client.configured && (
          <p className="rounded-2xl bg-warning/15 px-3 py-2 text-xs text-warning">
            Multiplayer is not configured in this build. Add the two VITE_SUPABASE values from
            `.env.example` after deploying the included Supabase migration and Edge Function.
          </p>
        )}

        {stage === "choose" ? (
          <>
            <section className="rounded-3xl bg-card p-5 shadow-soft">
              <label htmlFor="player-name" className="font-bold">
                Enter your name
              </label>
              <input
                id="player-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Your name"
                maxLength={40}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "player-name-error" : undefined}
                className="mt-3 min-h-12 w-full rounded-2xl bg-muted px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {nameError && (
                <p id="player-name-error" className="mt-2 text-sm text-destructive" role="alert">
                  {nameError}
                </p>
              )}
            </section>
            <section className="flex flex-col items-center gap-3 rounded-3xl bg-card p-6 text-center shadow-soft">
              <Users className="h-12 w-12 text-primary" />
              <h2 className="text-lg font-bold">Solve one puzzle together</h2>
              <p className="text-sm text-muted-foreground">
                2–4 players share a board. Every number needs everyone's approval before it's
                placed.
              </p>
              <PrimaryButton onClick={create} disabled={busy || !client.configured}>
                {busy ? "Connecting…" : "Create Room"}
              </PrimaryButton>
            </section>
            <section className="rounded-3xl bg-card p-6 shadow-soft">
              <label htmlFor="room-code" className="font-bold">
                Join with a code
              </label>
              <div className="mt-3 flex gap-2">
                <input
                  id="room-code"
                  value={joinInput}
                  onChange={(e) =>
                    setJoinInput(
                      e.target.value
                        .replace(/[^a-z0-9]/gi, "")
                        .slice(0, 6)
                        .toUpperCase(),
                    )
                  }
                  placeholder="ABC123"
                  autoCapitalize="characters"
                  className="min-h-12 min-w-0 flex-1 rounded-2xl bg-muted px-4 text-center text-lg font-bold uppercase tracking-[0.3em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  onClick={join}
                  disabled={busy || joinInput.length !== 6 || !client.configured}
                  className="flex min-h-12 items-center gap-1 rounded-2xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-40"
                >
                  <LogIn className="h-5 w-5" /> {busy ? "…" : "Join"}
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="rounded-3xl bg-card p-4 sm:p-3.5 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Room code
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-3xl font-extrabold tracking-[0.25em]">{currentRoom.code}</p>
                <button
                  onClick={() => copy(currentRoom.code, "Room code")}
                  aria-label="Copy room code"
                  className="rounded-full bg-accent p-2.5 text-primary"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
              <button
                onClick={() => copy(inviteLink, "Invite link")}
                className="mt-2.5 flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-muted text-sm font-semibold text-primary"
              >
                <Share2 className="h-4 w-4" /> Share invite link
              </button>
            </section>

            <section className="rounded-3xl bg-card p-4 sm:p-3.5 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">Players</h2>
                <span className="text-sm text-muted-foreground">
                  {currentRoom.players.length}/{MAX_PLAYERS}
                </span>
              </div>
              <ul className="divide-y">
                {currentRoom.players.map((p) => (
                  <PlayerRow key={p.id} player={p} showReady />
                ))}
              </ul>
              {currentRoom.players.length < 2 && (
                <p className="py-1.5 text-center text-sm text-muted-foreground animate-pulse">
                  Waiting for players to join…
                </p>
              )}
            </section>

            <section className="rounded-3xl bg-card p-4 sm:p-3.5 shadow-soft">
              <h2 className="font-bold">Difficulty</h2>
              <p className="text-xs text-muted-foreground">
                {isHost ? "You're the host — pick the puzzle." : "Chosen by the host"}
              </p>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {ALL_LEVELS.map(({ level, available, note }) => (
                  <button
                    key={level}
                    disabled={!isHost || !available || busy}
                    onClick={() => {
                      setBusy(true);
                      void client
                        .setDifficulty(currentRoom.roomId, level as Difficulty)
                        .then(onRoom)
                        .catch((error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Couldn't change difficulty",
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                    aria-pressed={currentRoom.difficulty === level}
                    title={available ? undefined : note}
                    className={cn(
                      "flex min-h-10 sm:min-h-11 flex-col items-center justify-center rounded-2xl text-xs sm:text-sm font-bold transition",
                      currentRoom.difficulty === level
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-primary",
                      !available && "text-muted-foreground/60",
                      !isHost && currentRoom.difficulty !== level && "opacity-40",
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </section>

            <div className="mt-auto">
              {isHost ? (
                <PrimaryButton
                  disabled={!allReady || busy}
                  onClick={() => {
                    setBusy(true);
                    void client
                      .startGame(currentRoom.roomId)
                      .then((next) => {
                        client.broadcastGameStart(next);
                        onRoom(next);
                        onStart(next);
                      })
                      .catch((error) =>
                        toast.error(error instanceof Error ? error.message : "Couldn't start game"),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  {allReady
                    ? busy
                      ? "Starting…"
                      : "Start Game"
                    : "Waiting for everyone to be ready"}
                </PrimaryButton>
              ) : (
                <SecondaryButton
                  disabled={busy}
                  onClick={() => {
                    const nextReady = !me?.ready;
                    if (me) {
                      const optimisticRoom: RoomSnapshot = {
                        ...currentRoom,
                        players: currentRoom.players.map((p) =>
                          p.id === me.id ? { ...p, ready: nextReady } : p,
                        ),
                      };
                      onRoom(optimisticRoom);
                    }
                    client.broadcastReady(currentRoom.roomId, nextReady);
                    setBusy(true);
                    void client
                      .setReady(currentRoom.roomId, nextReady)
                      .then(onRoom)
                      .catch((error) => {
                        onRoom(currentRoom);
                        toast.error(
                          error instanceof Error ? error.message : "Couldn't update readiness",
                        );
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  {me?.ready ? "Ready ✓ — waiting for host" : "I'm Ready"}
                </SecondaryButton>
              )}
            </div>
          </>
        )}
      </div>

      <LeaveRoomDialog
        open={showLeaveDialog}
        leaving={busy}
        onStay={() => setShowLeaveDialog(false)}
        onLeave={async () => {
          setShowLeaveDialog(false);
          await leave();
        }}
      />
    </div>
  );
}
