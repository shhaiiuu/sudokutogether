import { describe, expect, it } from "vitest";
import {
  applyApprovedMove,
  canCastVote,
  PROPOSAL_TIMEOUT_MS,
  resolveProposal,
  missingVotes,
  mergeChatMessages,
  type Player,
  type Proposal,
} from "./room";

const players: Player[] = [
  { id: "a", name: "A", color: "p1", online: true, ready: true, host: true },
  { id: "b", name: "B", color: "p2", online: true, ready: true, host: false },
  { id: "c", name: "C", color: "p3", online: true, ready: true, host: false },
];
const base: Proposal = {
  index: 0,
  value: 5,
  proposerId: "a",
  eligibleVoterIds: ["a", "b", "c"],
  votes: { a: "pending", b: "pending", c: "pending" },
  status: "waiting",
  createdAt: 0,
  activeDeadlineAt: PROPOSAL_TIMEOUT_MS,
};

describe("move voting", () => {
  it("requires the proposer to explicitly vote Yes", () => {
    expect(
      resolveProposal({ ...base, votes: { a: "pending", b: "yes", c: "yes" } }, players, 1),
    ).toBe("waiting");
    expect(resolveProposal({ ...base, votes: { a: "yes", b: "yes", c: "yes" } }, players, 1)).toBe(
      "approved",
    );
  });

  it("rejects on a single No vote", () => {
    expect(
      resolveProposal({ ...base, votes: { a: "yes", b: "no", c: "pending" } }, players, 1),
    ).toBe("rejected");
  });

  it("pauses when an eligible player disconnects instead of removing them from the electorate", () => {
    const disconnected = players.map((player) =>
      player.id === "c" ? { ...player, online: false } : player,
    );
    const proposal: Proposal = { ...base, votes: { a: "yes", b: "yes", c: "pending" } };
    expect(resolveProposal(proposal, disconnected, 1)).toBe("paused");
    expect(missingVotes(proposal, disconnected)).toBe(0);
  });

  it("resumes within the 60-second grace period and preserves prior votes", () => {
    const paused: Proposal = {
      ...base,
      status: "paused",
      votes: { a: "yes", b: "pending", c: "yes" },
      disconnectDeadlineAt: 60_000,
      activeDeadlineAt: 75_000,
    };
    expect(resolveProposal(paused, players, 50_000)).toBe("waiting");
    expect(paused.votes).toEqual({ a: "yes", b: "pending", c: "yes" });
  });

  it("cancels after the reconnection grace period without approving", () => {
    const paused: Proposal = { ...base, status: "paused", disconnectDeadlineAt: 60_000 };
    const disconnected = players.map((player) =>
      player.id === "c" ? { ...player, online: false } : player,
    );
    expect(resolveProposal(paused, disconnected, 60_000)).toBe("cancelled");
  });

  it("does not consume paused time from the active-voting deadline", () => {
    const paused: Proposal = {
      ...base,
      status: "paused",
      votes: { a: "yes", b: "yes", c: "pending" },
      disconnectDeadlineAt: 60_000,
      activeDeadlineAt: 345_000,
    };
    expect(resolveProposal(paused, players, 50_000)).toBe("waiting");
    expect(resolveProposal(paused, players, 345_000)).toBe("timeout");
  });

  it("blocks votes while paused or disconnected", () => {
    expect(canCastVote({ ...base, status: "paused" }, "a", players)).toBe(false);
    expect(
      canCastVote(
        base,
        "c",
        players.map((player) => ({ ...player, online: player.id !== "c" })),
      ),
    ).toBe(false);
  });

  it("rejects stale or disconnected voters through the server contract", () => {
    const disconnected = players.map((player) =>
      player.id === "b" ? { ...player, online: false } : player,
    );
    expect(
      resolveProposal({ ...base, votes: { a: "yes", b: "pending", c: "yes" } }, disconnected, 1),
    ).toBe("paused");
  });

  it("rejects a stale board revision and cannot apply the same move twice", () => {
    const state = { revision: 3, puzzle: [0], grid: [0], solution: [5] };
    const proposal = { index: 0, value: 5, boardRevision: 3 };
    const first = applyApprovedMove(state, proposal);
    expect(first.status).toBe("approved");
    expect(first.isCorrect).toBe(true);
    expect(first.state.revision).toBe(4);
    expect(applyApprovedMove(first.state, proposal).status).toBe("rejected");
    expect(applyApprovedMove(state, { ...proposal, boardRevision: 2 }).status).toBe("rejected");
  });

  it("applies an unanimously approved incorrect value and records that it was incorrect", () => {
    const state = { revision: 3, puzzle: [0], grid: [0], solution: [7] };
    const result = applyApprovedMove(state, { index: 0, value: 5, boardRevision: 3 });
    expect(result.status).toBe("approved");
    expect(result.isCorrect).toBe(false);
    expect(result.state.grid).toEqual([5]);
  });

  it("reconciles an optimistic chat message without duplicating the server event", () => {
    const optimistic = {
      id: "temp-1",
      playerId: "a",
      text: "Hello",
      at: 10_000,
      delivery: "sending" as const,
    };
    const server = {
      id: "server-1",
      playerId: "a",
      text: "Hello",
      at: 10_001,
      delivery: "sent" as const,
    };
    expect(mergeChatMessages([optimistic], [server])).toEqual([server]);
    expect(
      mergeChatMessages([server], [{ id: "server-1", playerId: "a", text: "Hello", at: 10_001 }]),
    ).toHaveLength(1);
  });
});
