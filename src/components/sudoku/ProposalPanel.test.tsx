import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposalPanel } from "./ProposalPanel";
import type { Player, Proposal } from "@/lib/room";

describe("ProposalPanel perspective and voting buttons", () => {
  const players: Player[] = [
    {
      id: "player-1",
      name: "Alice",
      avatarUrl: null,
      isHost: true,
      isYou: true,
      isConnected: true,
    },
    {
      id: "player-2",
      name: "Bob",
      avatarUrl: null,
      isHost: false,
      isYou: false,
      isConnected: true,
    },
  ];

  const proposal: Proposal = {
    id: "prop-1",
    index: 10,
    value: 5,
    proposerId: "player-1",
    votes: {
      "player-1": "yes",
      "player-2": "pending",
    },
    status: "waiting",
    createdAt: Date.now(),
  };

  it("renders 'Proposed by you' and 'Cancel proposal' when viewed by the proposer", () => {
    const onCancel = vi.fn();
    const onVote = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ProposalPanel
        proposal={proposal}
        players={players}
        youId="player-1"
        onVote={onVote}
        onDismiss={onDismiss}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Proposed by you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel proposal/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^yes$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^no$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel proposal/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders 'Proposed by Alice' and Yes / No buttons when viewed by teammate", () => {
    const onCancel = vi.fn();
    const onVote = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ProposalPanel
        proposal={proposal}
        players={players}
        youId="player-2"
        onVote={onVote}
        onDismiss={onDismiss}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Proposed by Alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel proposal/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /yes/i }));
    expect(onVote).toHaveBeenCalledWith("yes");

    fireEvent.click(screen.getByRole("button", { name: /no/i }));
    expect(onVote).toHaveBeenCalledWith("no");
  });
});
