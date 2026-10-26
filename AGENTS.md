<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Sudoku Together is a single-route app: `/` switches between loading, home, lobby and game screens via local state; components live in `src/components/sudoku/`. Why: screens share live game state and are not separate pages.
- Multiplayer is a local demo simulation (`src/lib/room.ts`); voting rules live in `resolveProposal` so a real backend can reuse them. Why: no server exists yet and the UI must not pretend otherwise.
