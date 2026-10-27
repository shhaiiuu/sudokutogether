import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeaveGameDialog, LeaveRoomDialog } from "./Dialogs";

describe("LeaveGameDialog", () => {
  it("keeps the game open on Stay and confirms on Leave Game", () => {
    const onStay = vi.fn();
    const onLeave = vi.fn();
    render(<LeaveGameDialog open onStay={onStay} onLeave={onLeave} />);

    const dialog = screen.getByRole("dialog", { name: "Leave this game" });
    expect(dialog).toHaveClass("items-end");

    expect(screen.getByRole("heading", { name: "Leave this game?" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to leave this game?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Game" }));

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe("LeaveRoomDialog", () => {
  it("keeps the room open on Stay and confirms on Leave Room", () => {
    const onStay = vi.fn();
    const onLeave = vi.fn();
    render(<LeaveRoomDialog open onStay={onStay} onLeave={onLeave} />);

    const dialog = screen.getByRole("dialog", { name: "Leave this room" });
    expect(dialog).toHaveClass("items-end");

    expect(screen.getByRole("heading", { name: "Leave this room?" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to leave this room?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Room" }));

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
