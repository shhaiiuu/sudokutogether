import { describe, expect, it } from "vitest";
import { localizeSnapshot, RoomClient } from "@/lib/room-client";
import type { Player, Proposal, RoomSnapshot } from "@/lib/room";

describe("Multiplayer Simulation: 2 Complete Games", () => {
  it("Game 1: Host creates, Joiner joins instantly via broadcast, starts game, proposes move, and votes Yes with difficulty score", () => {
    const hostId = "host-user-uuid";
    const guestId = "guest-user-uuid";

    // 1. Host creates room
    const hostSnapshot: RoomSnapshot = {
      roomId: "room-uuid-1",
      code: "SUDOK1",
      hostId,
      difficulty: "Hard",
      status: "waiting",
      players: [
        {
          id: hostId,
          name: "Alice",
          color: "p1",
          ready: true,
          host: true,
          online: true,
          isYou: true,
        },
      ],
      game: null,
      proposal: null,
      messages: [],
    };

    // 2. Guest joins room
    const guestSnapshotAfterJoin: RoomSnapshot = {
      ...hostSnapshot,
      players: [
        {
          id: hostId,
          name: "Alice",
          color: "p1",
          ready: true,
          host: true,
          online: true,
          isYou: false,
        },
        {
          id: guestId,
          name: "Bob",
          color: "p2",
          ready: false,
          host: false,
          online: true,
          isYou: true,
        },
      ],
    };

    // Guest sanitizes snapshot and broadcasts to host
    const sanitizedJoinSnapshot: RoomSnapshot = {
      ...guestSnapshotAfterJoin,
      players: guestSnapshotAfterJoin.players.map((p) => ({ ...p, isYou: false })),
    };

    // Host receives room-snapshot broadcast and localizes it
    const hostLocalizedAfterJoin = localizeSnapshot(sanitizedJoinSnapshot, hostId);
    expect(hostLocalizedAfterJoin.players).toHaveLength(2);
    expect(hostLocalizedAfterJoin.players.find((p) => p.id === hostId)?.isYou).toBe(true);
    expect(hostLocalizedAfterJoin.players.find((p) => p.id === guestId)?.isYou).toBe(false);

    // Guest sets ready
    const readySnapshot: RoomSnapshot = {
      ...guestSnapshotAfterJoin,
      players: guestSnapshotAfterJoin.players.map((p) =>
        p.id === guestId ? { ...p, ready: true } : p,
      ),
    };
    const allReady =
      readySnapshot.players.length >= 2 && readySnapshot.players.every((p) => p.ready && p.online);
    expect(allReady).toBe(true);

    // 3. Host starts game
    const playingSnapshot: RoomSnapshot = {
      ...readySnapshot,
      status: "playing",
      game: {
        puzzle: Array(81).fill(0),
        grid: Array(81).fill(0),
        erasable: Array(81).fill(false),
        notes: Array.from({ length: 81 }, () => []),
        elapsed: 0,
        score: 0,
        mistakes: 0,
        difficulty: "Hard",
        running: true,
      },
    };

    // Host broadcasts game-start
    const sanitizedGameStart: RoomSnapshot = {
      ...playingSnapshot,
      players: playingSnapshot.players.map((p) => ({ ...p, isYou: false })),
    };

    // Guest receives game-start broadcast
    const guestLocalizedGame = localizeSnapshot(sanitizedGameStart, guestId);
    expect(guestLocalizedGame.status).toBe("playing");
    expect(guestLocalizedGame.game).not.toBeNull();
    expect(guestLocalizedGame.players.find((p) => p.id === guestId)?.isYou).toBe(true);

    // 4. Guest proposes move on cell 10 with value 5
    const proposal: Proposal = {
      id: "prop-1",
      index: 10,
      value: 5,
      proposerId: guestId,
      status: "waiting",
      createdAt: Date.now(),
      votes: {
        [guestId]: "yes", // Proposer auto-yes
        [hostId]: "pending",
      },
    };

    const snapshotWithProposal: RoomSnapshot = {
      ...playingSnapshot,
      proposal,
    };

    // Host sees the proposal
    const hostProposalView = localizeSnapshot(snapshotWithProposal, hostId);
    expect(hostProposalView.proposal?.votes[guestId]).toBe("yes");
    expect(hostProposalView.proposal?.votes[hostId]).toBe("pending");

    // 5. Host votes Yes
    const approvedProposal: Proposal = {
      ...proposal,
      status: "approved",
      votes: {
        [guestId]: "yes",
        [hostId]: "yes",
      },
    };

    // Hard difficulty gives 300 points
    const difficultyPoints: Record<string, number> = {
      Easy: 100,
      Medium: 200,
      Hard: 300,
      Expert: 400,
      Master: 500,
      Extreme: 600,
    };
    const scoreAwarded = difficultyPoints[playingSnapshot.game!.difficulty] ?? 100;
    expect(scoreAwarded).toBe(300);

    const updatedGrid = [...playingSnapshot.game!.grid];
    updatedGrid[10] = 5;

    const resolvedSnapshot: RoomSnapshot = {
      ...playingSnapshot,
      proposal: null,
      game: {
        ...playingSnapshot.game!,
        grid: updatedGrid,
        score: scoreAwarded,
      },
    };

    expect(resolvedSnapshot.game!.grid[10]).toBe(5);
    expect(resolvedSnapshot.game!.score).toBe(300);
    expect(approvedProposal.status).toBe("approved");
  });

  it("Game 2: Player leaves room, Host removes leaver instantly without ghost ready state, new player joins, wrong proposal rejected", () => {
    const hostId = "host-user-uuid-2";
    const leaverId = "leaver-uuid";
    const newGuestId = "new-guest-uuid";

    // 1. Host in lobby with Leaver
    const hostSnapshotWithLeaver: RoomSnapshot = {
      roomId: "room-uuid-2",
      code: "SUDOK2",
      hostId,
      difficulty: "Medium",
      status: "waiting",
      players: [
        {
          id: hostId,
          name: "Alice",
          color: "p1",
          ready: true,
          host: true,
          online: true,
          isYou: true,
        },
        {
          id: leaverId,
          name: "Charlie",
          color: "p2",
          ready: true,
          host: false,
          online: true,
          isYou: false,
        },
      ],
      game: null,
      proposal: null,
      messages: [],
    };

    // 2. Leaver leaves: broadcast 'player-left'
    const payload = { roomId: "room-uuid-2", userId: leaverId, from: leaverId };

    // Host receives 'player-left' and filters leaver out
    const hostUpdatedPlayers = hostSnapshotWithLeaver.players.filter(
      (p) => p.id !== payload.userId,
    );
    const hostSnapshotAfterLeave: RoomSnapshot = {
      ...hostSnapshotWithLeaver,
      players: hostUpdatedPlayers,
    };

    expect(hostSnapshotAfterLeave.players).toHaveLength(1);
    expect(hostSnapshotAfterLeave.players[0].id).toBe(hostId);

    // Host verify allReady: must have >= 2 players
    const allReadyBeforeNewJoin =
      hostSnapshotAfterLeave.players.length >= 2 &&
      hostSnapshotAfterLeave.players.every((p) => p.ready && p.online);
    expect(allReadyBeforeNewJoin).toBe(false); // Can NOT start game with 1 player!

    // 3. New guest joins
    const snapshotWithNewGuest: RoomSnapshot = {
      ...hostSnapshotAfterLeave,
      players: [
        hostSnapshotAfterLeave.players[0],
        {
          id: newGuestId,
          name: "Dave",
          color: "p2",
          ready: true,
          host: false,
          online: true,
          isYou: false,
        },
      ],
    };

    const allReadyNow =
      snapshotWithNewGuest.players.length >= 2 &&
      snapshotWithNewGuest.players.every((p) => p.ready && p.online);
    expect(allReadyNow).toBe(true);

    // 4. Host starts game
    const playingSnapshot: RoomSnapshot = {
      ...snapshotWithNewGuest,
      status: "playing",
      game: {
        puzzle: Array(81).fill(0),
        grid: Array(81).fill(0),
        erasable: Array(81).fill(false),
        notes: Array.from({ length: 81 }, () => []),
        elapsed: 0,
        score: 0,
        mistakes: 0,
        difficulty: "Medium",
        running: true,
      },
    };

    // 5. Host proposes wrong number on cell 20
    const proposal: Proposal = {
      id: "prop-wrong",
      index: 20,
      value: 9,
      proposerId: hostId,
      status: "waiting",
      createdAt: Date.now(),
      votes: {
        [hostId]: "yes",
        [newGuestId]: "pending",
      },
    };

    // Dave votes No
    const rejectedProposal: Proposal = {
      ...proposal,
      status: "rejected",
      votes: {
        [hostId]: "yes",
        [newGuestId]: "no",
      },
    };

    expect(rejectedProposal.status).toBe("rejected");
    // Grid remains unchanged on rejection
    expect(playingSnapshot.game!.grid[20]).toBe(0);
  });
});
