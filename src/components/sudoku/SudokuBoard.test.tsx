import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SudokuBoard } from "./SudokuBoard";

function renderBoard(notes: number[]) {
  return render(
    <SudokuBoard
      grid={Array(81).fill(0)}
      givens={Array(81).fill(false)}
      notes={[notes, ...Array.from({ length: 80 }, () => [])]}
      selected={0}
      conflicts={new Set()}
      wrong={new Set()}
      highlightRelated
      highlightSame
      onSelect={vi.fn()}
    />,
  );
}

describe("SudokuBoard notes", () => {
  it("keeps a single candidate inside the fixed 3x3 note grid", () => {
    renderBoard([5]);
    const board = screen.getByRole("grid", { name: "Sudoku board" });
    const cell = within(board).getByRole("gridcell", { name: "Row 1, Column 1, empty" });
    expect(board).toHaveClass("grid-rows-9", "min-h-0", "min-w-0");
    expect(cell).toHaveClass("h-full", "w-full", "min-h-0", "min-w-0", "overflow-hidden");
    expect(within(cell).getByText("5")).toBeInTheDocument();
    expect(cell.querySelector(".grid-cols-3")).toHaveClass(
      "grid-cols-3",
      "grid-rows-3",
      "text-muted-foreground",
    );
  });

  it("renders all nine candidates without changing the fixed cell structure", () => {
    renderBoard([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const board = screen.getByRole("grid", { name: "Sudoku board" });
    const cell = within(board).getByRole("gridcell", { name: "Row 1, Column 1, empty" });
    for (const candidate of [1, 2, 3, 4, 5, 6, 7, 8, 9])
      expect(within(cell).getByText(String(candidate))).toBeInTheDocument();
    expect(cell).toHaveClass("h-full", "w-full", "overflow-hidden");
  });

  it("keeps candidate notes muted grey across Notes mode and selection changes", () => {
    const view = render(
      <SudokuBoard
        grid={Array(81).fill(0)}
        givens={Array(81).fill(false)}
        notes={[[1], ...Array.from({ length: 80 }, () => [])]}
        selected={0}
        conflicts={new Set()}
        wrong={new Set()}
        highlightRelated
        highlightSame
        onSelect={vi.fn()}
      />,
    );
    const board = screen.getByRole("grid", { name: "Sudoku board" });
    expect(
      within(board)
        .getByRole("gridcell", { name: "Row 1, Column 1, empty" })
        .querySelector(".grid-cols-3"),
    ).toHaveClass("text-muted-foreground");
    view.rerender(
      <SudokuBoard
        grid={Array(81).fill(0)}
        givens={Array(81).fill(false)}
        notes={[[1], ...Array.from({ length: 80 }, () => [])]}
        selected={1}
        conflicts={new Set()}
        wrong={new Set()}
        highlightRelated
        highlightSame
        onSelect={vi.fn()}
      />,
    );
    expect(
      within(screen.getByRole("grid", { name: "Sudoku board" }))
        .getByRole("gridcell", { name: "Row 1, Column 1, empty" })
        .querySelector(".grid-cols-3"),
    ).toHaveClass("text-muted-foreground");
  });

  it("continues to render normal entered digits with their normal board styling", () => {
    const grid = Array(81).fill(0);
    grid[0] = 7;
    render(
      <SudokuBoard
        grid={grid}
        givens={Array(81).fill(false)}
        notes={Array.from({ length: 81 }, () => [])}
        selected={0}
        conflicts={new Set()}
        wrong={new Set()}
        highlightRelated
        highlightSame
        onSelect={vi.fn()}
      />,
    );
    expect(within(screen.getByRole("grid", { name: "Sudoku board" })).getByText("7")).toHaveClass(
      "animate-cell-pop",
    );
  });
});
