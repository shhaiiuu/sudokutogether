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
});
