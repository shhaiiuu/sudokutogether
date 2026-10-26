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

    expect(screen.getByRole("heading", { name: "Room chat" })).toBeInTheDocument();
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
    expect(screen.queryByRole("heading", { name: "Room chat" })).not.toBeInTheDocument();

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
});
