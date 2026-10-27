import { describe, expect, it, vi } from "vitest";
import { localizeSnapshot, RoomClient } from "./room-client";
import type { Player, Proposal, RoomSnapshot } from "./room";

describe("RoomClient realtime broadcast optimizations", () => {
  it("broadcasts proposal, vote, and cancellation events through the active channel", () => {
    const client = new RoomClient();
    client.userId = "user-1";
    const send = vi.fn();
    (client as unknown as { channel: { send: typeof send } }).channel = { send };

    const proposal: Proposal = {
      id: "prop-1",
      index: 10,
      value: 7,
      proposerId: "user-1",
      votes: { "user-1": "yes", "user-2": "pending" },
      status: "waiting",
      createdAt: Date.now(),
    };

    client.broadcastProposal(proposal);
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "proposal-opened",
      payload: { proposal, from: "user-1" },
    });

    client.broadcastVote("prop-1", "user-1", "yes");
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "vote-cast",
      payload: { proposalId: "prop-1", voterId: "user-1", vote: "yes", from: "user-1" },
    });

    client.broadcastProposalCancel("prop-1");
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "proposal-cancelled",
      payload: { proposalId: "prop-1", from: "user-1" },
    });
  });

  it("pushSnapshot updates currentSnapshot and invokes snapshotListener synchronously", () => {
    const client = new RoomClient();
    const listener = vi.fn();
    (client as unknown as { snapshotListener: typeof listener }).snapshotListener = listener;

    const mockSnapshot = {
      roomId: "room-1",
      code: "ABCDEF",
      hostId: "user-1",
      difficulty: "Medium",
      status: "playing",
      players: [],
      game: null,
      proposal: null,
      messages: [],
    } as unknown as RoomSnapshot;

    client.pushSnapshot(mockSnapshot);
    expect((client as unknown as { currentSnapshot: unknown }).currentSnapshot).toBe(mockSnapshot);
    expect(listener).toHaveBeenCalledWith(mockSnapshot);
  });

  it("broadcastNote sends note-toggled event through the channel", () => {
    const client = new RoomClient();
    client.userId = "user-1";
    const send = vi.fn();
    (client as unknown as { channel: { send: typeof send } }).channel = { send };

    client.broadcastNote(42, 9);
    expect(send).toHaveBeenCalledWith({
      type: "broadcast",
      event: "note-toggled",
      payload: { index: 42, value: 9, from: "user-1" },
    });
  });

  it("localizeSnapshot correctly sets isYou: true only for the matching userId", () => {
    const snapshot: RoomSnapshot = {
      roomId: "room-1",
      code: "ABCDEF",
      hostId: "user-1",
      difficulty: "Medium",
      status: "playing",
      players: [
        {
          id: "user-1",
          name: "Player 1",
          avatarUrl: null,
          isHost: true,
          isYou: true,
          isConnected: true,
        },
        {
          id: "user-2",
          name: "Player 2",
          avatarUrl: null,
          isHost: false,
          isYou: false,
          isConnected: true,
        },
      ],
      game: null,
      proposal: null,
      messages: [],
    };

    // When localized for user-2:
    const localizedForUser2 = localizeSnapshot(snapshot, "user-2");
    expect(localizedForUser2.players.find((p: Player) => p.id === "user-2")?.isYou).toBe(true);
    expect(localizedForUser2.players.find((p: Player) => p.id === "user-1")?.isYou).toBe(false);

    // When localized for user-1:
    const localizedForUser1 = localizeSnapshot(snapshot, "user-1");
    expect(localizedForUser1.players.find((p: Player) => p.id === "user-1")?.isYou).toBe(true);
    expect(localizedForUser1.players.find((p: Player) => p.id === "user-2")?.isYou).toBe(false);
  });
});
