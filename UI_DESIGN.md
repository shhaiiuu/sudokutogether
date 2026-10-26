# Sudoku Together — UI Design & Frontend Contract

Main reference for the frontend of Sudoku Together. **Lovable owns the frontend** (React components, Tailwind styling, UI types, local interactions). **Claude owns the backend and game logic** (puzzle generation/validation, Supabase schema, rooms, presence, realtime sync, server-side voting, persistent chat, saving).

The four reference screenshots (loading, home, difficulty sheet, in-game board) are the visual source of truth. Multiplayer screens extend that same language.

---

## 0. Design System

All tokens live in `src/styles.css` (oklch, mapped through `@theme inline`). Components never use raw color classes.

| Token | Use |
|---|---|
| `background` (off-white blue tint) | Page background |
| `card` (white) | Cards, sheets, board, bottom nav |
| `primary` (bright blue) | Primary buttons, active controls, entered numbers on pad |
| `foreground` (dark navy) | Titles, body text |
| `muted` / `muted-foreground` | Secondary surfaces / labels |
| `accent` | Pale blue chips, pressed states |
| `grid-line` / `grid-strong` | Thin cell lines / 3×3 box borders and outer border |
| `cell-given` / `cell-entered` | Original puzzle digits (near-black) / player digits (blue) |
| `cell-related` / `cell-same` / `cell-selected` | Row-column-box tint / matching number tint / selected cell |
| `cell-conflict` + `destructive` | Wrong/conflicting cell background + red digit |
| `success`, `warning`, `streak` | Ready / approved, trophy & shared notes, flame |
| `p1`–`p4` | Player avatar colors |
| `event-1..3` | Challenge card colors |
| `overlay` | Dim layer behind sheets |

- **Typography:** Figtree (Google Fonts, loaded in `__root.tsx`). Titles 600–800 weight; board digits are regular weight and sized from viewport (`min(7.5vw, 2.25rem)`).
- **Radius:** `--radius: 1rem`; cards `rounded-3xl`, buttons `rounded-full`, app icon `22%`.
- **Shadows:** `shadow-soft` (cards), `shadow-button` (blue glow on primary buttons).
- **Backdrop:** `app-backdrop` utility draws two large, pale-blue diagonal shapes (top-left and bottom-right), as in the loading and home references.
- **Motion:** `animate-cell-pop` (number entry), `animate-shake` (wrong entry), `animate-loader-dot`, plus `tw-animate-css` slide/fade for sheets. Kept short (≤250 ms).

---

## 1. Screens

### 1.1 Loading screen — `LoadingScreen.tsx`
- **Layout:** full-height centered column on `app-backdrop`. A 112 px white rounded-square **3×3 grid icon** (digits 1 2 3 / 6 _ 4 / 7 8 9, with 2, 6, 7, 9 in blue) and three pulsing blue dots below it.
- **Animation:** the digits pop in one after another (90 ms stagger), then the dots pulse.
- **Behavior:** shown only while the app starts (reads local saved data, ≈1.4 s minimum). It always moves on to Home, even when storage can't be read, so it can't get stuck. No buttons or text (has an `aria-label` for screen readers).
- **Backend hook:** replace the fixed delay with "session + saved-game fetch settled (success or error)".

### 1.2 Home screen — `HomeScreen.tsx`
- **Header:** centered wordmark "Sudoku**Together**" (second word in primary). Streak flame + count on the right.
- **Challenge cards:** horizontal snap-scroll row of colored cards (original icons: sun, leaf, mountain): time-left chip, icon, "EVENT" eyebrow, title, translucent **Play** pill.
- **Best score:** "All-Time Best Score" label + trophy + large number, centered in the open middle area.
- **Actions (max-width 28rem, horizontal padding 2rem):**
  - **Continue Game** (primary, two lines: title + clock · time · difficulty). Shown only when there is a saved game; otherwise an empty-state line appears.
  - **New Game** (white, primary text; turns primary when there's no saved game). "+1 flame" badge in the top-right corner. Opens the difficulty sheet.
  - **Play with Friends** (dashed primary outline, users icon) → Lobby.
- **Bottom nav:** Main (active, primary), Daily Challenges, Me (disabled, "Coming soon"). Respects the safe-area inset.

### 1.3 Difficulty selector — `DifficultySheet.tsx`
- White sheet, bottom-anchored on mobile and centered from `sm`. Rows divided by hairlines, large centered blue labels.
- **All six levels are shown:** Easy, Medium, Hard, Expert, Master, Extreme.
- **States:** available = blue, tappable, `aria-pressed` + bold when currently selected; pressed = `accent` background. Master/Extreme currently = **unavailable** (gray, lock icon, note "Not available yet", `aria-disabled`). They never quietly start a different level instead.
- Optional **title** ("New game") and **Restart** row (only inside an existing game).
- Closes with the backdrop or Esc.
- **Availability** comes from `ALL_LEVELS` in `src/lib/sudoku.ts`. Flip `available: true` once the backend can generate those levels.

### 1.4 Solo game screen — `GameScreen.tsx`, `SudokuBoard.tsx`, `GameControls.tsx`
- **Container:** white column, full screen on mobile. From `sm` it becomes a centered rounded card (max-width 32rem).
- **Header row:** back chevron · progress `filled/toFill` (bold, center) · restart/new-puzzle (opens difficulty sheet), pause (circled), settings.
- **Info row (4 columns):** All Time best (trophy) · Difficulty · timer + Score · Mistakes `n/3`.
- **Board:** square `aspect-square`, width capped at `calc(100dvh − 20rem)` so the controls always fit. 2px `grid-strong` outer border and 3×3 dividers, 1px `grid-line` inner lines.
  - Selected cell → `cell-selected`; same row/column/box → `cell-related`; same digit → `cell-same`; wrong/conflict → `cell-conflict` + red digit; givens are near-black, entered digits are blue.
  - Notes: 3×3 mini digits in muted color.
  - Wrong entry: the board shakes briefly. Correct entry: the digit pops in.
- **Controls:** Undo · Erase · Notes (OFF/ON pill) · Hint (count badge). Disabled states use 35% opacity.
- **Number pad:** 9 large blue digits in one row. A digit that's complete on the board turns into a gray ✓ and is disabled. The pad is disabled while no cell is selected.
- **Keyboard:** 1–9, arrows, Backspace/Delete, N (notes).

### 1.5 Multiplayer lobby — `Lobby.tsx`, `PlayerList.tsx`
- **Choose stage:** intro card (icon, "Solve one puzzle together", **Create Room**) and join card (6-character code input, uppercase, letter-spaced, plus **Join** button, disabled until 6 characters).
- **Room stage (stacked cards):**
  - Room code (large, letter-spaced) + copy button. **Share invite link** pill (`/?room=CODE`). Toasts confirm a copy or report a failure.
  - Players `n/4`: avatar (initials on player color, green/gray presence dot), name, "(you)", crown for the host, Online/Disconnected, Ready/Not ready chip. "Waiting for players to join…" while fewer than 2.
  - Difficulty: **3×2 grid of all six levels**. Host can choose; guests see the host's choice highlighted and the others dimmed. Unavailable levels are disabled with "Not available yet".
  - Footer: host → **Start Game** (disabled with "Waiting for everyone to be ready" until there are ≥2 players and all are ready). Guest → **I'm Ready** toggle ("Ready ✓ — waiting for host").
- An info banner states that the room is a demo until the backend is connected.

### 1.6 Multiplayer game screen — `GameScreen.tsx` (with `players`), `ProposalPanel.tsx`
- Same layout as solo plus a compact row under the header: overlapping small avatars (`PlayerBar`) and a "Demo room" chip.
- Info row: Time · Difficulty · Score · Mistakes (—).
- **Proposed vs accepted:** a pending proposal shows in its cell as a **dashed blue outlined, pulsing, lighter digit**. Accepted digits are solid. Shared notes are highlighted with a `warning` tint and don't need a vote.
- **Proposal panel** (takes the place of the controls while open so the board stays visible): dashed number tile, "Row r, Column c", "Proposed by …", status chip, vote list (✓ Yes / ✕ No / ⏱ Waiting / "Skipped" for disconnected players), then:
  - pending + I haven't voted → **No** (muted, red text) / **Yes** (primary) buttons
  - pending + I'm the proposer → **Cancel proposal**
  - resolved → **Dismiss** (also closes by itself after 2.5 s)
- **Status chips:** Waiting for votes · n missing (accent) · Approved · Move applied (success) · Rejected (destructive) · Timed out (muted) · Cancelled (muted).
- Only one pending proposal at a time. New entries are ignored while one is pending.
- **Presence feedback:** a toast "X disconnected" / "X rejoined" appears whenever a player's `online` changes in `players`.
- **Floating chat button:** 56 px primary circle, bottom-right with an unread badge. It moves to the top-right while a proposal panel is open so it doesn't cover the vote buttons.

### 1.7 Chat panel — `ChatPanel.tsx`
- Mobile: bottom sheet across the width, `min(55dvh, 28rem)` tall, so the top of the board stays visible. From `sm`: a 20rem panel on the right.
- Header "Room chat" + status subtitle + close button. Scrollable history that auto-scrolls to the newest message.
- Bubbles: others on the left with avatar + name, muted bubble. Mine on the right, primary bubble. Subtle time under each message. "typing…" line in italics.
- Input (16 px text, so iOS doesn't zoom) + round send button (disabled when empty). Max 300 characters.
- Must not show "sent/delivered" unless the backend confirms. Currently own messages show "local only".

### 1.8 Settings, pause, completion — `Dialogs.tsx`
- **Settings sheet:** switches for Sound, Highlight areas, Highlight identical numbers, Mistake limit. **Done** button.
- **Pause sheet:** pause icon, "Paused", time · difficulty, **Resume** (primary), **Main menu** (secondary). The timer stops while any sheet is open.
- **Completion sheet:** party icon, title ("Puzzle solved!", "Solved together!" in multiplayer, or "Out of mistakes"), stats strip (Time · Difficulty · Score), **Play Again**, **Home**. In multiplayer, every client should open it when the server reports the puzzle is complete.

### 1.9 Responsive behavior
- Mobile-first. Uses `100dvh` and safe-area insets on the header, nav, sheets and pad.
- Board stays square, never wider than the column or than `100dvh − 20rem`. No horizontal scroll (only the challenge cards scroll sideways).
- Sheets sit at the bottom on mobile and are centered dialogs from `sm`.
- Tablet/desktop: the game becomes a centered card (≤32rem), and the lobby and home use a ≤28rem centered column. The grid never grows too large.

---

## 2. Components

| Component | Path |
|---|---|
| App screen switcher | `src/routes/index.tsx` |
| Loading screen | `src/components/sudoku/LoadingScreen.tsx` |
| Logo / grid icon / wordmark | `src/components/sudoku/Logo.tsx` |
| Home screen + bottom nav | `src/components/sudoku/HomeScreen.tsx` |
| Difficulty sheet | `src/components/sudoku/DifficultySheet.tsx` |
| Sheet, PrimaryButton, SecondaryButton | `src/components/sudoku/Sheet.tsx` |
| Game screen (solo + multiplayer) | `src/components/sudoku/GameScreen.tsx` |
| Board + cells + notes | `src/components/sudoku/SudokuBoard.tsx` |
| Controls + number pad | `src/components/sudoku/GameControls.tsx` |
| Lobby | `src/components/sudoku/Lobby.tsx` |
| Avatar, PlayerRow, PlayerBar | `src/components/sudoku/PlayerList.tsx` |
| Proposal / voting panel | `src/components/sudoku/ProposalPanel.tsx` |
| Chat panel | `src/components/sudoku/ChatPanel.tsx` |
| Settings / Pause / Complete | `src/components/sudoku/Dialogs.tsx` |
| Design tokens | `src/styles.css` |
| Room UI types + demo helpers | `src/lib/room.ts` |
| Board helpers + local generator | `src/lib/sudoku.ts` |

---

## 3. Frontend Integration Contract

Types already exported: `Player`, `Vote`, `Proposal` (`src/lib/room.ts`), `Difficulty`, `DifficultyLevel`, `ALL_LEVELS` (`src/lib/sudoku.ts`), `GameState` (`GameScreen.tsx`), `ChatMessage` (`ChatPanel.tsx`), `Settings` (`Dialogs.tsx`).

```ts
interface Player { id: string; name: string; color: "p1"|"p2"|"p3"|"p4"; online: boolean; ready: boolean; host: boolean; isYou?: boolean }
type Vote = "yes" | "no" | "pending";
interface Proposal { index: number /*0–80*/; value: number /*1–9*/; proposerId: string; votes: Record<string, Vote>;
  status: "waiting"|"approved"|"rejected"|"timeout"|"cancelled"; createdAt: number }
interface GameState { puzzle: number[] /*81, 0 = empty*/; solution: number[]; grid: number[]; notes: number[][];
  mistakes: number; elapsed: number; difficulty: Difficulty; score: number; hintsLeft: number }
interface ChatMessage { id: number; playerId: string; text: string; at: number }
```

| Integration point | Input → UI | Output (UI → backend) | Expected UI behavior |
|---|---|---|---|
| **Room info** | `{ code, players: Player[], hostId, difficulty }` | `createRoom()`, `joinRoom(code)`, `leaveRoom()` | Lobby renders the room stage on success. On failure, show a toast ("Room not found", "Room full (4/4)") and stay on the choose stage. Disable buttons while a request is pending. |
| **Ready / start** | `players[].ready`, `room.status` | `setReady(bool)`, `startGame()` (host only) | Start is enabled when ≥2 players and all are ready. Guests switch to the game when `status = "playing"`. |
| **Difficulty** | `room.difficulty: DifficultyLevel`, level availability | `setDifficulty(level)` (host only) | Host grid is interactive. Guests see it read-only. Unavailable levels stay disabled and are never replaced with another level. |
| **Puzzle & board** | `GameState.puzzle`, `grid`, `difficulty`; optional `solution` (solo only) | — | `puzzle[i] ≠ 0` → given styling. In multiplayer, wrong/conflict highlighting should come from server validation instead of the client-side `solution`. |
| **Cell selection** | — | local only (`selected` index) | Highlights are client-side. Optionally broadcast as presence later. |
| **Number entry (solo)** | — | `saveGame(GameState)` (currently `localStorage`) | Applied right away, with undo history. |
| **Number entry (multi)** | — | `proposeMove(index, value)` | Show the pending dashed digit + proposal panel only once the server returns the proposal. Ignore input while one is pending. |
| **Notes** | `notes: number[][]` (shared in multi) | `toggleNote(index, value)` | Solo: private. Multi: tentative tinted candidates, no vote. |
| **Accepted values** | updated `grid` from realtime | — | Accepted digits render solid with the pop animation. |
| **Votes** | `Proposal` updates (votes, status) | `vote(proposalId, "yes"\|"no")`, `cancelProposal(id)` | Status chip and vote list update live. Server decides the outcome (all online players yes → approved; any no → rejected; timeout → timed out). Reference rule: `resolveProposal`. |
| **Presence** | `players[].online` | heartbeat/presence | Changes trigger the disconnected/rejoined toast. Offline voters show "Skipped". |
| **Chat** | `messages: ChatMessage[]`, `typing: string \| null` | `sendMessage(text)`, `setTyping(bool)` | Add a message to the list only after the server confirms it (or show it as "sending…"). Unread badge when the panel is closed. |
| **Completion** | `room.status = "completed"`, final `{ elapsed, score }` | — | Every client opens the shared completion sheet. |
| **Loading / error / connection** | `status: "idle"\|"loading"\|"ready"\|"error"`, `connection: "online"\|"reconnecting"\|"offline"` | `retry()` | Loader only while actually loading. Errors → toast + retry. Reconnecting → a small banner above the board (to add when connected). |

Current component entry points to wire up:
- `GameScreen` props: `initial`, `players?`, `best`, `onHome`, `onChange?(GameState|null)`, `onFinish(score, won)`.
- `Lobby` props: `onBack`, `onStart(players, difficulty)`.
- `ChatPanel` props: `messages`, `players`, `typing`, `onSend`.
- `ProposalPanel` props: `proposal`, `players`, `youId`, `onVote`, `onDismiss`, `onCancel?`.

---

## 4. What is real vs visual-only today

**Working now (client-side):**
- Solo gameplay: board, highlights, notes, undo, erase, hints, mistakes, timer, score, pause, settings, completion.
- Saved game, best score and streak in `localStorage`.
- Difficulty sheet, copy to clipboard, keyboard controls, responsive layout.

**Visual-only / demo stand-ins (to be replaced by Claude's backend):**
- Puzzle generator in `src/lib/sudoku.ts` (temporary client-side generator for Easy–Expert).
- Lobby room creation/joining, simulated friends (Maya, Leo, Aria) joining and readying, simulated host start.
- Simulated votes in multiplayer, proposal timeout timer, chat bot replies and typing indicator.
- Presence toasts (wired to the `players` prop; no real presence yet).
- Invite link (the URL is built, but `?room=` isn't read yet).
- Daily Challenges and Me tabs (disabled), challenge cards (start a normal game).

Nothing in multiplayer syncs across devices yet, and the UI labels this as demo mode.
