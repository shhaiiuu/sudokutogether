# Sudoku Together implementation plan

## Product and architecture

Sudoku Together remains the existing single-route TanStack Start/Vite React app. The approved Lovable components and Tailwind tokens stay in place; backend work is isolated to new Supabase client/service modules, small callback additions to the existing lobby/game screens, and a Supabase migration plus Edge Function source.

The browser owns only presentation state (selected cell, open sheets, local solo history/settings) and sends typed commands. Supabase owns room membership, host/difficulty/status transitions, the generated multiplayer puzzle and solution, accepted grid/notes, proposal eligibility, votes, resolution, presence timestamps, and chat rows. Multiplayer snapshots intentionally omit the solution. Realtime table changes invalidate a safe Edge Function snapshot rather than exposing the authoritative solution through browser subscriptions.

## Backend design

- `src/lib/supabase.ts` creates the browser client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; anonymous Auth provides a stable guest identity without inventing local players.
- `src/lib/room-client.ts` wraps Auth, the `sudoku-room` Edge Function, and a room-scoped Realtime channel. It maps server snapshots into the existing `Player`, `Proposal`, and chat UI contracts and owns heartbeat/presence cleanup.
- `supabase/migrations/20261026221600_sudoku_together.sql` creates rooms, members, private game state, proposals/votes, shared notes, and persistent chat with RLS. Direct browser writes are denied; the trusted Edge Function performs authenticated, server-side mutations.
- `supabase/functions/sudoku-room/index.ts` authenticates every request, enforces room capacity/host rules, generates multiplayer puzzles on the server, validates accepted moves against the private solution, captures eligible voters, resolves all-yes/any-no/timeout/cancel outcomes, applies accepted values atomically through guarded server logic, and returns sanitized snapshots.
- Presence is safe and deterministic: a member is online only while its server-updated heartbeat is fresh; a proposal captures eligible voters when created, and stale/offline voters are skipped at resolution. Rejoining updates the same membership row rather than creating a duplicate seat.

## Sudoku logic

`src/lib/sudoku.ts` remains the shared solo engine but now supports Easy, Medium, Hard, Expert, Master, and Extreme as available levels. Each level uses a distinct clue target (40/33/28/24/21/17), randomized complete solutions, MRV-based validation, and uniqueness-preserving generation. Easy through Expert use randomized clue removal; Master and Extreme use a verified unique 17-clue template with Sudoku-preserving row/column/digit transformations, with four additional solution clues for Master. The Edge Function carries the same server-side generator/validator so a multiplayer client never supplies the source-of-truth puzzle.

## Frontend integration

- `Lobby` keeps its current cards, grids, copy/share controls, and responsive layout, but calls `RoomClient` methods and renders live snapshots. The demo banner becomes a live-backend status message. No simulated friends, automatic readiness, or simulated host start remain.
- `GameScreen` retains the board and controls. Solo still uses the existing local game path. Multiplayer receives a server snapshot and client, proposes moves instead of applying them locally, renders server-confirmed proposals/votes/chat, and updates the board only from sanitized realtime snapshots. The multiplayer chip is changed from “Demo room” to “Live room”.
- `src/routes/index.tsx` owns the room snapshot/watch lifecycle, reads `?room=CODE` for invite links, and starts the game only when the backend reports `playing`.
- `ChatPanel` continues to accept the same shape but now displays server-confirmed messages and a realtime typing indicator; it no longer labels messages local-only.

## Project structure

- `src/routes/index.tsx`: screen switcher, saved solo game, room lifecycle, invite-link entry.
- `src/components/sudoku/`: existing visual components with minimal callback additions.
- `src/lib/sudoku.ts`: six-level puzzle generation, validation, conflicts, score metadata.
- `src/lib/room.ts`: multiplayer UI types and pure proposal-display helpers.
- `src/lib/supabase.ts`: browser client and configuration detection.
- `src/lib/room-client.ts`: authenticated room command/realtime adapter.
- `supabase/migrations/`: schema, RLS, and server-side data contract.
- `supabase/functions/sudoku-room/`: authenticated command endpoint and server puzzle generator.
- `public/manus-routes.json`: route manifest for the single `/` page.

## Constraints

No visual redesign, component removal, Lovable metadata removal, or simulated multiplayer fallback. Multiplayer requires Supabase environment values and anonymous Auth enabled in the target Supabase project; when they are absent, the UI reports an actionable configuration error and leaves solo play available. The source tree includes `.env.example` but no credentials.
