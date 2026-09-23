/**
 * Mafia – real-time multiplayer game server
 * Express (static files + tiny HTTP API) + Socket.io (game events).
 *
 * All state lives in memory, keyed by a 4-character room code.
 * No accounts: each player receives a random `playerId` token when joining.
 * The client should keep it (e.g. sessionStorage) and send it again in
 * `join_room` to reconnect after a refresh / dropped connection.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CLIENT → SERVER EVENTS (all support an optional ack callback)
 *   create_room    { name, code? }              → { ok, code, playerId }
 *   join_room      { code, name?, playerId? }   → { ok, code, playerId, reconnected }
 *   leave_room     {}
 *   kick_player    { playerId }                 (host, lobby only)
 *   update_roles   { roles } | { auto: true }   (host, lobby only) roles = { Mafia, Detective, Doctor, Townsperson } counts
 *   start_game     { roles? }                   (host, lobby only; optional roles are applied first)
 *   night_action   { targetId }                 (Mafia / Doctor / Detective)
 *   advance_phase  {}                           (host, skips day discussion)
 *   cast_vote      { targetId | null }          (null = skip / no elimination)
 *   chat_message   { text }
 *   play_again     {}                           (host, after game over)
 *   request_state  {}                           (re-sends `room_state`)
 *
 * SERVER → CLIENT EVENTS
 *   room_state             personalised snapshot (role/teammates only when allowed;
 *                          in the lobby it carries `roleSettings` for everyone)
 *   roles_updated          { counts, custom, total, connected, problem }  (lobby, whole room, live sync)
 *   role_assigned          { role, teammates }                (private)
 *   game_started           { playerCount, mafiaCount, roles }
 *   phase_changed          { phase, day, endsAt, serverTime }
 *   day_event              { day, text, killed }              (night results)
 *   player_eliminated      { id, name, role, cause, day }
 *   investigation_result   { targetId, targetName, result }   (Detective only)
 *   night_action_confirmed { role, targetId }                 (actor only)
 *   mafia_picks            { picks: [{ mafiaId, targetId }] } (Mafia team only)
 *   vote_update            { counts, skip, voted, total }
 *   vote_result            { eliminated, reason, text, counts, skip, votes }
 *   game_over              { winner, text, players }
 *   chat_message           { id, from, text, channel, ts }
 *   announcement           { text, type, ts }
 *   kicked / session_replaced / error_message
 * ──────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

/* ────────────────────────────── Configuration ────────────────────────────── */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const envSeconds = (name, fallback) => {
  const n = Number(process.env[name]);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * 1000;
};

const PORT = Number(process.env.PORT) || 3000;

const CFG = Object.freeze({
  minPlayers: 4,
  maxPlayers: 15,
  minName: 2,
  maxName: 16,
  maxChat: 300,
  nightMs: envSeconds('NIGHT_SECONDS', 60),
  dayMs: envSeconds('DAY_SECONDS', 90),
  voteMs: envSeconds('VOTE_SECONDS', 45),
  lobbyGraceMs: 20_000, // how long a disconnected lobby player is kept
  emptyRoomTtlMs: 5 * 60_000, // how long a room with nobody connected survives
  rateBurst: 20, // per-socket token bucket
  ratePerSec: 5,
});

const PHASE = Object.freeze({
  LOBBY: 'lobby',
  NIGHT: 'night',
  DAY: 'day',
  VOTING: 'voting',
  ENDED: 'ended',
});

const ROLE = Object.freeze({
  MAFIA: 'Mafia',
  DOCTOR: 'Doctor',
  DETECTIVE: 'Detective',
  TOWN: 'Townsperson',
});

const NIGHT_ROLES = new Set([ROLE.MAFIA, ROLE.DOCTOR, ROLE.DETECTIVE]);
/** Display order of the role counters (also the keys of the `roles` payload). */
const ROLE_ORDER = Object.freeze([ROLE.MAFIA, ROLE.DETECTIVE, ROLE.DOCTOR, ROLE.TOWN]);
const SKIP = 'skip';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_REGEX = /^[A-Z0-9]{4}$/;

/* ─────────────────────────────── Server setup ────────────────────────────── */

fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(express.static(PUBLIC_DIR));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10_000, // 10 KB – plenty for game events, blocks abuse
  cors: process.env.CORS_ORIGIN
    ? { origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) }
    : undefined,
});

/** @type {Map<string, Room>} */
const rooms = new Map();

/* ──────────────────────────────── Utilities ──────────────────────────────── */

class GameError extends Error {}

function secureShuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const randomPick = (arr) => arr[crypto.randomInt(arr.length)];

function normalizeCode(raw) {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!CODE_REGEX.test(code)) {
    throw new GameError('Room codes must be exactly 4 letters or digits.');
  }
  return code;
}

function generateRoomCode() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new GameError('Could not generate a free room code. Please try again.');
}

function cleanName(raw) {
  if (typeof raw !== 'string') throw new GameError('A player name is required.');
  const name = raw
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E\uFEFF<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CFG.maxName);
  if (name.length < CFG.minName) {
    throw new GameError(`Names must be at least ${CFG.minName} characters long.`);
  }
  return name;
}

function cleanChat(raw) {
  if (typeof raw !== 'string') throw new GameError('Message must be text.');
  const text = raw
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E\uFEFF]/g, '')
    .trim()
    .slice(0, CFG.maxChat);
  if (!text) throw new GameError('Message is empty.');
  return text;
}

/* ─────────────────────────── Room / player helpers ───────────────────────── */

/**
 * @typedef {Object} Player
 * @property {string} id            persistent token (also the public player id)
 * @property {string} name
 * @property {string|null} socketId
 * @property {boolean} connected
 * @property {string|null} role
 * @property {boolean} alive
 * @property {boolean} left         explicitly left mid-game
 * @property {string|null} deathCause  'mafia' | 'vote' | 'left'
 * @property {Array} investigations Detective results
 * @property {NodeJS.Timeout|null} disconnectTimer
 *
 * @typedef {Object} Room
 * @property {string} code
 * @property {string|null} hostId
 * @property {Map<string, Player>} players
 * @property {string} phase
 * @property {number} day
 * @property {number|null} phaseEndsAt
 * @property {number} phaseToken
 * @property {NodeJS.Timeout|null} timer
 * @property {{mafiaVotes: Map<string,string>, doctorSaves: Map<string,string>, detectiveTargets: Map<string,string>}} night
 *           each map is actorId → targetId, so several Doctors / Detectives can act in one night
 * @property {Object|null} roleConfig   host's custom role counts (null while auto-balancing)
 * @property {boolean} rolesCustom      true once the host has set the counts by hand
 * @property {Map<string,string>} votes  voterId → targetId | SKIP
 * @property {string|null} winner
 * @property {Array} log
 * @property {NodeJS.Timeout|null} cleanupTimer
 */

const freshNight = () => ({
  mafiaVotes: new Map(),
  doctorSaves: new Map(),
  detectiveTargets: new Map(),
});

function createRoom(code) {
  /** @type {Room} */
  const room = {
    code,
    hostId: null,
    players: new Map(),
    phase: PHASE.LOBBY,
    day: 0,
    phaseEndsAt: null,
    phaseToken: 0,
    timer: null,
    night: freshNight(),
    roleConfig: null,
    rolesCustom: false,
    votes: new Map(),
    winner: null,
    log: [],
    cleanupTimer: null,
  };
  rooms.set(code, room);
  return room;
}

function createPlayer(name) {
  /** @type {Player} */
  return {
    id: crypto.randomUUID(),
    name,
    socketId: null,
    connected: false,
    role: null,
    alive: true,
    left: false,
    deathCause: null,
    investigations: [],
    disconnectTimer: null,
  };
}

const publicPlayer = (p) => ({ id: p.id, name: p.name });
const allPlayers = (room) => [...room.players.values()];
const alivePlayers = (room) => allPlayers(room).filter((p) => p.alive);

function counts(room) {
  const alive = alivePlayers(room);
  const mafia = alive.filter((p) => p.role === ROLE.MAFIA).length;
  return { mafia, town: alive.length - mafia };
}

function addLog(room, text, type = 'info') {
  room.log.push({ ts: Date.now(), type, text });
  if (room.log.length > 100) room.log.splice(0, room.log.length - 100);
}

function announce(room, text, type = 'info') {
  addLog(room, text, type);
  emitToRoom(room, 'announcement', { text, type, ts: Date.now() });
}

/* ───────────────────────────── Role configuration ────────────────────────── */

const connectedCount = (room) => allPlayers(room).filter((p) => p.connected && !p.left).length;
const sumRoles = (config) => ROLE_ORDER.reduce((sum, role) => sum + config[role], 0);

/** Balanced suggestion used until the host sets the counts by hand ("auto" mode). */
function defaultRoleConfig(playerCount) {
  const n = Math.max(0, playerCount);
  if (n === 0) return Object.fromEntries(ROLE_ORDER.map((role) => [role, 0]));
  const mafia = Math.max(1, Math.floor(n / 4)); // 4-7 → 1, 8-11 → 2, 12-15 → 3
  const rest = Math.max(0, n - mafia);
  const doctor = rest >= 2 ? 1 : 0;
  const detective = rest >= 3 ? 1 : 0;
  return {
    [ROLE.MAFIA]: mafia,
    [ROLE.DETECTIVE]: detective,
    [ROLE.DOCTOR]: doctor,
    [ROLE.TOWN]: rest - doctor - detective,
  };
}

/** The counts that would be dealt right now: the host's custom counts, or the auto suggestion. */
function effectiveRoles(room) {
  return room.rolesCustom && room.roleConfig
    ? { ...room.roleConfig }
    : defaultRoleConfig(connectedCount(room));
}

/**
 * Why a role setup cannot start a game (null = it can). Checked in this order:
 *   minPlayers → mismatch → noMafia → mafiaMajority
 */
function roleProblem(config, playerCount) {
  if (playerCount < CFG.minPlayers) return 'minPlayers';
  if (sumRoles(config) !== playerCount) return 'mismatch';
  if (config[ROLE.MAFIA] < 1) return 'noMafia';
  // With Mafia >= everyone else the win check would end the game after night one, unplayed.
  if (config[ROLE.MAFIA] >= playerCount - config[ROLE.MAFIA]) return 'mafiaMajority';
  return null;
}

const ROLE_PROBLEM_MESSAGES = {
  minPlayers: () => `At least ${CFG.minPlayers} connected players are required to start.`,
  mismatch: () => 'Role count must match total players in room!',
  noMafia: () => 'At least one Mafia is required.',
  mafiaMajority: () => 'Mafia must be outnumbered by the other roles.',
};

/** Public snapshot of the lobby's role setup (same for every viewer). */
function roleSettingsFor(room) {
  const connected = connectedCount(room);
  const counts = effectiveRoles(room);
  return {
    counts,
    custom: room.rolesCustom,
    total: sumRoles(counts),
    connected,
    problem: roleProblem(counts, connected),
  };
}

/** Validates a client-supplied `{ Mafia, Detective, Doctor, Townsperson }` object. */
function parseRoleConfig(input, fallback) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GameError('Role settings are missing.');
  }
  const config = {};
  for (const role of ROLE_ORDER) {
    const value = input[role] ?? fallback[role];
    if (!Number.isInteger(value) || value < 0 || value > CFG.maxPlayers) {
      throw new GameError(`Role counts must be whole numbers from 0 to ${CFG.maxPlayers}.`);
    }
    config[role] = value;
  }
  return config;
}

/** One card per role according to the counts, shuffled with a cryptographic RNG. */
function buildRoleDeck(config) {
  const deck = [];
  for (const role of ROLE_ORDER) {
    for (let i = 0; i < config[role]; i++) deck.push(role);
  }
  return secureShuffle(deck);
}

/* ─────────────────────────────── Emit helpers ────────────────────────────── */

const emitToRoom = (room, event, payload) => io.to(room.code).emit(event, payload);

function emitToPlayer(player, event, payload) {
  if (player.connected && player.socketId) io.to(player.socketId).emit(event, payload);
}

function emitToPlayers(room, predicate, event, payload) {
  for (const p of room.players.values()) if (predicate(p)) emitToPlayer(p, event, payload);
}

function canSeeRole(room, viewer, target) {
  if (room.phase === PHASE.ENDED) return true;
  if (target.id === viewer.id) return true;
  if (!target.alive && room.phase !== PHASE.LOBBY) return true; // revealed on death
  return viewer.role === ROLE.MAFIA && target.role === ROLE.MAFIA;
}

function nightChoiceOf(room, player) {
  switch (player.role) {
    case ROLE.MAFIA:
      return room.night.mafiaVotes.get(player.id) ?? null;
    case ROLE.DOCTOR:
      return room.night.doctorSaves.get(player.id) ?? null;
    case ROLE.DETECTIVE:
      return room.night.detectiveTargets.get(player.id) ?? null;
    default:
      return null;
  }
}

function voteSnapshot(room) {
  const { counts: voteCounts, skip } = tallyVotes(room);
  return {
    counts: voteCounts,
    skip,
    voted: [...room.votes.keys()],
    total: alivePlayers(room).length,
  };
}

/** Personalised state: never leaks other players' roles. */
function stateFor(room, viewer) {
  const state = {
    code: room.code,
    phase: room.phase,
    day: room.day,
    hostId: room.hostId,
    minPlayers: CFG.minPlayers,
    maxPlayers: CFG.maxPlayers,
    phaseEndsAt: room.phaseEndsAt,
    serverTime: Date.now(),
    winner: room.winner,
    players: allPlayers(room).map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      connected: p.connected,
      left: p.left,
      isHost: p.id === room.hostId,
      role: canSeeRole(room, viewer, p) ? p.role : null,
      deathCause: p.alive ? null : p.deathCause,
    })),
    you: {
      id: viewer.id,
      name: viewer.name,
      role: viewer.role,
      alive: viewer.alive,
      isHost: viewer.id === room.hostId,
      teammates:
        viewer.role === ROLE.MAFIA
          ? allPlayers(room)
              .filter((p) => p.role === ROLE.MAFIA && p.id !== viewer.id)
              .map(publicPlayer)
          : [],
      investigations: viewer.role === ROLE.DETECTIVE ? viewer.investigations : [],
    },
    night: null,
    vote: null,
    roleSettings: room.phase === PHASE.LOBBY ? roleSettingsFor(room) : null,
    log: room.log.slice(-50),
  };

  if (room.phase === PHASE.NIGHT && viewer.alive && NIGHT_ROLES.has(viewer.role)) {
    state.night = {
      role: viewer.role,
      myTarget: nightChoiceOf(room, viewer),
      locked: viewer.role === ROLE.DETECTIVE && room.night.detectiveTargets.has(viewer.id),
      teamPicks:
        viewer.role === ROLE.MAFIA
          ? [...room.night.mafiaVotes].map(([mafiaId, targetId]) => ({ mafiaId, targetId }))
          : [],
    };
  }

  if (room.phase === PHASE.VOTING) {
    state.vote = { ...voteSnapshot(room), myVote: room.votes.get(viewer.id) ?? null };
  }

  return state;
}

function broadcastState(room) {
  for (const p of room.players.values()) emitToPlayer(p, 'room_state', stateFor(room, p));
}

/* ───────────────────────────── Timers & lifecycle ────────────────────────── */

function clearPhaseTimer(room) {
  clearTimeout(room.timer);
  room.timer = null;
  room.phaseToken++;
  room.phaseEndsAt = null;
}

function schedulePhaseTimer(room, ms, onExpire) {
  clearPhaseTimer(room);
  const token = room.phaseToken;
  room.phaseEndsAt = Date.now() + ms;
  room.timer = setTimeout(() => {
    if (room.phaseToken !== token || !rooms.has(room.code)) return; // stale timer
    try {
      onExpire(room);
    } catch (err) {
      console.error(`[room ${room.code}] phase timer error:`, err);
    }
  }, ms);
}

function emitPhaseChanged(room) {
  emitToRoom(room, 'phase_changed', {
    phase: room.phase,
    day: room.day,
    endsAt: room.phaseEndsAt,
    serverTime: Date.now(),
  });
}

function destroyRoom(room) {
  clearPhaseTimer(room);
  clearTimeout(room.cleanupTimer);
  for (const p of room.players.values()) clearTimeout(p.disconnectTimer);
  rooms.delete(room.code);
  console.log(`[room ${room.code}] destroyed (${rooms.size} rooms active)`);
}

function scheduleRoomCleanup(room) {
  if (allPlayers(room).some((p) => p.connected)) return;
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    if (!allPlayers(room).some((p) => p.connected)) destroyRoom(room);
  }, CFG.emptyRoomTtlMs);
}

function ensureHost(room) {
  const host = room.players.get(room.hostId);
  if (host && host.connected && !host.left) return;
  const next = allPlayers(room).find((p) => p.connected && !p.left);
  if (next) room.hostId = next.id;
  else if (!host) room.hostId = allPlayers(room)[0]?.id ?? null;
}

function detachSocket(socketId, roomCode) {
  const s = socketId ? io.sockets.sockets.get(socketId) : null;
  if (!s) return;
  s.leave(roomCode);
  delete s.data.roomCode;
  delete s.data.playerId;
}

function attachSocket(socket, room, player) {
  if (player.socketId && player.socketId !== socket.id) {
    const old = io.sockets.sockets.get(player.socketId);
    if (old) {
      detachSocket(old.id, room.code);
      old.emit('session_replaced');
    }
  }
  clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;

  player.socketId = socket.id;
  player.connected = true;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}

function removePlayer(room, player) {
  clearTimeout(player.disconnectTimer);
  room.players.delete(player.id);
  detachSocket(player.socketId, room.code);
  player.socketId = null;
  player.connected = false;

  if (room.players.size === 0) return destroyRoom(room);
  addLog(room, `${player.name} left the room.`);
  ensureHost(room);
  broadcastState(room);
  scheduleRoomCleanup(room);
}

/* ───────────────────────────── Game state machine ────────────────────────── */

function startGame(room) {
  // Validate BEFORE touching the room, so a rejected start has no side effects.
  const config = effectiveRoles(room);
  const problem = roleProblem(config, connectedCount(room));
  if (problem) throw new GameError(ROLE_PROBLEM_MESSAGES[problem]());

  // Drop anyone who is in the lobby but currently disconnected.
  for (const p of allPlayers(room)) {
    if (!p.connected) {
      clearTimeout(p.disconnectTimer);
      room.players.delete(p.id);
    }
  }
  ensureHost(room);

  room.log = [];
  room.day = 0;
  room.winner = null;
  room.votes.clear();
  room.night = freshNight();

  // Build the deck from the host's exact counts, shuffle it, deal one card per connected player.
  const players = allPlayers(room);
  const n = players.length;
  const deck = buildRoleDeck(config);
  if (deck.length !== n) throw new GameError(ROLE_PROBLEM_MESSAGES.mismatch()); // defensive: cannot happen after validation

  players.forEach((p, i) => {
    p.role = deck[i];
    p.alive = true;
    p.left = false;
    p.deathCause = null;
    p.investigations = [];
  });

  const mafiaTeam = players.filter((p) => p.role === ROLE.MAFIA).map(publicPlayer);
  for (const p of players) {
    emitToPlayer(p, 'role_assigned', {
      role: p.role,
      teammates: p.role === ROLE.MAFIA ? mafiaTeam.filter((t) => t.id !== p.id) : [],
    });
  }

  const mafiaCount = config[ROLE.MAFIA];
  addLog(room, `The game has begun with ${n} players (${mafiaCount} Mafia).`, 'game');
  emitToRoom(room, 'game_started', { playerCount: n, mafiaCount, roles: config });
  beginNight(room);
}

function beginNight(room) {
  room.phase = PHASE.NIGHT;
  room.day += 1;
  room.night = freshNight();
  room.votes.clear();

  addLog(room, `Night ${room.day} falls. The town goes to sleep.`, 'phase');
  schedulePhaseTimer(room, CFG.nightMs, resolveNight);
  emitPhaseChanged(room);
  broadcastState(room);
}

function hasActed(room, player) {
  switch (player.role) {
    case ROLE.MAFIA:
      return room.night.mafiaVotes.has(player.id);
    case ROLE.DOCTOR:
      return room.night.doctorSaves.has(player.id);
    case ROLE.DETECTIVE:
      return room.night.detectiveTargets.has(player.id);
    default:
      return true;
  }
}

function checkNightComplete(room) {
  if (room.phase !== PHASE.NIGHT) return;
  const actors = alivePlayers(room).filter((p) => NIGHT_ROLES.has(p.role));
  if (actors.every((p) => hasActed(room, p))) resolveNight(room);
}

function pickMafiaTarget(room) {
  const tally = new Map();
  for (const targetId of room.night.mafiaVotes.values()) {
    tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  const top = Math.max(...tally.values());
  return randomPick([...tally].filter(([, n]) => n === top).map(([id]) => id));
}

function eliminate(room, player, cause) {
  player.alive = false;
  player.deathCause = cause;
  const info = { id: player.id, name: player.name, role: player.role, cause, day: room.day };
  emitToRoom(room, 'player_eliminated', info);
  return info;
}

/** Night → Day: resolve Mafia kill vs. Doctor save, announce, check win. */
function resolveNight(room) {
  if (room.phase !== PHASE.NIGHT) return;
  clearPhaseTimer(room);

  const targetId = pickMafiaTarget(room);
  const saved = new Set(room.night.doctorSaves.values()); // every Doctor's patient
  const victim = targetId && !saved.has(targetId) ? room.players.get(targetId) : null;

  const killed = victim && victim.alive ? eliminate(room, victim, 'mafia') : null;
  const text = killed
    ? `${killed.name} was killed by the Mafia during the night. They were the ${killed.role}.`
    : 'Dawn breaks and, remarkably, no one died last night.';

  room.phase = PHASE.DAY;
  addLog(room, `Day ${room.day} begins. ${text}`, 'night_result');
  emitToRoom(room, 'day_event', { day: room.day, text, killed });

  if (checkWin(room)) return;
  schedulePhaseTimer(room, CFG.dayMs, beginVoting);
  emitPhaseChanged(room);
  broadcastState(room);
}

function beginVoting(room) {
  if (room.phase !== PHASE.DAY) return;
  room.phase = PHASE.VOTING;
  room.votes.clear();

  addLog(room, 'Discussion is over. Time to vote.', 'phase');
  schedulePhaseTimer(room, CFG.voteMs, resolveVote);
  emitPhaseChanged(room);
  broadcastState(room);
}

function tallyVotes(room) {
  const voteCounts = {};
  let skip = 0;
  for (const target of room.votes.values()) {
    if (target === SKIP) {
      skip++;
      continue;
    }
    const t = room.players.get(target);
    if (!t || !t.alive) continue; // vote for someone who has since left
    voteCounts[target] = (voteCounts[target] ?? 0) + 1;
  }
  return { counts: voteCounts, skip };
}

/**
 * Voting → (Night | Game over).
 * The player with the most votes is eliminated. A tie for first place, a
 * "skip" plurality, or zero votes means nobody is eliminated.
 */
function resolveVote(room) {
  if (room.phase !== PHASE.VOTING) return;
  clearPhaseTimer(room);

  const { counts: voteCounts, skip } = tallyVotes(room);
  let top = skip;
  let leaders = skip > 0 ? [SKIP] : [];
  for (const [id, n] of Object.entries(voteCounts)) {
    if (n > top) {
      top = n;
      leaders = [id];
    } else if (n === top && n > 0) {
      leaders.push(id);
    }
  }

  let eliminated = null;
  let reason;
  let text;
  if (leaders.length === 0) {
    reason = 'no_votes';
    text = 'No votes were cast. No one was eliminated.';
  } else if (leaders.length > 1) {
    reason = 'tie';
    text = 'The vote ended in a tie. No one was eliminated.';
  } else if (leaders[0] === SKIP) {
    reason = 'skip';
    text = 'The town chose not to eliminate anyone.';
  } else {
    reason = 'majority';
    eliminated = eliminate(room, room.players.get(leaders[0]), 'vote');
    text = `${eliminated.name} was voted out by the town. They were the ${eliminated.role}.`;
  }

  const votes = [...room.votes].map(([voterId, target]) => ({
    voterId,
    voterName: room.players.get(voterId)?.name ?? 'Unknown',
    targetId: target === SKIP ? null : target,
    targetName: target === SKIP ? null : room.players.get(target)?.name ?? 'Unknown',
  }));

  addLog(room, text, 'vote_result');
  emitToRoom(room, 'vote_result', { eliminated, reason, text, counts: voteCounts, skip, votes });

  if (checkWin(room)) return;
  beginNight(room);
}

/** Runs after every elimination. Returns true (and ends the game) if someone won. */
function checkWin(room) {
  if (room.phase === PHASE.LOBBY || room.phase === PHASE.ENDED) return false;
  const { mafia, town } = counts(room);
  if (mafia === 0) {
    endGame(room, 'Town');
    return true;
  }
  if (mafia >= town) {
    endGame(room, 'Mafia');
    return true;
  }
  return false;
}

function endGame(room, winner) {
  clearPhaseTimer(room);
  room.phase = PHASE.ENDED;
  room.winner = winner;

  const text =
    winner === 'Town'
      ? 'All the Mafia have been eliminated. The Town wins!'
      : 'The Mafia now outnumber or equal the Town. The Mafia wins!';
  addLog(room, text, 'game_over');

  emitPhaseChanged(room);
  emitToRoom(room, 'game_over', {
    winner,
    text,
    players: allPlayers(room).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      alive: p.alive,
      deathCause: p.deathCause,
    })),
  });
  broadcastState(room);
}

function resetToLobby(room) {
  clearPhaseTimer(room);
  for (const p of allPlayers(room)) {
    if (p.left || !p.connected) {
      clearTimeout(p.disconnectTimer);
      room.players.delete(p.id);
      continue;
    }
    p.role = null;
    p.alive = true;
    p.deathCause = null;
    p.investigations = [];
  }
  if (room.players.size === 0) return destroyRoom(room);

  room.phase = PHASE.LOBBY;
  room.day = 0;
  room.winner = null;
  room.votes.clear();
  room.night = freshNight();
  room.log = [];
  ensureHost(room);
  addLog(room, 'Back in the lobby. Ready for another round?', 'phase');
  emitPhaseChanged(room);
  broadcastState(room);
}

/** Handles an explicit "leave" (as opposed to a connection drop). */
function leavePlayer(room, player) {
  if (room.phase === PHASE.LOBBY || room.phase === PHASE.ENDED) {
    removePlayer(room, player);
    return;
  }

  // Mid-game: leaving forfeits the player – they are eliminated.
  const socketId = player.socketId;
  player.left = true;
  player.connected = false;
  player.socketId = null;
  detachSocket(socketId, room.code);
  room.night.mafiaVotes.delete(player.id);
  room.night.doctorSaves.delete(player.id);
  room.night.detectiveTargets.delete(player.id);
  room.votes.delete(player.id);

  if (player.alive) {
    const info = eliminate(room, player, 'left');
    addLog(room, `${player.name} left the game. They were the ${info.role}.`, 'leave');
  }
  ensureHost(room);

  if (checkWin(room)) return;
  broadcastState(room);
  scheduleRoomCleanup(room);
  if (room.phase === PHASE.NIGHT) checkNightComplete(room);
  else if (room.phase === PHASE.VOTING) checkVotingComplete(room);
}

function checkVotingComplete(room) {
  if (room.phase !== PHASE.VOTING) return;
  if (alivePlayers(room).every((p) => room.votes.has(p.id))) resolveVote(room);
}

/* ───────────────────────────── Socket handler glue ───────────────────────── */

function allowEvent(socket) {
  const now = Date.now();
  const bucket = (socket.data.bucket ??= { tokens: CFG.rateBurst, last: now });
  bucket.tokens = Math.min(CFG.rateBurst, bucket.tokens + ((now - bucket.last) / 1000) * CFG.ratePerSec);
  bucket.last = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

/**
 * Registers a validated, rate-limited, error-safe event handler.
 * The handler may return an object which is merged into the ack response.
 */
function handle(socket, event, fn) {
  socket.on(event, (payload, ack) => {
    if (typeof payload === 'function') {
      ack = payload;
      payload = {};
    }
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const reply = typeof ack === 'function' ? ack : null;

    const fail = (message) => {
      if (reply) reply({ ok: false, error: message });
      else socket.emit('error_message', { event, message });
    };

    if (!allowEvent(socket)) return fail('You are doing that too fast. Slow down.');

    try {
      const result = fn(data) ?? {};
      if (reply) reply({ ok: true, ...result });
    } catch (err) {
      if (err instanceof GameError) return fail(err.message);
      console.error(`[${event}] unexpected error:`, err);
      fail('Internal server error.');
    }
  });
}

function requireContext(socket) {
  const room = rooms.get(socket.data.roomCode);
  const player = room?.players.get(socket.data.playerId);
  if (!room || !player || player.socketId !== socket.id) {
    throw new GameError('You are not in a room.');
  }
  return { room, player };
}

function requireHost(room, player) {
  if (room.hostId !== player.id) throw new GameError('Only the host can do that.');
}

function requireAlivePlayer(room, id, label = 'target') {
  const target = typeof id === 'string' ? room.players.get(id) : null;
  if (!target || !target.alive) throw new GameError(`That ${label} is not a living player.`);
  return target;
}

function chatChannelFor(room, player) {
  switch (room.phase) {
    case PHASE.LOBBY:
    case PHASE.ENDED:
      return 'public';
    case PHASE.NIGHT:
      if (player.alive && player.role === ROLE.MAFIA) return 'mafia';
      throw new GameError('You cannot chat during the night.');
    default:
      return player.alive ? 'public' : 'dead';
  }
}

io.on('connection', (socket) => {
  /* ───────────────────────── Room management ───────────────────────── */

  handle(socket, 'create_room', (data) => {
    if (socket.data.roomCode) throw new GameError('You are already in a room. Leave it first.');
    const name = cleanName(data.name);

    let code;
    if (data.code !== undefined && data.code !== null && String(data.code).trim() !== '') {
      code = normalizeCode(data.code);
      if (rooms.has(code)) throw new GameError('That room code is already taken.');
    } else {
      code = generateRoomCode();
    }

    const room = createRoom(code);
    const player = createPlayer(name);
    room.players.set(player.id, player);
    room.hostId = player.id;
    attachSocket(socket, room, player);

    addLog(room, `${player.name} created the room.`);
    broadcastState(room);
    console.log(`[room ${code}] created (${rooms.size} rooms active)`);
    return { code, playerId: player.id };
  });

  handle(socket, 'join_room', (data) => {
    const code = normalizeCode(data.code);
    const room = rooms.get(code);
    if (!room) throw new GameError('Room not found.');

    const token = typeof data.playerId === 'string' ? data.playerId : null;
    if (socket.data.roomCode && !(socket.data.roomCode === code && socket.data.playerId === token)) {
      throw new GameError('You are already in a room. Leave it first.');
    }

    let player = token ? room.players.get(token) : undefined;
    let reconnected = false;

    if (player) {
      if (player.left) throw new GameError('You left this game and cannot rejoin it.');
      reconnected = true;
    } else {
      if (room.phase !== PHASE.LOBBY) throw new GameError('This game has already started.');
      if (room.players.size >= CFG.maxPlayers) throw new GameError('This room is full.');
      const name = cleanName(data.name);
      if (allPlayers(room).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw new GameError('That name is already taken in this room.');
      }
      player = createPlayer(name);
      room.players.set(player.id, player);
    }

    attachSocket(socket, room, player);
    ensureHost(room);
    if (!reconnected) addLog(room, `${player.name} joined the room.`);

    // Re-send the private role on reconnect so a refreshed client recovers it.
    if (reconnected && player.role) {
      emitToPlayer(player, 'role_assigned', {
        role: player.role,
        teammates:
          player.role === ROLE.MAFIA
            ? allPlayers(room)
                .filter((p) => p.role === ROLE.MAFIA && p.id !== player.id)
                .map(publicPlayer)
            : [],
      });
    }

    broadcastState(room);
    return { code, playerId: player.id, reconnected };
  });

  handle(socket, 'leave_room', () => {
    const { room, player } = requireContext(socket);
    leavePlayer(room, player);
  });

  handle(socket, 'kick_player', (data) => {
    const { room, player } = requireContext(socket);
    requireHost(room, player);
    if (room.phase !== PHASE.LOBBY) throw new GameError('You can only kick players in the lobby.');
    const target = typeof data.playerId === 'string' ? room.players.get(data.playerId) : null;
    if (!target) throw new GameError('Player not found.');
    if (target.id === player.id) throw new GameError('You cannot kick yourself.');
    emitToPlayer(target, 'kicked', { reason: 'You were removed from the room by the host.' });
    removePlayer(room, target);
  });

  handle(socket, 'request_state', () => {
    const { room, player } = requireContext(socket);
    emitToPlayer(player, 'room_state', stateFor(room, player));
  });

  /* ───────────────────────────── Game flow ─────────────────────────── */

  /**
   * Host sets the exact role counts (or `{ auto: true }` to go back to the balanced suggestion).
   * Any count is accepted while the host is editing; the total is checked when the game starts.
   * The new setup is pushed to the whole room immediately so everyone sees it live.
   */
  handle(socket, 'update_roles', (data) => {
    const { room, player } = requireContext(socket);
    requireHost(room, player);
    if (room.phase !== PHASE.LOBBY) throw new GameError('Roles can only be changed in the lobby.');

    if (data.auto === true) {
      room.roleConfig = null;
      room.rolesCustom = false;
    } else {
      room.roleConfig = parseRoleConfig(data.roles, effectiveRoles(room));
      room.rolesCustom = true;
    }

    const settings = roleSettingsFor(room);
    emitToRoom(room, 'roles_updated', settings);
    return { roles: settings };
  });

  handle(socket, 'start_game', (data) => {
    const { room, player } = requireContext(socket);
    requireHost(room, player);
    if (room.phase !== PHASE.LOBBY) throw new GameError('The game has already started.');

    // Optional: the host may send the role counts together with the start request.
    if (data.roles !== undefined) {
      room.roleConfig = parseRoleConfig(data.roles, effectiveRoles(room));
      room.rolesCustom = true;
      emitToRoom(room, 'roles_updated', roleSettingsFor(room));
    }
    startGame(room);
  });

  handle(socket, 'night_action', (data) => {
    const { room, player } = requireContext(socket);
    if (room.phase !== PHASE.NIGHT) throw new GameError('It is not night time.');
    if (!player.alive) throw new GameError('Dead players cannot act.');
    if (!NIGHT_ROLES.has(player.role)) throw new GameError('You have no night action.');

    const target = requireAlivePlayer(room, data.targetId);
    const response = { role: player.role, targetId: target.id };

    switch (player.role) {
      case ROLE.MAFIA:
        if (target.role === ROLE.MAFIA) throw new GameError('You cannot target a fellow Mafia member.');
        room.night.mafiaVotes.set(player.id, target.id);
        break;

      case ROLE.DOCTOR:
        room.night.doctorSaves.set(player.id, target.id); // self-save allowed; can change until night ends
        break;

      case ROLE.DETECTIVE: {
        if (room.night.detectiveTargets.has(player.id)) {
          throw new GameError('You have already investigated someone tonight.');
        }
        if (target.id === player.id) throw new GameError('You cannot investigate yourself.');
        room.night.detectiveTargets.set(player.id, target.id);
        const result = target.role === ROLE.MAFIA ? 'Mafia' : 'Not Mafia';
        player.investigations.push({
          day: room.day,
          targetId: target.id,
          targetName: target.name,
          result,
        });
        const investigation = { targetId: target.id, targetName: target.name, result };
        emitToPlayer(player, 'investigation_result', investigation);
        response.result = result;
        break;
      }
    }

    emitToPlayer(player, 'night_action_confirmed', { role: player.role, targetId: target.id });

    if (player.role === ROLE.MAFIA) {
      const picks = [...room.night.mafiaVotes].map(([mafiaId, targetId]) => ({ mafiaId, targetId }));
      emitToPlayers(
        room,
        (p) => p.alive && p.role === ROLE.MAFIA,
        'mafia_picks',
        { picks },
      );
    }

    checkNightComplete(room);
    return response;
  });

  handle(socket, 'advance_phase', () => {
    const { room, player } = requireContext(socket);
    requireHost(room, player);
    if (room.phase !== PHASE.DAY) {
      throw new GameError('You can only skip ahead during the day discussion.');
    }
    beginVoting(room);
  });

  handle(socket, 'cast_vote', (data) => {
    const { room, player } = requireContext(socket);
    if (room.phase !== PHASE.VOTING) throw new GameError('It is not voting time.');
    if (!player.alive) throw new GameError('Dead players cannot vote.');

    let choice;
    if (data.targetId === null || data.targetId === undefined || data.targetId === SKIP) {
      choice = SKIP;
    } else {
      const target = requireAlivePlayer(room, data.targetId, 'suspect');
      if (target.id === player.id) throw new GameError('You cannot vote for yourself.');
      choice = target.id;
    }

    room.votes.set(player.id, choice);
    emitToRoom(room, 'vote_update', voteSnapshot(room));
    checkVotingComplete(room);
    return { targetId: choice === SKIP ? null : choice };
  });

  handle(socket, 'play_again', () => {
    const { room, player } = requireContext(socket);
    requireHost(room, player);
    if (room.phase !== PHASE.ENDED) throw new GameError('The game is not over yet.');
    resetToLobby(room);
  });

  /* ─────────────────────────────── Chat ────────────────────────────── */

  handle(socket, 'chat_message', (data) => {
    const { room, player } = requireContext(socket);
    const text = cleanChat(data.text);
    const channel = chatChannelFor(room, player);
    const message = {
      id: crypto.randomUUID(),
      from: publicPlayer(player),
      text,
      channel,
      ts: Date.now(),
    };

    if (channel === 'public') emitToRoom(room, 'chat_message', message);
    else if (channel === 'mafia') {
      emitToPlayers(room, (p) => p.alive && p.role === ROLE.MAFIA, 'chat_message', message);
    } else {
      emitToPlayers(room, (p) => !p.alive, 'chat_message', message); // dead chat
    }
  });

  /* ───────────────────────────── Disconnects ───────────────────────── */

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || player.socketId !== socket.id) return;

    player.connected = false;
    player.socketId = null;

    if (room.phase === PHASE.LOBBY) {
      // Give the player a short grace period to reconnect (e.g. page refresh).
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = setTimeout(() => {
        if (rooms.get(room.code) === room && room.players.get(player.id) === player && !player.connected) {
          removePlayer(room, player);
        }
      }, CFG.lobbyGraceMs);
    }

    ensureHost(room);
    broadcastState(room);
    scheduleRoomCleanup(room);
  });
});

/* ───────────────────────────────── HTTP API ──────────────────────────────── */

const indexFile = path.join(PUBLIC_DIR, 'index.html');

app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: rooms.size }));

// Lets the client check a code before showing the "enter your name" screen.
app.get('/api/rooms/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = CODE_REGEX.test(code) ? rooms.get(code) : null;
  if (!room) return res.status(404).json({ exists: false });
  res.json({
    exists: true,
    phase: room.phase,
    players: room.players.size,
    maxPlayers: CFG.maxPlayers,
    joinable: room.phase === PHASE.LOBBY && room.players.size < CFG.maxPlayers,
  });
});

// Shareable invite link: https://your-host/room/ABCD → your SPA reads the code from the path.
app.get('/room/:code', (_req, res) => {
  res.sendFile(indexFile, (err) => {
    if (err && !res.headersSent) res.status(404).send('Frontend not found. Add public/index.html.');
  });
});

/* ───────────────────────────────── Startup ───────────────────────────────── */

server.listen(PORT, () => {
  console.log(`Mafia server listening on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  for (const room of rooms.values()) destroyRoom(room);
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
