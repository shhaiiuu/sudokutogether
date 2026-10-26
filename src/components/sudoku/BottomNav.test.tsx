import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("navigates among Main, Daily Challenges, and Me while highlighting the active page", () => {
    const onNavigate = vi.fn();
    render(<BottomNav active="main" onNavigate={onNavigate} />);

    expect(screen.getByRole("button", { name: "Main" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Daily Challenges" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("button", { name: "Me" })).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByRole("button", { name: "Daily Challenges" }));
    fireEvent.click(screen.getByRole("button", { name: "Me" }));
    fireEvent.click(screen.getByRole("button", { name: "Main" }));

    expect(onNavigate.mock.calls).toEqual([["daily"], ["me"], ["main"]]);
  });
});
