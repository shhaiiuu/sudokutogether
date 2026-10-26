import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberPad } from "./GameControls";

describe("NumberPad Notes mode styling", () => {
  it("uses muted grey controls in Notes mode and blue controls otherwise", () => {
    const view = render(<NumberPad grid={Array(81).fill(0)} onNumber={vi.fn()} notesOn />);
    expect(screen.getByRole("button", { name: "Enter 1" })).toHaveClass("text-muted-foreground");

    view.rerender(<NumberPad grid={Array(81).fill(0)} onNumber={vi.fn()} notesOn={false} />);
    expect(screen.getByRole("button", { name: "Enter 1" })).toHaveClass("text-cell-entered");
  });
});
