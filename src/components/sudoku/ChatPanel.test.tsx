import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./ChatPanel";
import type { ChatMessage, Player } from "@/lib/room";

const player: Player = {
  id: "player-1",
  name: "Player One",
  color: "p1",
  online: true,
  ready: true,
  host: true,
  isYou: true,
};

const message: ChatMessage = {
  id: "message-1",
  playerId: player.id,
  text: "Hello team",
  at: Date.now(),
};

describe("ChatPanel lifecycle", () => {
  it("opens, closes, reopens, updates history, and sends without an effect cleanup crash", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const onClose = vi.fn();
    const onSend = vi.fn();
    const view = render(
      <ChatPanel
        open
        onClose={onClose}
        messages={[]}
        players={[player]}
        typing={null}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole("heading", { name: "Match Chat" })).toBeInTheDocument();
    view.rerender(
      <ChatPanel
        open={false}
        onClose={onClose}
        messages={[]}
        players={[player]}
        typing={null}
        onSend={onSend}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Match Chat" })).not.toBeInTheDocument();

    view.rerender(
      <ChatPanel
        open
        onClose={onClose}
        messages={[message]}
        players={[player]}
        typing={null}
        onSend={onSend}
      />,
    );
    expect(screen.getByText("Hello team")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "A reply" } });
    fireEvent.submit(screen.getByRole("button", { name: "Send" }).closest("form")!);
    expect(onSend).toHaveBeenCalledWith("A reply");
  });

  it("labels own messages as You and renders animated typing dots", () => {
    render(
      <ChatPanel
        open
        onClose={vi.fn()}
        messages={[message]}
        players={[player]}
        typing="Player Two"
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Player Two")).toBeInTheDocument();
    expect(screen.getByLabelText("typing").children).toHaveLength(3);
  });

  it("shows failed delivery with a retry action and supports emoji insertion", () => {
    const onRetry = vi.fn();
    const failed: ChatMessage = { ...message, id: "temp-1", delivery: "failed" };
    render(
      <ChatPanel
        open
        onClose={vi.fn()}
        messages={[failed]}
        players={[player]}
        typing={null}
        onSend={vi.fn()}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "🙂" }));
    expect(onRetry).toHaveBeenCalledWith(failed);
    expect(screen.getByLabelText("Message")).toHaveValue("🙂");
  });

  it("renders timestamps outside and below the message bubble for incoming and outgoing messages", () => {
    const opponent: Player = {
      id: "player-2",
      name: "Player Two",
      color: "p2",
      online: true,
      ready: true,
      host: false,
      isYou: false,
    };
    const incoming: ChatMessage = {
      id: "message-2",
      playerId: opponent.id,
      text: "Nice move!",
      at: new Date("2026-10-27T12:30:00Z").getTime(),
      delivery: "sent",
    };
    const outgoing: ChatMessage = {
      id: "message-3",
      playerId: player.id,
      text: "Thanks!",
      at: new Date("2026-10-27T12:31:00Z").getTime(),
      delivery: "sent",
    };

    render(
      <ChatPanel
        open
        onClose={vi.fn()}
        messages={[incoming, outgoing]}
        players={[player, opponent]}
        typing={null}
        onSend={vi.fn()}
      />,
    );

    const incomingText = screen.getByText("Nice move!");
    const incomingBubble = incomingText.closest(".rounded-2xl");
    expect(incomingBubble).not.toBeNull();
    const incomingTime = screen.getByText(
      new Date(incoming.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    // Timestamp should NOT be inside the bubble
    expect(incomingBubble?.contains(incomingTime)).toBe(false);
    // Timestamp should be a sibling underneath the bubble in the same message wrapper
    expect(incomingBubble?.parentElement?.contains(incomingTime)).toBe(true);

    const outgoingText = screen.getByText("Thanks!");
    const outgoingBubble = outgoingText.closest(".rounded-2xl");
    expect(outgoingBubble).not.toBeNull();
    const outgoingTime = screen.getByText(
      new Date(outgoing.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    expect(outgoingBubble?.contains(outgoingTime)).toBe(false);
    expect(outgoingBubble?.parentElement?.contains(outgoingTime)).toBe(true);
    expect(outgoingBubble?.parentElement).toHaveClass("items-end");
  });

  it("aligns sender avatar with the message bubble and associates typing player avatar", () => {
    const opponent: Player = {
      id: "player-2",
      name: "Player Two",
      color: "p2",
      online: true,
      ready: true,
      host: false,
      isYou: false,
    };
    const incoming: ChatMessage = {
      id: "message-2",
      playerId: opponent.id,
      text: "Can we put 5 in row 2?",
      at: Date.now(),
      delivery: "sent",
    };

    render(
      <ChatPanel
        open
        onClose={vi.fn()}
        messages={[incoming]}
        players={[player, opponent]}
        typing="Player Two"
        onSend={vi.fn()}
      />,
    );

    // Sender name is outside and above the bubble with ml-10 indent for avatar
    const sender = screen.getByText("Player Two", { selector: "p" });
    expect(sender).toHaveClass("ml-10");

    // Avatar initials for PL are rendered in the message row and typing row
    const avatars = screen.getAllByText("PL");
    expect(avatars.length).toBeGreaterThanOrEqual(1);

    // Message bubble row has items-start alignment
    const bubble = screen.getByText("Can we put 5 in row 2?").closest(".rounded-2xl");
    const bubbleRow = bubble?.closest(".flex.items-start");
    expect(bubbleRow).not.toBeNull();
  });
});
