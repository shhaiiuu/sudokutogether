import { describe, expect, it, vi } from "vitest";
import { playProposalSound } from "./sound";

describe("playProposalSound", () => {
  it("does not throw in test/headless environment", () => {
    expect(() => playProposalSound()).not.toThrow();
  });

  it("creates an oscillator and connects to gain when AudioContext exists", () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const connectMock = vi.fn();
    const setValueAtTimeMock = vi.fn();
    const exponentialRampToValueAtTimeMock = vi.fn();

    class MockAudioContext {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator() {
        return {
          type: "sine",
          frequency: {
            setValueAtTime: setValueAtTimeMock,
            exponentialRampToValueAtTime: exponentialRampToValueAtTimeMock,
          },
          connect: connectMock,
          start: startMock,
          stop: stopMock,
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: setValueAtTimeMock,
            exponentialRampToValueAtTime: exponentialRampToValueAtTimeMock,
          },
          connect: connectMock,
        };
      }
    }

    vi.stubGlobal("AudioContext", MockAudioContext);

    expect(() => playProposalSound()).not.toThrow();
    expect(startMock).toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
