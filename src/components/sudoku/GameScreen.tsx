import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  MessageCircle,
  Pause,
  RefreshCw,
  Settings as Cog,
  Trophy,
  X,
} from "lucide-react";
import {
  conflicts as findConflicts,
  formatTime,
  generatePuzzle,
  peers,
  POINTS,
  type Difficulty,
} from "@/lib/sudoku";
import {
  mergeChatMessages,
  type ChatMessage,
  type Player,
  type Proposal,
  type RoomSnapshot,
} from "@/lib/room";
import { RoomClient, type RoomConnection } from "@/lib/room-client";
import { SudokuBoard } from "./SudokuBoard";
import { GameControls, NumberPad } from "./GameControls";
import { DifficultySheet } from "./DifficultySheet";
import {
  CompleteDialog,
  LeaveGameDialog,
  PauseDialog,
  SettingsDialog,
  type Settings,
} from "./Dialogs";
import { PlayerBar } from "./PlayerList";
import { ProposalPanel } from "./ProposalPanel";
import { ChatPanel } from "./ChatPanel";
import { playProposalSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface GameState {
  puzzle: number[];
  solution: number[];
  grid: number[];
  notes: number[][];
  mistakes: number;
  elapsed: number;
  difficulty: Difficulty;
  score: number;
  hintsLeft: number;
}

export function newGame(d: Difficulty): GameState {
  const { puzzle, solution } = generatePuzzle(d);
  return {
    puzzle,
    solution,
    grid: [...puzzle],
    notes: Array.from({ length: 81 }, () => []),
    mistakes: 0,
    elapsed: 0,
    difficulty: d,
    score: 0,
    hintsLeft: 3,
  };
}

const MAX_MISTAKES = 3;

export function canEraseCell(
  selected: number | null,
  givens: boolean[],
  grid: number[],
  solution: number[],
  notes: number[][],
  multiplayer = false,
  erasable?: boolean[] | undefined,
) {
  if (selected === null || givens[selected]) return false;
  if (grid[selected])
    return multiplayer ? erasable?.[selected] === true : grid[selected] !== solution[selected];
  return (notes[selected]?.length ?? 0) > 0;
}

export function GameScreen({
  initial,
  best,
  players,
  room,
  roomClient,
  youId,
  typing = null,
  connection = "online",
  onHome,
  onChange,
  onFinish,
}: {
  initial: GameState;
  best: number;
  players?: Player[] | undefined;
  room?: RoomSnapshot | null;
  roomClient?: RoomClient | undefined;
  youId?: string | undefined;
  typing?: string | null | undefined;
  connection?: RoomConnection | undefined;
  onHome: () => void;
  onChange?: ((g: GameState | null) => void) | undefined;
  onFinish: (score: number, won: boolean) => void;
}) {
  const multi = Boolean(room && roomClient);
  const [g, setG] = useState(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [notesOn, setNotesOn] = useState(false);
  const [history, setHistory] = useState<Pick<GameState, "grid" | "notes">[]>([]);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState<null | "won" | "lost">(null);
  const [shakeCell, setShakeCell] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>({
    sound: false,
    highlightRelated: true,
    highlightSame: true,
    showMistakes: true,
  });
  const [roster, setRoster] = useState<Player[]>(room?.players ?? players ?? []);
  const [proposal, setProposal] = useState<Proposal | null>(room?.proposal ?? null);
  const [optimisticProposal, setOptimisticProposal] = useState<{
    index: number;
    value: number;
  } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(room?.messages ?? []);
  const [unread, setUnread] = useState(0);
  const dismissedProposal = useRef<string | null>(null);
  const lastSoundProposalId = useRef<string | null>(null);
  const proposalRef = useRef<HTMLDivElement>(null);
  const prevOnline = useRef<Record<string, boolean>>({});
  const myId = youId ?? roster.find((p) => p.isYou)?.id ?? "you";
  const seenChatIds = useRef(
    new Set((room?.messages ?? []).filter((m) => m.playerId === myId).map((m) => m.id)),
  );

  useEffect(() => setRoster(room?.players ?? players ?? []), [players, room?.players]);
  useEffect(() => {
    if (!multi || !room?.game) return;
    setG((current) => ({
      ...current,
      puzzle: room.game!.puzzle,
      grid: room.game!.grid,
      notes: room.game!.notes,
      elapsed: room.game!.elapsed,
      score: room.game!.score,
      mistakes: room.game!.mistakes ?? current.mistakes,
      difficulty: room.difficulty,
    }));
    if (room.status === "completed") setDone("won");
    else if (settings.showMistakes && (room.game?.mistakes ?? 0) >= MAX_MISTAKES) setDone("lost");
    if (!room.proposal) {
      setProposal(null);
      setOptimisticProposal(null);
    } else if (dismissedProposal.current !== room.proposal.id) {
      setProposal(room.proposal);
      setOptimisticProposal(null);
    }
  }, [multi, room, settings.showMistakes]);

  useEffect(() => {
    if (!proposal || proposal.status !== "waiting" || !proposal.id) return;
    if (lastSoundProposalId.current !== proposal.id) {
      lastSoundProposalId.current = proposal.id;
      playProposalSound();
    }
  }, [proposal]);

  useEffect(() => {
    if (proposal && proposal.status === "waiting") {
      proposalRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [proposal]);

  useEffect(() => {
    if (room?.messages) {
      setMessages((current) => mergeChatMessages(current, room.messages));
    }
  }, [room?.messages]);
  useEffect(() => {
    for (const p of roster) {
      const was = prevOnline.current[p.id];
      if (was !== undefined && was !== p.online)
        (p.online ? toast.success : toast.warning)(
          `${p.name} ${p.online ? "rejoined" : "disconnected"}`,
        );
      prevOnline.current[p.id] = p.online;
    }
  }, [roster]);

  const conflictSet = useMemo(() => findConflicts(g.grid), [g.grid]);
  const wrong = useMemo(
    () =>
      multi
        ? new Set(room?.game?.erasable?.flatMap((e, i) => (e && g.grid[i] ? [i] : [])) ?? [])
        : new Set(g.grid.flatMap((v, i) => (v && !g.puzzle[i] && v !== g.solution[i] ? [i] : []))),
    [g, multi, room?.game?.erasable],
  );
  const givens = useMemo(() => g.puzzle.map(Boolean), [g.puzzle]);
  const running = !paused && !done && !showSettings && !showDiff;

  useEffect(() => {
    if (chatOpen) {
      setUnread(0);
      for (const message of messages) seenChatIds.current.add(message.id);
      return;
    }
    const unreadCount = messages.filter(
      (m) => m.playerId !== myId && m.delivery !== "sending" && !seenChatIds.current.has(m.id),
    ).length;
    setUnread(unreadCount);
  }, [chatOpen, messages, myId]);

  useEffect(() => {
    if (!running || multi) return;
    const t = setInterval(() => setG((s) => ({ ...s, elapsed: s.elapsed + 1 })), 1000);
    return () => clearInterval(t);
  }, [multi, running]);

  useEffect(() => {
    if (done) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [done]);

  useEffect(() => {
    if (multi) return;
    onChange?.(done ? null : g);
  }, [g, done, multi, onChange]);

  const finish = useCallback(
    (won: boolean, s: GameState) => {
      setDone(won ? "won" : "lost");
      const bonus = won ? Math.max(0, 1000 - s.elapsed) * (POINTS[s.difficulty] / 50) : 0;
      const total = Math.round(s.score + bonus);
      setG({ ...s, score: total });
      onFinish(total, won);
    },
    [onFinish],
  );

  const applyValue = useCallback(
    (i: number, n: number) => {
      setG((s) => {
        const grid = [...s.grid];
        grid[i] = n;
        const notes = s.notes.map((x, j) =>
          j !== i && peers(i).includes(j) ? x.filter((v) => v !== n) : j === i ? [] : x,
        );
        const correct = s.solution[i] === n;
        const next = {
          ...s,
          grid,
          notes,
          mistakes: correct ? s.mistakes : s.mistakes + 1,
          score: correct ? s.score + POINTS[s.difficulty] : s.score,
        };
        if (!correct) setShakeCell(i);
        if (grid.every((v, j) => v === s.solution[j])) setTimeout(() => finish(true, next), 300);
        else if (settings.showMistakes && next.mistakes >= MAX_MISTAKES)
          setTimeout(() => finish(false, next), 300);
        return next;
      });
    },
    [finish, settings.showMistakes],
  );

  const pushHistory = () => setHistory((h) => [...h.slice(-50), { grid: g.grid, notes: g.notes }]);

  const propose = (index: number, value: number) => {
    if (!multi || !room || !roomClient || proposal?.status === "waiting" || optimisticProposal)
      return;

    const optimistic: Proposal = {
      id: `temp-${Date.now()}`,
      index,
      value,
      proposerId: myId,
      status: "waiting",
      createdAt: Date.now(),
      votes: Object.fromEntries(roster.map((p) => [p.id, p.id === myId ? "yes" : "pending"])),
    };
    setOptimisticProposal({ index, value });
    setProposal(optimistic);

    // Fast-path: broadcast optimistic proposal to opponents in ~20ms
    roomClient.broadcastProposal(optimistic);

    void roomClient
      .proposeMove(room.roomId, index, value)
      .then((serverSnapshot) => {
        if (serverSnapshot?.proposal) {
          setProposal(serverSnapshot.proposal);
        }
        setOptimisticProposal(null);
      })
      .catch((error) => {
        setProposal(null);
        setOptimisticProposal(null);
        roomClient.broadcastProposalCancel(optimistic.id || "");
        toast.error(error instanceof Error ? error.message : "Move proposal failed");
      });
  };

  const enter = (n: number) => {
    if (sel === null || givens[sel] || done) return;
    if (notesOn) {
      if (g.grid[sel]) return;
      if (multi && room && roomClient)
        void roomClient
          .toggleNote(room.roomId, sel, n)
          .catch((error) =>
            toast.error(error instanceof Error ? error.message : "Note update failed"),
          );
      else {
        pushHistory();
        setG((s) => ({
          ...s,
          notes: s.notes.map((x, j) =>
            j === sel ? (x.includes(n) ? x.filter((v) => v !== n) : [...x, n].sort()) : x,
          ),
        }));
      }
      return;
    }
    if (g.grid[sel] === n) return;
    if (multi) {
      if (proposal?.status === "waiting" || optimisticProposal) return;
      propose(sel, n);
    } else {
      pushHistory();
      applyValue(sel, n);
    }
  };

  const vote = (v: "yes" | "no") => {
    if (!multi || !room || !roomClient || !proposal?.id) return;
    const prevProposal = proposal;
    const updatedProp: Proposal = {
      ...proposal,
      votes: {
        ...proposal.votes,
        [myId]: v,
      },
    };
    // 1. Optimistic local update (0ms)
    setProposal(updatedProp);

    // 2. Realtime broadcast to opponents (~20ms)
    roomClient.broadcastVote(proposal.id, myId, v);

    // 3. Server-side authoritative resolution
    void roomClient.vote(room.roomId, proposal.id, v).catch((error) => {
      setProposal(prevProposal);
      toast.error(error instanceof Error ? error.message : "Vote failed");
    });
  };

  const sendChat = (text: string, retryId?: string) => {
    if (!multi || !room || !roomClient) return;
    const id = retryId ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: ChatMessage = {
      id,
      playerId: myId,
      text,
      at: Date.now(),
      delivery: "sending",
    };
    seenChatIds.current.add(id);
    setMessages((current) => {
      const withoutRetry = current.filter((message) => message.id !== id);
      return [...withoutRetry, optimistic].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    });
    void roomClient
      .sendMessage(room.roomId, text)
      .then((snapshot) => setMessages((current) => mergeChatMessages(current, snapshot.messages)))
      .catch((error) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === id ? { ...message, delivery: "failed" } : message,
          ),
        );
        toast.error(error instanceof Error ? error.message : "Message failed");
      });
  };

  const retryChat = (message: ChatMessage) => {
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? { ...item, delivery: "sending" } : item)),
    );
    if (!multi || !room || !roomClient) return;
    void roomClient
      .sendMessage(room.roomId, message.text)
      .then((snapshot) => setMessages((current) => mergeChatMessages(current, snapshot.messages)))
      .catch(() =>
        setMessages((current) =>
          current.map((item) => (item.id === message.id ? { ...item, delivery: "failed" } : item)),
        ),
      );
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setG((s) => ({ ...s, grid: last.grid, notes: last.notes }));
  };
  const canErase = canEraseCell(
    sel,
    givens,
    g.grid,
    g.solution,
    g.notes,
    multi,
    room?.game?.erasable,
  );
  const erase = () => {
    if (!canErase || sel === null) return;
    if (multi) {
      if (!room || !roomClient) return;
      const targetIndex = sel;
      const isGridEntry = Boolean(g.grid[targetIndex]);
      // Optimistic update
      const previousGrid = g.grid;
      const previousNotes = g.notes;
      setG((s) => ({
        ...s,
        grid: isGridEntry ? s.grid.map((v, j) => (j === targetIndex ? 0 : v)) : s.grid,
        notes: s.notes.map((x, j) => (j === targetIndex ? [] : x)),
      }));

      const request = isGridEntry
        ? roomClient.eraseCell(room.roomId, targetIndex)
        : roomClient.clearNotes(room.roomId, targetIndex);

      void request
        .then((snapshot) => {
          if (snapshot?.game) {
            setG((s) => ({
              ...s,
              grid: snapshot.game!.grid,
              notes: snapshot.game!.notes,
            }));
          }
        })
        .catch((error) => {
          // Revert optimistic update on failure
          setG((s) => ({ ...s, grid: previousGrid, notes: previousNotes }));
          toast.error(error instanceof Error ? error.message : "Couldn't erase cell");
        });
      return;
    }
    pushHistory();
    setG((s) => ({
      ...s,
      grid: s.grid.map((v, j) => (j === sel ? 0 : v)),
      notes: s.notes.map((x, j) => (j === sel ? [] : x)),
    }));
  };
  const hint = () => {
    if (multi) {
      toast.info("Hints are disabled in live rooms because the server keeps the solution private.");
      return;
    }
    const target =
      sel !== null && !givens[sel] && g.grid[sel] !== g.solution[sel]
        ? sel
        : g.grid.findIndex((v, i) => v !== g.solution[i]);
    if (target < 0 || g.hintsLeft <= 0) return;
    setSel(target);
    setG((s) => ({ ...s, hintsLeft: s.hintsLeft - 1 }));
    pushHistory();
    applyValue(target, g.solution[target]!);
  };
  const restart = (d: Difficulty = g.difficulty, same = false) => {
    if (multi) {
      toast.info("A live room can only restart from a new room.");
      return;
    }
    setG(
      same
        ? {
            ...g,
            grid: [...g.puzzle],
            notes: g.notes.map(() => []),
            mistakes: 0,
            elapsed: 0,
            score: 0,
            hintsLeft: 3,
          }
        : newGame(d),
    );
    setHistory([]);
    setSel(null);
    setDone(null);
    setProposal(null);
    setShowDiff(false);
  };

  const requestLeave = useCallback(() => {
    if (done) {
      void onHome();
      return;
    }
    setShowLeave(true);
  }, [done, onHome]);

  const confirmLeave = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await onHome();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't leave the game");
      setLeaving(false);
    }
  }, [leaving, onHome]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || !running) return;
      if (/^[1-9]$/.test(e.key)) enter(Number(e.key));
      else if (e.key === "Backspace" || e.key === "Delete") erase();
      else if (e.key.toLowerCase() === "n") setNotesOn((v) => !v);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        setSel((s) => {
          const i = s ?? 0;
          const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
          return Math.min(80, Math.max(0, i + d));
        });
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const filled = multi
    ? g.grid.filter((v, i) => v && !givens[i]).length
    : g.grid.filter((v, i) => v && !givens[i] && v === g.solution[i]).length;
  const toFill = givens.filter((x) => !x).length;
  const iconBtn =
    "rounded-full p-2 text-primary transition active:scale-90 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const stat = "flex flex-col text-sm text-muted-foreground";

  return (
    <div className="flex h-dvh flex-col bg-background overflow-hidden sm:py-2.5 sm:px-4">
      <div className="mx-auto flex w-full max-w-lg flex-1 min-h-0 flex-col bg-card sm:rounded-3xl sm:shadow-soft overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <header className="grid grid-cols-[auto_1fr_auto] items-center px-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button onClick={requestLeave} aria-label="Back to home" className={iconBtn}>
            <ChevronLeft className="h-8 w-8" />
          </button>
          <p className="text-center text-xl font-extrabold tabular-nums" aria-label="Progress">
            {filled}/{toFill}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                multi ? toast.info("Live rooms restart from a new room.") : setShowDiff(true)
              }
              aria-label="New puzzle or restart"
              className={iconBtn}
            >
              <RefreshCw className="h-6 w-6" />
            </button>
            <button
              onClick={() => setPaused(true)}
              aria-label="Pause"
              className={cn(iconBtn, "rounded-full border-2 border-primary p-1")}
            >
              <Pause className="h-5 w-5" />
            </button>
            <button onClick={() => setShowSettings(true)} aria-label="Settings" className={iconBtn}>
              <Cog className="h-6 w-6" />
            </button>
          </div>
        </header>

        {multi && (
          <>
            <div className="flex items-center justify-between px-4 pt-1">
              <PlayerBar players={roster} />
              <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                Live room · server synced
              </span>
            </div>
            {connection !== "online" && (
              <p className="mx-4 mt-2 rounded-full bg-warning/15 px-3 py-1 text-center text-xs font-semibold text-warning">
                {connection === "reconnecting"
                  ? "Reconnecting…"
                  : "Offline — moves wait for the server"}
              </p>
            )}
          </>
        )}

        <dl className="grid grid-cols-4 gap-1 px-3 pb-2 pt-3">
          <div className={stat}>
            <dt>{multi ? "Time" : "All Time"}</dt>
            <dd className="flex items-center gap-1 font-semibold text-foreground/70">
              {multi ? (
                formatTime(g.elapsed)
              ) : (
                <>
                  <Trophy className="h-4 w-4" />
                  {best.toLocaleString()}
                </>
              )}
            </dd>
          </div>
          <div className={cn(stat, "items-center")}>
            <dt>Difficulty</dt>
            <dd className="font-semibold text-foreground/70">{g.difficulty}</dd>
          </div>
          <div className={cn(stat, "items-center")}>
            <dt>{multi ? "Score" : formatTime(g.elapsed)}</dt>
            <dd className="font-semibold text-foreground/70">{g.score.toLocaleString()}</dd>
          </div>
          <div className={cn(stat, "items-end")}>
            <dt>Mistakes</dt>
            <dd className="font-semibold text-foreground/70">
              {settings.showMistakes ? `${g.mistakes ?? 0}/${MAX_MISTAKES}` : (g.mistakes ?? 0)}
            </dd>
          </div>
        </dl>

        <div
          className={cn(
            "mx-auto w-full max-w-[min(100%,calc(100dvh-23.5rem))] px-1.5",
            shakeCell !== null && "animate-shake",
          )}
          onAnimationEnd={() => setShakeCell(null)}
        >
          <SudokuBoard
            grid={g.grid}
            givens={givens}
            notes={multi ? g.notes.map(() => []) : g.notes}
            sharedNotes={multi ? g.notes : undefined}
            selected={sel}
            conflicts={conflictSet}
            wrong={wrong}
            pendingCell={proposal?.status === "waiting" ? proposal : optimisticProposal}
            highlightRelated={settings.highlightRelated}
            highlightSame={settings.highlightSame}
            onSelect={setSel}
          />
        </div>
        {multi && notesOn && (
          <p className="px-4 pt-1.5 text-center text-xs text-muted-foreground">
            Shared notes are tentative candidates for discussion — they don't need a vote.
          </p>
        )}

        <div className="mt-auto flex flex-col gap-1.5 sm:gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:pt-2">
          {multi && proposal && (
            <div ref={proposalRef} className="w-full">
              <ProposalPanel
                proposal={proposal}
                players={roster}
                youId={myId}
                onVote={vote}
                onDismiss={() => {
                  dismissedProposal.current = proposal.id ?? null;
                  setProposal(null);
                }}
                onCancel={() => {
                  if (room && roomClient && proposal.id) {
                    roomClient.broadcastProposalCancel(proposal.id);
                    setProposal(null);
                    setOptimisticProposal(null);
                    void roomClient
                      .cancelProposal(room.roomId, proposal.id)
                      .catch((error) =>
                        toast.error(error instanceof Error ? error.message : "Cancel failed"),
                      );
                  }
                }}
              />
            </div>
          )}
          {(!multi || !proposal) && (
            <>
              <GameControls
                notesOn={notesOn}
                hintsLeft={g.hintsLeft}
                canUndo={!multi && history.length > 0}
                canErase={canErase}
                onUndo={undo}
                onErase={erase}
                onNotes={() => setNotesOn((v) => !v)}
                onHint={hint}
                disabled={!!done}
              />
              <NumberPad
                grid={g.grid}
                onNumber={enter}
                notesOn={notesOn}
                disabled={!!done || sel === null}
              />
            </>
          )}
        </div>
      </div>

      {multi && (
        <button
          onClick={() => setChatOpen((v) => !v)}
          aria-label={chatOpen ? "Close chat" : "Open chat"}
          data-testid="chat-launcher"
          className={cn(
            "fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-button transition-all duration-300 active:scale-90",
            proposal?.status === "waiting"
              ? "top-20 sm:top-24"
              : "bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-6",
          )}
        >
          {chatOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          {!chatOpen && unread > 0 && (
            <span
              data-testid="unread-badge"
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground shadow-sm"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        players={roster}
        typing={typing}
        onSend={sendChat}
        onRetry={retryChat}
        onTyping={(isTyping) => {
          if (multi && roomClient)
            roomClient.broadcastTyping(roster.find((p) => p.isYou)?.name ?? "Player", isTyping);
        }}
      />

      <DifficultySheet
        open={showDiff}
        onClose={() => setShowDiff(false)}
        selected={g.difficulty}
        title="New game"
        onPick={(d) => restart(d)}
        onRestart={() => restart(g.difficulty, true)}
      />
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={setSettings}
      />
      <PauseDialog
        open={paused}
        elapsed={g.elapsed}
        difficulty={g.difficulty}
        onResume={() => setPaused(false)}
        onHome={requestLeave}
      />
      <LeaveGameDialog
        open={showLeave}
        leaving={leaving}
        onStay={() => setShowLeave(false)}
        onLeave={confirmLeave}
      />
      <CompleteDialog
        open={!!done}
        won={done === "won"}
        shared={multi}
        elapsed={g.elapsed}
        difficulty={g.difficulty}
        score={g.score}
        onAgain={() => restart(g.difficulty)}
        onHome={onHome}
      />
    </div>
  );
}
