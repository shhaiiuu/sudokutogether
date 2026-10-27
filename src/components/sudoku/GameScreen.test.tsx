import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameScreen, canEraseCell, type GameState } from "./GameScreen";
import type { Player, RoomSnapshot } from "@/lib/room";
import type { RoomClient } from "@/lib/room-client";

describe("Erase eligibility", () => {
  const givens = Array(81).fill(false);
  const grid = Array(81).fill(0);
  const solution = Array(81).fill(1);

  it("allows erasing a note-only cell", () => {
    expect(
      canEraseCell(0, givens, grid, solution, [[3], ...Array.from({ length: 80 }, () => [])]),
    ).toBe(true);
  });

  it("preserves erase behavior for an incorrect entered digit", () => {
    const entered = [...grid];
    entered[0] = 2;
    expect(
      canEraseCell(
        0,
        givens,
        entered,
        solution,
        Array.from({ length: 81 }, () => []),
      ),
    ).toBe(true);
  });

  it("protects correct entered digits and original clues", () => {
    const correct = [...grid];
    correct[0] = 1;
    expect(
      canEraseCell(
        0,
        givens,
        correct,
        solution,
        Array.from({ length: 81 }, () => []),
      ),
    ).toBe(false);

    const clueGivens = [...givens];
    clueGivens[0] = true;
    const clue = [...grid];
    clue[0] = 1;
    expect(
      canEraseCell(0, clueGivens, clue, solution, [[3], ...Array.from({ length: 80 }, () => [])]),
    ).toBe(false);
  });

  it("allows only note-only erasure for multiplayer cells", () => {
    const committed = [...grid];
    committed[0] = 4;
    expect(
      canEraseCell(
        0,
        givens,
        committed,
        Array(81).fill(0),
        Array.from({ length: 81 }, () => []),
        true,
      ),
    ).toBe(false);
    expect(
      canEraseCell(
        0,
        givens,
        grid,
        Array(81).fill(0),
        [[3], ...Array.from({ length: 80 }, () => [])],
        true,
      ),
    ).toBe(true);
  });

  it("uses authoritative erasability for incorrect online entries", () => {
    const incorrect = [...grid];
    incorrect[0] = 4;
    const erasable = Array(81).fill(false);
    erasable[0] = true;
    expect(canEraseCell(0, givens, incorrect, Array(81).fill(0), [], true, erasable)).toBe(true);
    erasable[0] = false;
    expect(canEraseCell(0, givens, incorrect, Array(81).fill(0), [], true, erasable)).toBe(false);
  });

  it("rejects invalid cell index (negative or > 80)", () => {
    expect(canEraseCell(-1, givens, grid, solution, [])).toBe(false);
    expect(canEraseCell(81, givens, grid, solution, [])).toBe(false);
    expect(canEraseCell(null, givens, grid, solution, [])).toBe(false);
  });
});

describe("Online and offline Erase UI interaction", () => {
  const dummyGame: GameState = {
    puzzle: [5, ...Array(80).fill(0)],
    solution: [5, 3, ...Array(79).fill(0)],
    grid: [5, 4, ...Array(79).fill(0)], // cell 0 is clue (5), cell 1 is incorrect (4, solution is 3)
    notes: [[], [1, 2], ...Array.from({ length: 79 }, () => [])],
    mistakes: 1,
    elapsed: 10,
    difficulty: "Easy",
    score: 0,
    hintsLeft: 3,
  };

  it("enables Erase for incorrect entered digit offline and erases it on button click", () => {
    render(<GameScreen initial={dummyGame} best={100} onHome={vi.fn()} onFinish={vi.fn()} />);

    // Cell 0 is a given clue
    fireEvent.click(screen.getByRole("gridcell", { name: /Row 1, Column 1/ }));
    const eraseBtn = screen.getByRole("button", { name: /Erase/ });
    expect(eraseBtn).toBeDisabled();

    // Cell 1 is an incorrect user entry (4 instead of 3)
    fireEvent.click(screen.getByRole("gridcell", { name: /Row 1, Column 2/ }));
    expect(eraseBtn).not.toBeDisabled();

    // Click Erase
    fireEvent.click(eraseBtn);
    // Cell 1 should now be empty
    expect(screen.getByRole("gridcell", { name: /Row 1, Column 2, empty/ })).toBeInTheDocument();
  });

  it("optimistically erases cell online and reverts if server rejects", async () => {
    const eraseCellMock = vi.fn().mockRejectedValue(new Error("Server error"));
    const mockClient = { eraseCell: eraseCellMock, clearNotes: vi.fn() };
    const erasable = Array(81).fill(false);
    erasable[1] = true;

    const onlineRoom: RoomSnapshot = {
      roomId: "room-123",
      code: "ROOM12",
      hostId: "p1",
      difficulty: "Easy",
      status: "playing",
      players: [
        { id: "p1", name: "P1", color: "p1", online: true, ready: true, host: true, isYou: true },
      ],
      game: {
        puzzle: [5, ...Array(80).fill(0)],
        grid: [5, 4, ...Array(79).fill(0)],
        erasable,
        notes: Array.from({ length: 81 }, () => []),
        elapsed: 10,
        score: 0,
        completed: false,
        revision: 1,
      },
      proposal: null,
      messages: [],
    };

    render(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={onlineRoom}
        roomClient={mockClient as unknown as RoomClient}
        players={onlineRoom.players}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    // Select cell 1 (which has value 4 and is marked erasable)
    fireEvent.click(screen.getByRole("gridcell", { name: /Row 1, Column 2/ }));
    const eraseBtn = screen.getByRole("button", { name: /Erase/ });
    expect(eraseBtn).not.toBeDisabled();

    // Click Erase
    await act(async () => {
      fireEvent.click(eraseBtn);
    });
    expect(eraseCellMock).toHaveBeenCalledWith("room-123", 1);

    // Wait for the rejection to revert the state
    await vi.waitFor(() => {
      // Cell 1 value (4) should be restored
      expect(screen.getByRole("gridcell", { name: /Row 1, Column 2, 4/ })).toBeInTheDocument();
    });
  });
});

describe("Floating chat launcher unread notification badge", () => {
  const dummyGame: GameState = {
    puzzle: Array(81).fill(0),
    solution: Array(81).fill(1),
    grid: Array(81).fill(0),
    notes: Array.from({ length: 81 }, () => []),
    mistakes: 0,
    elapsed: 10,
    difficulty: "Easy",
    score: 0,
    hintsLeft: 3,
  };
  const me: Player = {
    id: "p1",
    name: "Player One",
    color: "p1",
    online: true,
    ready: true,
    host: true,
    isYou: true,
  };
  const opponent: Player = {
    id: "p2",
    name: "Player Two",
    color: "p2",
    online: true,
    ready: true,
    host: false,
    isYou: false,
  };
  const baseRoom: RoomSnapshot = {
    roomId: "room-123",
    code: "ROOM12",
    hostId: "p1",
    difficulty: "Easy",
    status: "playing",
    players: [me, opponent],
    game: {
      puzzle: Array(81).fill(0),
      grid: Array(81).fill(0),
      erasable: Array(81).fill(false),
      notes: Array.from({ length: 81 }, () => []),
      elapsed: 10,
      score: 0,
      completed: false,
      revision: 1,
    },
    proposal: null,
    messages: [],
  };

  it("shows initial unread badge for messages sent by opponent before mounting", () => {
    const roomWithMsg: RoomSnapshot = {
      ...baseRoom,
      messages: [{ id: "m-1", playerId: "p2", text: "Hello", at: 1000 }],
    };
    render(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={roomWithMsg}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const badge = screen.getByTestId("unread-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  it("does not count messages sent by the current player", () => {
    const roomWithMyMsg: RoomSnapshot = {
      ...baseRoom,
      messages: [{ id: "m-1", playerId: "p1", text: "My message", at: 1000 }],
    };
    render(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={roomWithMyMsg}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("updates unread badge on new incoming messages and clears when chat opens", () => {
    const view = render(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={baseRoom}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();

    // Rerender with a new incoming message from opponent
    const updatedRoom: RoomSnapshot = {
      ...baseRoom,
      messages: [{ id: "m-1", playerId: "p2", text: "Hey there!", at: 1000, delivery: "sent" }],
    };
    view.rerender(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={updatedRoom}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");

    // Duplicate event (same message delivered again via snapshot or postgres_changes)
    view.rerender(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={{
          ...updatedRoom,
          messages: [{ id: "m-1", playerId: "p2", text: "Hey there!", at: 1000, delivery: "sent" }],
        }}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    // Should still be 1, NOT 2!
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");

    // Open chat launcher
    fireEvent.click(screen.getByTestId("chat-launcher"));
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();

    // Close chat launcher
    fireEvent.click(screen.getByTestId("chat-launcher"));
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();

    // Second message from opponent arrives while chat is closed
    const secondMsgRoom: RoomSnapshot = {
      ...baseRoom,
      messages: [
        { id: "m-1", playerId: "p2", text: "Hey there!", at: 1000, delivery: "sent" },
        { id: "m-2", playerId: "p2", text: "Are you ready?", at: 2000, delivery: "sent" },
      ],
    };
    view.rerender(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={secondMsgRoom}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    // Badge shows 1 (only the new message is unread, m-1 was already read)
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
  });

  it("moves chat launcher to top-right when proposal is waiting to avoid overlapping vote buttons", () => {
    const waitingRoom: RoomSnapshot = {
      ...baseRoom,
      proposal: {
        id: "prop-1",
        index: 4,
        value: 7,
        proposerId: "p2",
        votes: { p1: "pending", p2: "yes" },
        status: "waiting",
        createdAt: Date.now(),
      },
    };

    const view = render(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={baseRoom}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    const launcher = screen.getByTestId("chat-launcher");
    expect(launcher.className).toContain("bottom-[max(1.25rem,env(safe-area-inset-bottom))]");

    view.rerender(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={waitingRoom}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    expect(launcher.className).toContain("top-20");
  });

  it("displays mistakes count and styles erasable wrong entries in multiplayer", () => {
    const wrongGrid = Array(81).fill(0);
    wrongGrid[5] = 9;
    const erasable = Array(81).fill(false);
    erasable[5] = true;

    const gameWithMistake: RoomSnapshot = {
      ...baseRoom,
      game: {
        ...baseRoom.game!,
        grid: wrongGrid,
        erasable,
        mistakes: 1,
      },
    };

    render(
      <GameScreen
        initial={dummyGame}
        best={100}
        room={gameWithMistake}
        roomClient={{} as unknown as RoomClient}
        players={[me, opponent]}
        youId="p1"
        onHome={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    // Shows 1/3 mistakes
    expect(screen.getByText("1/3")).toBeInTheDocument();

    // Cell 5 is rendered with cell-conflict style
    const cell5 = screen.getByRole("gridcell", { name: "Row 1, Column 6, 9" });
    expect(cell5.className).toContain("bg-cell-conflict");
  });
});
