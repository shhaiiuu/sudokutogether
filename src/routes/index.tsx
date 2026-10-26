import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { LoadingScreen } from "@/components/sudoku/LoadingScreen";
import { HomeScreen } from "@/components/sudoku/HomeScreen";
import { DifficultySheet } from "@/components/sudoku/DifficultySheet";
import { GameScreen, newGame, type GameState } from "@/components/sudoku/GameScreen";
import { Lobby } from "@/components/sudoku/Lobby";
import { DailyChallengesPage } from "@/components/sudoku/DailyChallengesPage";
import { ProfilePage } from "@/components/sudoku/ProfilePage";
import type { NavigationPage } from "@/components/sudoku/BottomNav";
import { RoomClient, snapshotGameToUi, type RoomConnection } from "@/lib/room-client";
import { mergeChatMessages, type ChatMessage, type RoomSnapshot } from "@/lib/room";
import type { Difficulty } from "@/lib/sudoku";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sudoku Together — Solve puzzles solo or with friends" },
      {
        name: "description",
        content:
          "A calm, modern Sudoku game. Play solo or team up with 2–4 friends on one shared puzzle and vote on every move.",
      },
      { property: "og:title", content: "Sudoku Together" },
      {
        property: "og:description",
        content: "Play Sudoku solo or solve one shared puzzle with 2–4 friends.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type Screen =
  | { name: "home" }
  | { name: "daily" }
  | { name: "profile" }
  | { name: "game"; game: GameState }
  | { name: "lobby" };
const SAVE = "st.saved";
const STATS = "st.stats";
function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const client = useMemo(() => new RoomClient(), []);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [saved, setSaved] = useState<GameState | null>(null);
  const [stats, setStats] = useState({ best: 0, streak: 0 });
  const [pickDiff, setPickDiff] = useState(false);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [connection, setConnection] = useState<RoomConnection>("online");
  const inviteCode =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "")
      : "";

  useEffect(() => {
    setSaved(read<GameState | null>(SAVE, null));
    setStats(read(STATS, { best: 0, streak: 0 }));
    let active = true;
    const timer = new Promise<void>((resolve) => window.setTimeout(resolve, 1400));
    const session = client.configured
      ? client.ensureIdentity().catch(() => null)
      : Promise.resolve(null);
    void Promise.all([timer, session]).finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [client]);

  const persist = useCallback((g: GameState | null) => {
    setSaved(g);
    try {
      if (g) localStorage.setItem(SAVE, JSON.stringify(g));
      else localStorage.removeItem(SAVE);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const onFinish = useCallback((score: number, won: boolean) => {
    setStats((s) => {
      const next = { best: Math.max(s.best, score), streak: won ? s.streak + 1 : s.streak };
      try {
        localStorage.setItem(STATS, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const start = (d: Difficulty) => {
    setPickDiff(false);
    setScreen({ name: "game", game: newGame(d) });
  };

  const navigate = useCallback((page: NavigationPage) => {
    if (page === "main") setScreen({ name: "home" });
    else if (page === "daily") setScreen({ name: "daily" });
    else setScreen({ name: "profile" });
  }, []);

  const watchRoom = useCallback(
    (next: RoomSnapshot) => {
      setRoom(next);
      setConnection("reconnecting");
      const onMessage = (message: ChatMessage) =>
        setRoom((current) =>
          current
            ? { ...current, messages: mergeChatMessages(current.messages, [message]) }
            : current,
        );
      void client
        .watch(next.roomId, setRoom, setTyping, setConnection, onMessage)
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Couldn't connect to the room");
          setConnection("offline");
        });
    },
    [client],
  );

  const handleRoom = useCallback(
    (next: RoomSnapshot | null) => {
      if (!next) {
        client.close();
        setRoom(null);
        return;
      }
      watchRoom(next);
    },
    [client, watchRoom],
  );

  const startMulti = useCallback((next: RoomSnapshot) => {
    const game = snapshotGameToUi(next);
    if (!game) {
      toast.error("The server has not published a game state yet.");
      return;
    }
    setRoom(next);
    setScreen({ name: "game", game });
  }, []);

  const home = useCallback(async () => {
    await client.leaveRoom();
    setRoom(null);
    setTyping(null);
    setConnection("online");
    setScreen({ name: "home" });
  }, [client]);

  if (!ready) return <LoadingScreen />;
  return (
    <>
      <Toaster position="top-center" />
      {screen.name === "home" && (
        <>
          <HomeScreen
            streak={stats.streak}
            best={stats.best}
            saved={saved}
            onContinue={() => saved && setScreen({ name: "game", game: saved })}
            onNewGame={() => setPickDiff(true)}
            onMultiplayer={() => setScreen({ name: "lobby" })}
            onEvent={start}
            onNavigate={navigate}
          />
          <DifficultySheet open={pickDiff} onClose={() => setPickDiff(false)} onPick={start} />
        </>
      )}
      {screen.name === "daily" && <DailyChallengesPage onNavigate={navigate} />}
      {screen.name === "profile" && <ProfilePage onNavigate={navigate} />}
      {screen.name === "lobby" && (
        <Lobby
          client={client}
          room={room}
          initialCode={inviteCode}
          onBack={home}
          onRoom={handleRoom}
          onStart={startMulti}
        />
      )}
      {screen.name === "game" && (
        <GameScreen
          key={room?.game?.puzzle.join("") ?? screen.game.solution.join("")}
          initial={screen.game}
          room={room}
          roomClient={room ? client : undefined}
          players={room?.players}
          youId={room?.players.find((p) => p.isYou)?.id}
          typing={typing}
          connection={connection}
          best={stats.best}
          onHome={home}
          onChange={room ? undefined : persist}
          onFinish={onFinish}
        />
      )}
    </>
  );
}
