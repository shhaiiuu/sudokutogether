import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generatePuzzle, type Difficulty } from "../_shared/sudoku.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_PLAYERS = 4;
const PRESENCE_WINDOW_MS = 90_000;
const levels = new Set<Difficulty>(["Easy", "Medium", "Hard", "Expert", "Master", "Extreme"]);

type Row = Record<string, unknown>;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const fail = (message: string, status = 400) => json({ ok: false, error: message }, status);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return fail("Supabase server configuration is incomplete.", 500);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return fail("Authentication is required.", 401);
    const auth = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();
    if (authError || !user) return fail("Your multiplayer session expired. Please retry.", 401);
    const db = createClient(url, service);
    const body = (await request.json()) as Row;
    const data = await command(db, user.id, String(body.action || ""), body);
    return json({ ok: true, data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "The multiplayer server rejected the request.";
    const status =
      /not found|full|only|must|invalid|already|waiting|host|member|proposal|ready|name|stale|presence|playing|cell|filled|erase|vote/i.test(
        message,
      )
        ? 400
        : 500;
    return fail(message, status);
  }
});

async function command(db: SupabaseClient, userId: string, action: string, body: Row) {
  switch (action) {
    case "create":
      return createRoom(db, userId, String(body.name ?? ""));
    case "join":
      return joinRoom(db, userId, String(body.code ?? ""), String(body.name ?? ""));
    case "snapshot":
      return snapshot(db, userId, String(body.roomId));
    case "leave":
      await leaveRoom(db, userId, String(body.roomId));
      return null;
    case "ready":
      await requireMember(db, userId, String(body.roomId));
      await setReady(db, userId, String(body.roomId), Boolean(body.ready));
      return snapshot(db, userId, String(body.roomId));
    case "difficulty":
      await requireMember(db, userId, String(body.roomId));
      await setDifficulty(db, userId, String(body.roomId), String(body.difficulty) as Difficulty);
      return snapshot(db, userId, String(body.roomId));
    case "start":
      await requireMember(db, userId, String(body.roomId));
      return startGame(db, userId, String(body.roomId));
    case "propose":
      await requireMember(db, userId, String(body.roomId));
      return propose(db, userId, String(body.roomId), Number(body.index), Number(body.value));
    case "vote":
      await requireMember(db, userId, String(body.roomId));
      return vote(db, userId, String(body.roomId), String(body.proposalId), String(body.vote));
    case "cancel":
      await requireMember(db, userId, String(body.roomId));
      return cancel(db, userId, String(body.roomId), String(body.proposalId));
    case "note":
      await requireMember(db, userId, String(body.roomId));
      return note(db, userId, String(body.roomId), Number(body.index), Number(body.value));
    case "clear-notes":
      await requireMember(db, userId, String(body.roomId));
      return clearNotes(db, userId, String(body.roomId), Number(body.index));
    case "erase":
      await requireMember(db, userId, String(body.roomId));
      return eraseCell(db, userId, String(body.roomId), Number(body.index));
    case "message":
      await requireMember(db, userId, String(body.roomId));
      return message(db, userId, String(body.roomId), String(body.text || ""));
    case "presence":
      await presence(db, userId, String(body.roomId), Boolean(body.online));
      return null;
    default:
      throw new Error("Unknown room command.");
  }
}

async function createRoom(db: SupabaseClient, userId: string, name: string) {
  const clean = cleanName(name);
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const room = await db
      .from("rooms")
      .insert({ code, host_id: userId })
      .select("id, code, host_id, difficulty, status")
      .single();
    if (room.error?.code === "23505") continue;
    if (room.error) throw room.error;
    const member = await db
      .from("room_members")
      .insert({
        room_id: room.data.id,
        user_id: userId,
        name: clean,
        color: "p1",
        ready: true,
        online: true,
      })
      .select()
      .single();
    if (member.error) {
      await db.from("rooms").delete().eq("id", room.data.id);
      throw member.error;
    }
    return snapshot(db, userId, room.data.id);
  }
  throw new Error("Could not allocate a room code. Please retry.");
}

async function joinRoom(db: SupabaseClient, userId: string, rawCode: string, name: string) {
  const code = rawCode.trim().toUpperCase();
  const joined = await db.rpc("join_room_atomic", {
    p_code: code,
    p_user_id: userId,
    p_name: cleanName(name),
  });
  if (joined.error) throw joined.error;
  return snapshot(db, userId, joined.data as string);
}

async function requireMember(db: SupabaseClient, userId: string, roomId: string) {
  const { data } = await db
    .from("room_members")
    .select("room_id, user_id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("You are not a member of this room.");
}

async function setReady(db: SupabaseClient, userId: string, roomId: string, ready: boolean) {
  const room = await getRoom(db, roomId);
  if (room.status !== "waiting") throw new Error("This room is no longer waiting for players.");
  const result = await db
    .from("room_members")
    .update({ ready, online: true, last_seen_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (result.error) throw result.error;
}

async function setDifficulty(
  db: SupabaseClient,
  userId: string,
  roomId: string,
  difficulty: Difficulty,
) {
  if (!levels.has(difficulty)) throw new Error("Unsupported difficulty.");
  const room = await getRoom(db, roomId);
  if (room.host_id !== userId) throw new Error("Only the host can choose difficulty.");
  if (room.status !== "waiting")
    throw new Error("Difficulty can only change before the game starts.");
  const result = await db.from("rooms").update({ difficulty }).eq("id", roomId);
  if (result.error) throw result.error;
}

async function startGame(db: SupabaseClient, userId: string, roomId: string) {
  const room = await getRoom(db, roomId);
  if (room.host_id !== userId) throw new Error("Only the host can start the game.");
  if (room.status !== "waiting") throw new Error("This room has already started.");
  const members = await db
    .from("room_members")
    .select("user_id, ready, online, last_seen_at")
    .eq("room_id", roomId);
  if (members.error) throw members.error;
  const live = (members.data ?? []).filter(
    (m: Row) => Boolean(m.online) && isFresh(m.last_seen_at),
  );
  if (live.length < 2 || live.length > MAX_PLAYERS || live.some((m: Row) => !m.ready))
    throw new Error("Waiting for everyone to be ready.");
  const { puzzle, solution } = generatePuzzle(room.difficulty as Difficulty);
  const started = await db.rpc("start_game_atomic", {
    p_room_id: roomId,
    p_host_id: userId,
    p_puzzle: puzzle,
    p_solution: solution,
  });
  if (started.error) throw started.error;
  return snapshot(db, userId, roomId);
}

async function propose(
  db: SupabaseClient,
  userId: string,
  roomId: string,
  index: number,
  value: number,
) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > 80 ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 9
  )
    throw new Error("Invalid move.");
  const inserted = await db.rpc("create_proposal_atomic", {
    p_room_id: roomId,
    p_proposer_id: userId,
    p_cell_index: index,
    p_value: value,
  });
  if (inserted.error) throw inserted.error;
  if (inserted.data) {
    await db.from("proposal_votes").upsert(
      {
        room_id: roomId,
        proposal_id: inserted.data,
        voter_id: userId,
        vote: "yes",
      },
      { onConflict: "proposal_id,voter_id" },
    );
  }
  return snapshot(db, userId, roomId);
}

async function vote(
  db: SupabaseClient,
  userId: string,
  roomId: string,
  proposalId: string,
  choice: string,
) {
  if (choice !== "yes" && choice !== "no") throw new Error("Invalid vote.");
  const saved = await db.rpc("record_vote_and_resolve", {
    p_room_id: roomId,
    p_proposal_id: proposalId,
    p_voter_id: userId,
    p_vote: choice,
  });
  if (saved.error) throw saved.error;
  return snapshot(db, userId, roomId);
}

async function cancel(db: SupabaseClient, userId: string, roomId: string, proposalId: string) {
  const proposal = await getProposal(db, roomId, proposalId);
  if (proposal.proposer_id !== userId || proposal.status !== "waiting")
    throw new Error("Only the proposer can cancel a pending move.");
  const updated = await db
    .from("proposals")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", "waiting");
  if (updated.error) throw updated.error;
  return snapshot(db, userId, roomId);
}

async function note(
  db: SupabaseClient,
  userId: string,
  roomId: string,
  index: number,
  value: number,
) {
  if (index < 0 || index > 80 || value < 1 || value > 9) throw new Error("Invalid note.");
  const current = await db
    .from("room_notes")
    .select("values")
    .eq("room_id", roomId)
    .eq("cell_index", index)
    .maybeSingle();
  if (current.error) throw current.error;
  const values = new Set<number>(current.data?.values ?? []);
  if (values.has(value)) values.delete(value);
  else values.add(value);
  const saved = await db.from("room_notes").upsert({
    room_id: roomId,
    cell_index: index,
    values: [...values].sort((a, b) => a - b),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (saved.error) throw saved.error;
  return snapshot(db, userId, roomId);
}
async function clearNotes(db: SupabaseClient, userId: string, roomId: string, index: number) {
  if (index < 0 || index > 80) throw new Error("Invalid note cell.");
  const removed = await db
    .from("room_notes")
    .delete()
    .eq("room_id", roomId)
    .eq("cell_index", index);
  if (removed.error) throw removed.error;
  return snapshot(db, userId, roomId);
}

async function eraseCell(db: SupabaseClient, userId: string, roomId: string, index: number) {
  if (index < 0 || index > 80) throw new Error("Invalid erase cell.");
  const erased = await db.rpc("erase_room_cell_atomic", {
    p_room_id: roomId,
    p_user_id: userId,
    p_cell_index: index,
  });
  if (erased.error) throw erased.error;
  return snapshot(db, userId, roomId);
}

async function message(db: SupabaseClient, userId: string, roomId: string, text: string) {
  const clean = text.trim().slice(0, 300);
  if (!clean) throw new Error("Message cannot be empty.");
  const saved = await db
    .from("chat_messages")
    .insert({ room_id: roomId, user_id: userId, text: clean })
    .select("id")
    .single();
  if (saved.error) throw saved.error;
  return snapshot(db, userId, roomId);
}
async function presence(db: SupabaseClient, userId: string, roomId: string, online: boolean) {
  const saved = await db
    .from("room_members")
    .update({ online, last_seen_at: new Date().toISOString() })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  if (saved.error) throw saved.error;
}
async function leaveRoom(db: SupabaseClient, userId: string, roomId: string) {
  const room = await getRoom(db, roomId);
  if (room.status === "playing") {
    const offline = await db
      .from("room_members")
      .update({ online: false, last_seen_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", userId);
    if (offline.error) throw offline.error;
    await db.from("rooms").update({ updated_at: new Date().toISOString() }).eq("id", roomId);
    return;
  }
  await db.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
  const members = await db
    .from("room_members")
    .select("user_id, joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (!members.data?.length) {
    await db.from("rooms").delete().eq("id", roomId);
    return;
  }
  const updateData =
    room.host_id === userId
      ? { host_id: members.data[0].user_id, updated_at: new Date().toISOString() }
      : { updated_at: new Date().toISOString() };
  await db.from("rooms").update(updateData).eq("id", roomId);
}

async function snapshot(db: SupabaseClient, userId: string, roomId: string): Promise<unknown> {
  const [, synced] = await Promise.all([
    requireMember(db, userId, roomId),
    db.rpc("sync_room_proposals", { p_room_id: roomId }),
  ]);
  if (synced.error) throw synced.error;

  const [room, membersResult, gameResult, pendingResult, notesResult, chatsResult] =
    await Promise.all([
      getRoom(db, roomId),
      db
        .from("room_members")
        .select("user_id, name, color, ready, online, last_seen_at")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true }),
      db.from("game_states").select("*").eq("room_id", roomId).maybeSingle(),
      db
        .from("proposals")
        .select("*")
        .eq("room_id", roomId)
        .in("status", ["waiting", "paused", "approved", "rejected", "timeout", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("room_notes").select("cell_index, values").eq("room_id", roomId),
      db
        .from("chat_messages")
        .select("id, user_id, text, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

  if (membersResult.error) throw membersResult.error;
  if (gameResult.error) throw gameResult.error;
  if (pendingResult.error) throw pendingResult.error;
  if (notesResult.error) throw notesResult.error;
  if (chatsResult.error) throw chatsResult.error;

  const members = membersResult;
  const game = room.status === "waiting" ? null : gameResult.data;
  const pending = pendingResult;
  const activeProposal =
    pending.data &&
    (pending.data.status === "waiting" ||
      pending.data.status === "paused" ||
      Date.now() - Date.parse(pending.data.created_at) < 4_000)
      ? pending.data
      : null;
  const votes = activeProposal
    ? await db.from("proposal_votes").select("voter_id, vote").eq("proposal_id", activeProposal.id)
    : { data: [] };
  const notes = notesResult;
  const chats = chatsResult;
  const playerRows = members.data ?? [];
  const players = playerRows.map((m: Row) => ({
    id: m.user_id,
    name: m.name,
    color: m.color,
    ready: m.ready,
    host: m.user_id === room.host_id,
    online: Boolean(m.online && isFresh(m.last_seen_at)),
    isYou: m.user_id === userId,
  }));
  const proposal = activeProposal
    ? {
        id: activeProposal.id,
        index: activeProposal.cell_index,
        value: activeProposal.value,
        proposerId: activeProposal.proposer_id,
        status: activeProposal.status,
        createdAt: Date.parse(activeProposal.created_at),
        eligibleVoterIds: activeProposal.eligible_voter_ids,
        activeDeadlineAt: Date.parse(activeProposal.active_deadline_at),
        disconnectDeadlineAt: activeProposal.disconnect_deadline_at
          ? Date.parse(activeProposal.disconnect_deadline_at)
          : undefined,
        votes: Object.fromEntries(
          (activeProposal.eligible_voter_ids as string[]).map((id) => [
            id,
            id === activeProposal.proposer_id
              ? "yes"
              : (votes.data?.find((v: Row) => v.voter_id === id)?.vote ?? "pending"),
          ]),
        ),
      }
    : null;
  const safeGame = game
    ? {
        puzzle: game.puzzle,
        grid: game.grid,
        erasable: game.grid.map(
          (value: number, i: number) =>
            game.puzzle[i] === 0 && value !== 0 && value !== game.solution[i],
        ),
        notes: Array.from(
          { length: 81 },
          (_, i) => notes.data?.find((n: Row) => n.cell_index === i)?.values ?? [],
        ),
        elapsed: Math.max(
          game.elapsed,
          room.status === "playing"
            ? Math.floor((Date.now() - Date.parse(game.started_at)) / 1000)
            : game.elapsed,
        ),
        score: game.score,
        mistakes: game.mistakes ?? 0,
        difficulty: game.difficulty ?? room.difficulty,
        completed: room.status === "completed",
        revision: game.revision,
      }
    : null;
  return {
    roomId,
    code: room.code,
    hostId: room.host_id,
    difficulty: room.difficulty,
    status: room.status,
    players,
    game: safeGame,
    proposal,
    messages: (chats.data ?? []).map((m: Row) => ({
      id: m.id,
      playerId: m.user_id,
      text: m.text,
      at: Date.parse(m.created_at),
    })),
  };
}
async function getRoom(db: SupabaseClient, roomId: string) {
  const { data, error } = await db.from("rooms").select("*").eq("id", roomId).single();
  if (error || !data) throw new Error("Room not found.");
  return data as Row;
}
async function getGame(db: SupabaseClient, roomId: string) {
  const { data, error } = await db.from("game_states").select("*").eq("room_id", roomId).single();
  if (error || !data) throw new Error("Game state not found.");
  return data as Row;
}
async function getProposal(db: SupabaseClient, roomId: string, id: string) {
  const { data, error } = await db
    .from("proposals")
    .select("*")
    .eq("room_id", roomId)
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Proposal not found.");
  return data as Row;
}
function isFresh(value: string) {
  return Date.now() - Date.parse(value) < PRESENCE_WINDOW_MS;
}
function cleanName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter your name before continuing.");
  if (trimmed.length > 32) throw new Error("Name must be 32 characters or fewer.");
  const clean = trimmed.replace(/[^\p{L}\p{N} _-]/gu, "");
  if (!clean) throw new Error("Enter a name using letters, numbers, spaces, - or _.");
  return clean;
}
function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}
