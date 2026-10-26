import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  MessageCircle,
  Pause,
  RefreshCw,
  Settings as Cog,
  Trophy,
} from "lucide-react";
import {
  conflicts as findConflicts,
  formatTime,
  generatePuzzle,
  peers,
  POINTS,
  type Difficulty,
} from "@/lib/sudoku";
import type { Player, Proposal, RoomSnapshot } from "@/lib/room";
import { RoomClient, type RoomConnection } from "@/lib/room-client";
import { SudokuBoard } from "./SudokuBoard";
import { GameControls, NumberPad } from "./GameControls";
import { DifficultySheet } from "./DifficultySheet";
import { CompleteDialog, PauseDialog, SettingsDialog, type Settings } from "./Dialogs";
import { PlayerBar } from "./PlayerList";
import { ProposalPanel } from "./ProposalPanel";
import { ChatPanel, type ChatMessage } from "./ChatPanel";
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
) {
  if (selected === null || givens[selected]) return false;
  if (grid[selected]) return !multiplayer && grid[selected] !== solution[selected];
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
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(room?.messages ?? []);
  const [unread, setUnread] = useState(0);
  const dismissedProposal = useRef<string | null>(null);
  const prevOnline = useRef<Record<string, boolean>>({});

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
      difficulty: room.difficulty,
    }));
    setMessages(room.messages);
    if (room.status === "completed") setDone("won");
    if (!room.proposal) setProposal(null);
    else if (dismissedProposal.current !== room.proposal.id) setProposal(room.proposal);
  }, [multi, room]);
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
        ? new Set<number>()
        : new Set(g.grid.flatMap((v, i) => (v && !g.puzzle[i] && v !== g.solution[i] ? [i] : []))),
    [g, multi],
  );
  const givens = useMemo(() => g.puzzle.map(Boolean), [g.puzzle]);
  const running = !paused && !done && !showSettings && !showDiff;
  const myId = youId ?? roster.find((p) => p.isYou)?.id ?? "you";

  useEffect(() => {
    if (!running || multi) return;
    const t = setInterval(() => setG((s) => ({ ...s, elapsed: s.elapsed + 1 })), 1000);
    return () => clearInterval(t);
  }, [multi, running]);

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
    if (!multi || !room || !roomClient || proposal?.status === "waiting") return;
    void roomClient
      .proposeMove(room.roomId, index, value)
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Move proposal failed"),
      );
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
    if (multi) propose(sel, n);
    else {
      pushHistory();
      applyValue(sel, n);
    }
  };

  const vote = (v: "yes" | "no") => {
    if (!multi || !room || !roomClient || !proposal?.id) return;
    void roomClient
      .vote(room.roomId, proposal.id, v)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Vote failed"));
  };

  const sendChat = (text: string) => {
    if (!multi || !room || !roomClient) return;
    void roomClient
      .sendMessage(room.roomId, text)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Message failed"));
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setG((s) => ({ ...s, grid: last.grid, notes: last.notes }));
  };
  const canErase = canEraseCell(sel, givens, g.grid, g.solution, g.notes, multi);
  const erase = () => {
    if (!canErase || sel === null) return;
    if (multi) {
      if (!room || !roomClient) return;
      void roomClient
        .clearNotes(room.roomId, sel)
        .then((snapshot) => {
          if (snapshot.game) setG((s) => ({ ...s, notes: snapshot.game!.notes }));
        })
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : "Couldn't erase notes"),
        );
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
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col bg-card sm:my-4 sm:rounded-3xl sm:shadow-soft">
        <header className="grid grid-cols-[auto_1fr_auto] items-center px-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button onClick={onHome} aria-label="Back to home" className={iconBtn}>
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
              {multi ? "—" : settings.showMistakes ? `${g.mistakes}/${MAX_MISTAKES}` : g.mistakes}
            </dd>
          </div>
        </dl>

        <div
          className={cn(
            "mx-auto w-full max-w-[min(100%,calc(100dvh-20rem))] px-1.5",
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
            pendingCell={proposal?.status === "waiting" ? proposal : null}
            highlightRelated={settings.highlightRelated}
            highlightSame={settings.highlightSame}
            onSelect={setSel}
          />
        </div>
        {multi && notesOn && (
          <p className="px-4 pt-2 text-center text-xs text-muted-foreground">
            Shared notes are tentative candidates for discussion — they don't need a vote.
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
          {multi && proposal && (
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
                if (room && roomClient && proposal.id)
                  void roomClient
                    .cancelProposal(room.roomId, proposal.id)
                    .catch((error) =>
                      toast.error(error instanceof Error ? error.message : "Cancel failed"),
                    );
              }}
            />
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

      {multi && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          aria-label="Open chat"
          className={cn(
            "fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-button transition active:scale-90",
            proposal ? "top-24" : "bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-6",
          )}
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold">
              {unread}
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
        onHome={onHome}
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
