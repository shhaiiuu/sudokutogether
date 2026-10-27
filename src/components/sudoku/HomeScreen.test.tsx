import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EVENTS, getEventCountdown, HomeScreen } from "./HomeScreen";

describe("event countdowns", () => {
  const end = "2026-12-01T12:00:00Z";

  it("calculates a future multi-day countdown from the end timestamp", () => {
    const now = Date.parse(end) - (5 * 24 + 12) * 60 * 60 * 1000;
    expect(getEventCountdown(end, now)).toEqual({ label: "5d 12h", ended: false });
  });

  it("uses minutes when less than an hour remains", () => {
    const now = Date.parse(end) - 45 * 60 * 1000;
    expect(getEventCountdown(end, now)).toEqual({ label: "45m", ended: false });
  });

  it("marks an expired event as ended without negative time", () => {
    const now = Date.parse(end) + 1;
    expect(getEventCountdown(end, now)).toEqual({ label: "Ended", ended: true });
  });

  it("changes when time advances, as it does after a refresh or clock tick", () => {
    const first = Date.parse(end) - 2 * 60 * 60 * 1000;
    const oneHourLater = first + 60 * 60 * 1000;
    expect(getEventCountdown(end, first).label).toBe("2h");
    expect(getEventCountdown(end, oneHourLater).label).toBe("1h");
  });

  it("keeps explicit start and end timestamps for every configured event", () => {
    expect(EVENTS).toHaveLength(3);
    for (const event of EVENTS) {
      expect(Number.isNaN(Date.parse(event.startAt))).toBe(false);
      expect(Number.isNaN(Date.parse(event.endAt))).toBe(false);
      expect(Date.parse(event.startAt)).toBeLessThan(Date.parse(event.endAt));
    }
  });
});

describe("HomeScreen UI", () => {
  it("renders header with wordmark and white 40px round settings button which opens settings", () => {
    render(
      <HomeScreen
        best={1250}
        saved={null}
        onContinue={vi.fn()}
        onNewGame={vi.fn()}
        onMultiplayer={vi.fn()}
      />,
    );

    // Wordmark
    expect(screen.getByRole("heading", { name: "Sudoku Together" })).toBeInTheDocument();

    // Settings round button
    const settingsBtn = screen.getByRole("button", { name: "Settings" });
    expect(settingsBtn).toBeInTheDocument();
    expect(settingsBtn.className).toContain("rounded-full");
    expect(settingsBtn.className).toContain("h-10");
    expect(settingsBtn.className).toContain("w-10");

    // Click settings opens dialog
    fireEvent.click(settingsBtn);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("renders LetterGridLogo and all-time best score and action buttons", () => {
    const onNewGame = vi.fn();
    const onMultiplayer = vi.fn();

    render(
      <HomeScreen
        best={4500}
        saved={null}
        onContinue={vi.fn()}
        onNewGame={onNewGame}
        onMultiplayer={onMultiplayer}
      />,
    );

    // LetterGridLogo text
    expect(screen.getByText("TOGETHER")).toBeInTheDocument();
    expect(screen.getByText("All-Time Best Score")).toBeInTheDocument();
    expect(screen.getByText("4,500")).toBeInTheDocument();

    // Buttons
    const newGameBtn = screen.getByRole("button", { name: /New Game/i });
    expect(newGameBtn).toBeInTheDocument();
    fireEvent.click(newGameBtn);
    expect(onNewGame).toHaveBeenCalled();

    const multiplayerBtn = screen.getByRole("button", { name: /Play with Friends/i });
    expect(multiplayerBtn).toBeInTheDocument();
    fireEvent.click(multiplayerBtn);
    expect(onMultiplayer).toHaveBeenCalled();
  });
});
