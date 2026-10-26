# Supabase setup

1. Create a Supabase project and enable **Authentication → Providers → Anonymous sign-ins**.
2. Apply `migrations/20261026221600_sudoku_together.sql` with the Supabase CLI or SQL editor.
3. Deploy `functions/sudoku-room` with `supabase functions deploy sudoku-room`.
4. Add the project URL and anon key to `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

The browser never receives the service-role key. The `sudoku-room` Edge Function authenticates the caller, performs the trusted mutation, stores the multiplayer solution in an RLS-protected table, and returns a snapshot without that solution. If these values or Anonymous Auth are unavailable, solo play remains usable and multiplayer shows an actionable error rather than simulating players or votes.
