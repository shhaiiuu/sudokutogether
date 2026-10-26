# Sudoku Together delivery TODO

## Supabase room and identity backend

- [x] Add secure Supabase-backed room creation and joining with six-character codes, authenticated guest identity, a four-player cap, stable rejoining, and clear not-found/full/error behavior.
- [x] Persist room membership, host ownership, ready state, difficulty, room status, and server freshness; enforce host-only difficulty changes and start transitions.
- [x] Add realtime room updates and presence heartbeats. A player must show Online only while the server heartbeat is fresh; disconnects are skipped for pending votes and rejoining restores the same membership.

## Server-authoritative Sudoku multiplayer

- [x] Support Easy, Medium, Hard, Expert, Master, and Extreme in solo and multiplayer with genuine randomized generation/validation. Master and Extreme use a verified unique 17-clue template with Sudoku-preserving row/column/digit transformations; Master adds four server/client-derived solution clues while retaining uniqueness.
- [x] Generate multiplayer puzzles on the trusted server and never expose the stored solution in browser snapshots or trust client puzzle/grid state.
- [x] Persist shared grid and notes; notes are non-voting shared candidates, while accepted values come only from server state.
- [x] Enforce one pending proposal per room, captured eligible voter set, all-current-eligible-yes approval, any-no rejection, 30-second timeout, proposer cancellation, server cell/value/solution validation, and safe completion propagation.

## Persistent chat and frontend wiring

- [x] Replace simulated lobby players, readying, host start, votes, bot chat, typing, and demo room labels with Supabase commands and realtime-confirmed state while preserving the existing React components, Tailwind styling, layout, and responsive behavior.
- [x] Persist room chat with a 300-character limit and render messages only after server confirmation; typing remains ephemeral broadcast data.
- [x] Read `?room=CODE` invite links and retain the existing copy/share interactions.
- [x] Keep solo localStorage gameplay unchanged except for enabling all six difficulty levels.

## Validation and delivery

- [x] Extend tests for all six puzzle difficulties and proposal edge cases; `pnpm test -- --run` passes 14/14, `pnpm exec tsc --noEmit` passes, and `pnpm build` passes.
- [x] Targeted ESLint on changed files reports 0 errors and one existing Fast Refresh warning for `newGame` exported beside `GameScreen`.
- [ ] Repository-wide `pnpm lint` remains non-clean because the uploaded Lovable tree contains 64 Prettier formatting errors across pre-existing UI files plus the same Fast Refresh warnings. Those files were not reformatted to preserve the approved visual source.
- [x] No Lovable configuration or existing dependency was removed. Supabase credentials were not added; deploy the included migration and Edge Function in the target Supabase project and set the variables from `.env.example` before using multiplayer.
