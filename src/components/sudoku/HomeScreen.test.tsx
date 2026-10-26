import { describe, expect, it } from "vitest";
import { EVENTS, getEventCountdown } from "./HomeScreen";

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
