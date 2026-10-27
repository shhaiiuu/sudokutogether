import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeaveGameDialog } from "./Dialogs";

describe("LeaveGameDialog", () => {
  it("keeps the game open on Stay and confirms on Leave Game", () => {
    const onStay = vi.fn();
    const onLeave = vi.fn();
    render(<LeaveGameDialog open onStay={onStay} onLeave={onLeave} />);

    const dialog = screen.getByRole("dialog", { name: "Leave this game" });
    expect(dialog).toHaveClass("items-center");

    expect(screen.getByRole("heading", { name: "Leave this game?" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to leave this game?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave Game" }));

    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
