# MUSICAL BLOCK — Highrise Bot 🎮

Musical chairs, Highrise edition: players stand on colored blocks, the
"music" stops, the bot secretly rolls which blocks are **safe** and which
are **dangerous**, and everyone left standing on a dangerous block is
eliminated and teleported out. Last player standing wins.

Built on the **official Highrise Python SDK** (`highrise-bot-sdk==25.1.0`)
— verified against the official docs at `create.highrise.game/learn/bots`.

## Setup

1. **Get credentials**
   - API token: log in at `create.highrise.game` → Dashboard → **Bots & API
     Keys** → create a bot → generate the API token.
   - Room ID: open your 20×20 room in the Highrise app → room info panel →
     **Share this Room**.
   - The bot's owner must be the **room owner** (or have designer rights in
     the room) — Highrise requires this for bots, and teleports need it.
2. **Install** (Python 3.10+):
   ```bash
   cd highrise-bot
   pip install -r requirements.txt
   ```
3. **Configure** `config.json`:
   - Add your Highrise username to `settings.hosts` so you can run host
     commands.
   - Check `blocks` and `room.spawn` / `room.spectator` (see below).
4. **Run**:
   ```bash
   highrise musical_block:MusicalBlockBot <ROOM_ID> <API_TOKEN>
   ```
   Keep this process running (a terminal, `screen`/`tmux`, or a small VPS) —
   the game keeps running even when you're not in the room.

## Block layout from your room (20×20)

The bot senses players via **real-time position tracking** (`user_moved`
events + an authoritative `get_room_users` snapshot at every check), not
fake graphics. Each block is a grid zone — when a player's coordinates land
inside a block's zone, that player is "on" that block.

From your screenshot, 12 blocks were estimated at these grid coordinates
(`config.json`):

| Block | Color | (x, z) | Block | Color | (x, z) |
|---|---|---|---|---|---|
| green1 | green | (7, 6) | lime1 | lime | (9, 14) |
| orange1 | orange | (7, 8) | gray1 | gray | (11, 13) |
| yellow1 | yellow | (9, 6) | red1 | red | (12, 12) |
| purple1 | purple | (8, 12) | tan1 | tan | (13, 14) |
| teal1 | teal | (9, 11) | black1 | black | (4, 11) |
| blue1 | blue | (11, 9) | white1 | white | (13, 8) |

⚠️ These are estimates from an isometric screenshot. **Calibrate in-game:**
stand on each block and type `!block <id>` (e.g. `!block red1`) — the bot
snaps that block to your exact position and saves it to `blocks.json`.
Type `!blocks` to list them. Also stand in your spectator corner and type
`!spectator`, and in the starting area type `!spawn`.

## How detection actually works (honest notes)

- The Bot API has **no collision/touch events**. Detection = each player's
  live coordinates (`on_user_move`, `on_user_join`) checked against each
  block's x/z zone, plus a **room-snapshot** (`get_room_users`) taken at the
  moment of elimination so nobody gets judged on a stale position.
- Eliminations are de-duplicated (`eliminated` set) and teleports are
  wrapped in error handling — a failed spectator teleport never removes a
  safe player from the game.
- **No audio API**: "music playing / music stopped" are chat cues. Play
  music outside the app or via room music; the bot announces the beats.
- **No furniture control**: the bot can't make dangerous blocks visually
  vanish — it *announces* the dangerous colors after each round instead.
- Spectators who wander onto blocks during a game are just players to the
  API; they're ignored unless registered. Eliminated players can't rejoin
  mid-game (`!join` queues them for the next game).

## Gameplay flow

1. **Prep** — players type `!join`; `!start` teleports everyone to spawn.
2. **Music phase** — countdown announced; with the default `mid` reveal,
   the safe blocks are announced a few seconds *before* the stop so players
   race for them (pure luck otherwise — see `revealMode` in config).
3. **Stop + grace** — `🎶 MUSIC STOPPED!` then a short scramble timer.
4. **Check** — snapshot positions → safe block = survive, dangerous block =
   eliminated + teleported to spectators, no block = eliminated (toggle
   `requireFloor`).
5. **Reveal** — dangerous colors announced; ramp makes each round harder.
6. **Winner** — last player standing gets the winner announcement +
   `prizeText` (the bot can't pay Gold; tip winners in-app yourself).

## Modes & config

`!mode easy|normal|hard` (host) or `"defaultMode": "random"` for chaos.
Presets live in `config.json` → `modes` (safeCount / musicTime / checkTime).
`rampEnabled` shrinks safe blocks and timers every round; tune
`rampSafeStep`, `minSafeCount`, `timeRampPercent`, `minMusicTime`,
`minCheckTime`.

## Commands

| Command | Who | Effect |
|---|---|---|
| `!join` / `!leave` | anyone | register / withdraw |
| `!start` / `!stop` / `!reset` | host | control the game |
| `!players` / `!status` | anyone | rosters & state |
| `!mode easy\|normal\|hard` | host | difficulty |
| `!block <id>` / `!blocks` | host | calibrate block zones |
| `!spectator` / `!spawn` | host | set those areas |
| `!help` | anyone | command list |

## Testing without a crowd

Open your room with two accounts (yours + a friend, or a second bot account)
and run a 2-player game in `easy` mode — you'll see the full loop: prep
teleports, music phase, stop, elimination teleports to spectators, ramp,
winner announcement. Try `!status` mid-round, and `!stop` / `!reset` to
verify clean state handling. Disconnect mid-round to confirm the leave
handler removes the player.