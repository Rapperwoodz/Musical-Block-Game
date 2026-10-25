"""
MUSICAL BLOCK — a Highrise game bot (official Python SDK, highrise-bot-sdk).

Players stand on colored blocks in your 20x20 room. When the music stops,
the bot secretly rolls which block colors are safe and which are dangerous.
Survivors stay, everyone else is eliminated and teleported to the spectator
area. Last player standing wins.

Run:
    pip install highrise-bot-sdk==25.1.0
    highrise musical_block:MusicalBlockBot <ROOM_ID> <API_TOKEN>

The bot must belong to the room owner (or have designer rights in the room)
so teleports and position tracking work. Get ROOM_ID from the room's info
panel ("Share this Room") and the API token from Dashboard > Bots & API Keys
at https://create.highrise.game.

Honest capability notes (verified against the official docs/SDK):
- The Bot API has NO collision or touch events. Block "touching" is detected
  by tracking each player's real-time floor coordinates (user_moved events
  plus authoritative get_room_users() snapshots) and checking which block's
  grid zone contains the player. That is a position-based detection system,
  not a physics trigger — matching what the API actually exposes.
- The bot cannot change room furniture, so "dangerous blocks disappear" is
  announced in chat instead of rendered.
- There is no music/audio API. The bot announces "music playing/stopped" in
  chat as the cue; play music outside the app or via room music.
"""

import asyncio
import json
import os
import random

from highrise import BaseBot

try:
    from highrise import ResponseError
except ImportError:  # older SDKs
    class ResponseError(Exception):
        pass

from highrise.models import (
    GetRoomUsersRequest,
    Position,
)

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
BLOCKS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blocks.json")


def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    if default is not None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(default, f, indent=2)
    return default


class MusicalBlockBot(BaseBot):
    def __init__(self):
        super().__init__()
        self.config = load_json(CONFIG_PATH, None)
        # blocks.json stores the calibrated layout so config.json stays clean
        default_blocks = {"blocks": self.config["blocks"]}
        self.blocks = load_json(BLOCKS_PATH, default_blocks)["blocks"]
        self.settings = self.config["settings"]
        self.room_cfg = self.config["room"]
        self.modes = self.config["modes"]

        self.room_id = None
        self.owner_id = None
        self.state = "lobby"          # lobby | playing | over
        self.round_num = 0
        self.mode = self.settings.get("defaultMode", "normal")
        self.registered = {}          # user_id -> username (waiting to play)
        self.alive = set()            # user_ids alive in the current game
        self.eliminated = set()       # user_ids eliminated this game
        self.game_queue = set()       # user_ids who typed !join mid-game
        self.positions = {}           # user_id -> (x, y, z)
        self.safe_ids = set()         # block ids safe this round
        self.ramp = 0                 # difficulty escalation level
        self.game_task = None

    # ------------------------------------------------------------ helpers

    def is_host(self, user):
        return user.id == self.owner_id or user.username in self.settings.get("hosts", [])

    def cur(self):
        return self.modes[self.mode if self.mode != "random" else "normal"]

    async def say(self, text):
        try:
            await self.highrise.chat(text[:256])
        except ResponseError:
            pass

    async def whisper(self, user_id, text):
        try:
            await self.highrise.send_whisper(user_id, text[:256])
        except ResponseError:
            pass

    def block_at(self, x, z):
        bs = self.room_cfg.get("blockSize", 1.0)
        half = bs / 2.0
        for b in self.blocks:
            if abs(x - b["x"]) <= half and abs(z - b["z"]) <= half:
                return b
        return None

    def mode_params(self):
        key = self.mode
        if key == "random":
            key = random.choice(["easy", "normal", "hard"])
        base = dict(self.modes[key])
        base["name"] = key
        # difficulty ramp
        ramp = self.ramp if self.settings.get("rampEnabled", True) else 0
        step = self.settings.get("rampSafeStep", 1)
        base["safeCount"] = max(self.settings.get("minSafeCount", 1),
                                base["safeCount"] - ramp * step)
        tp = self.settings.get("timeRampPercent", 10) / 100.0
        base["musicTime"] = max(self.settings.get("minMusicTime", 8),
                                round(base["musicTime"] * (1 - ramp * tp)))
        base["checkTime"] = max(self.settings.get("minCheckTime", 4),
                                round(base["checkTime"] * (1 - ramp * tp)))
        return base

    def roll_safe_blocks(self, safe_count):
        pool = [b["id"] for b in self.blocks]
        random.shuffle(pool)
        self.safe_ids = set(pool[:max(0, min(safe_count, len(pool)))])

    def save_blocks(self):
        with open(BLOCKS_PATH, "w", encoding="utf-8") as f:
            json.dump({"blocks": self.blocks}, f, indent=2)

    async def snapshot_positions(self):
        """Authoritative positions for everyone in the room right now."""
        result = await self.highrise.get_room_users()
        content = getattr(result, "content", None)
        if not isinstance(content, list):
            return {}
        snap = {}
        for user, pos in content:
            if hasattr(pos, "x"):
                snap[user.id] = (pos.x, pos.y, pos.z)
        return snap

    async def teleport(self, user_id, x, y, z):
        try:
            await self.highrise.teleport(user_id, Position(x, y, z))
            return True
        except ResponseError:
            return False

    async def eliminate(self, user_id, username, reason):
        if user_id in self.eliminated:
            return  # never eliminate the same player twice in one game
        self.eliminated.add(user_id)
        self.alive.discard(user_id)
        spec = self.room_cfg["spectator"]
        ok = await self.teleport(user_id, spec["x"], spec["y"], spec["z"])
        where = "sent to the spectator area" if ok else "removed from the round"
        await self.say(f"💀 {username} is out ({reason}) — {where}.")
        await self.whisper(user_id, f"You were eliminated: {reason}. Type !join for the next game.")

    def reset_game(self):
        self.state = "lobby"
        self.round_num = 0
        self.ramp = 0
        self.alive = set()
        self.eliminated = set()
        self.safe_ids = set()
        self.game_queue.clear()
        for uid in self.game_queue:
            pass  # queue members re-register via !join
        self.game_task = None

    # ------------------------------------------------------ Highrise events

    async def on_start(self, session_metadata):
        self.room_id = session_metadata.room_id
        self.owner_id = session_metadata.room_info.owner_id
        colors = sorted({b["color"] for b in self.blocks})
        await self.say(
            "🎮 MUSICAL BLOCK bot online! Type !join to play, !help for commands. "
            f"Blocks calibrated: {len(self.blocks)} ({', '.join(colors)})."
        )

    async def on_user_join(self, user, position):
        if hasattr(position, "x"):
            self.positions[user.id] = (position.x, position.y, position.z)
        await self.whisper(user.id, "🎮 Musical Block bot here! !join to play, !help for commands.")

    async def on_user_leave(self, user):
        self.positions.pop(user.id, None)
        if user.id in self.alive:
            self.alive.discard(user.id)
            await self.say(f"🚪 {user.username} left the room and is out of the game.")

    async def on_user_move(self, user, destination):
        if hasattr(destination, "x"):
            self.positions[user.id] = (destination.x, destination.y, destination.z)

    async def on_chat(self, user, message):
        text = message.strip()
        if not text.startswith("!"):
            return
        parts = text[1:].split(maxsplit=1)
        cmd = parts[0].lower()
        arg = parts[1].strip() if len(parts) > 1 else ""
        handler = {
            "start": self.cmd_start, "stop": self.cmd_stop, "join": self.cmd_join,
            "leave": self.cmd_leave, "players": self.cmd_players, "status": self.cmd_status,
            "mode": self.cmd_mode, "reset": self.cmd_reset, "help": self.cmd_help,
            "block": self.cmd_block, "blocks": self.cmd_blocks,
            "spectator": self.cmd_spectator, "spawn": self.cmd_spawn,
        }.get(cmd)
        if handler:
            await handler(user, arg)

    # ------------------------------------------------------------ commands

    async def cmd_help(self, user, arg):
        lines = (
            "🎮 MUSICAL BLOCK commands:\n"
            "!join / !leave — join or leave the game\n"
            "!start / !stop / !reset — host controls\n"
            "!players / !status — game info\n"
            "!mode easy|normal|hard — host sets difficulty\n"
            "!block <id> — calibrate a block (host stands on it)\n"
            "!blocks — list calibrated blocks\n"
            "!spectator / !spawn — set those areas (host stands there)"
        )
        await self.whisper(user.id, lines)

    async def cmd_join(self, user, arg):
        if self.state == "playing":
            if user.id in self.eliminated:
                await self.whisper(user.id, "You were eliminated this game — !join again after it resets.")
            else:
                self.game_queue.add(user.id)
                await self.whisper(user.id, "Queued for the next game!")
            return
        if user.id in self.eliminated and self.state == "over":
            self.eliminated.discard(user.id)
        self.registered[user.id] = user.username
        await self.say(f"✋ {user.username} joined Musical Block ({len(self.registered)} players).")

    async def cmd_leave(self, user, arg):
        left = self.registered.pop(user.id, None)
        self.alive.discard(user.id)
        if left:
            await self.say(f"{user.username} left the game.")

    async def cmd_players(self, user, arg):
        if self.state == "playing":
            names = [self.registered[uid] for uid in self.alive if uid in self.registered]
            await self.say(f"🎮 Alive ({len(names)}): {', '.join(names) or 'none'}")
        else:
            names = list(self.registered.values())
            await self.say(f"🎮 Registered ({len(names)}): {', '.join(names) or 'nobody yet'}")

    async def cmd_status(self, user, arg):
        await self.say(
            f"🎮 Musical Block — state: {self.state}, round: {self.round_num}, "
            f"mode: {self.mode}, alive: {len(self.alive)}, blocks: {len(self.blocks)}"
        )

    async def cmd_mode(self, user, arg):
        if not self.is_host(user):
            return await self.whisper(user.id, "Only the host can set the mode.")
        if arg not in self.modes and arg != "random":
            return await self.whisper(user.id, "Modes: easy, normal, hard, random.")
        self.mode = arg
        await self.say(f"⚙️ Difficulty set to {arg.upper()}.")

    async def cmd_start(self, user, arg):
        if not self.is_host(user):
            return await self.whisper(user.id, "Only the host can start the game.")
        if self.state == "playing":
            return await self.whisper(user.id, "A game is already running.")
        if len(self.registered) < 2:
            return await self.say("Need at least 2 players — type !join!")
        self.state = "playing"
        self.game_task = asyncio.create_task(self.run_game())
        await self.game_task

    async def cmd_stop(self, user, arg):
        if not self.is_host(user):
            return await self.whisper(user.id, "Only the host can stop the game.")
        if self.game_task:
            self.game_task.cancel()
        self.reset_game()
        await self.say("🛑 Game stopped and reset by the host.")

    async def cmd_reset(self, user, arg):
        if not self.is_host(user):
            return await self.whisper(user.id, "Only the host can reset.")
        if self.game_task:
            self.game_task.cancel()
        self.reset_game()
        self.registered.clear()
        await self.say("♻️ Game fully reset. Type !join to register!")

    async def cmd_block(self, user, arg):
        if not self.is_host(user):
            return await self.whisper(user.id, "Only the host can calibrate blocks.")
        block = next((b for b in self.blocks if b["id"] == arg), None)
        pos = self.positions.get(user.id)
        if block is None or pos is None:
            return await self.whisper(user.id, "Stand ON the block, then: !block <id> (see !blocks)")
        block["x"] = round(pos[0], 2)
        block["z"] = round(pos[2], 2)
        self.save_blocks()
        await self.say(f"📍 Block {arg} calibrated to ({block['x']}, {block['z']}).")

    async def cmd_blocks(self, user, arg):
        listing = ", ".join(f"{b['id']}({b['x']},{b['z']})" for b in self.blocks)
        await self.say(f"🧱 Blocks: {listing}")

    async def cmd_spectator(self, user, arg):
        if not self.is_host(user):
            return await self.whisper(user.id, "Host only.")
        pos = self.positions.get(user.id)
        if not pos:
            return await self.whisper(user.id, "Stand in the spectator spot, then type !spectator")
        self.room_cfg["spectator"] = {"x": round(pos[0], 2), "y": round(pos[1], 2), "z": round(pos[2], 2)}
        self.save_config_room()
        await self.say("📍 Spectator area set.")

    async def cmd_spawn(self, user, arg):
        if not self.is_host(user):
            return await self.whisper(user.id, "Host only.")
        pos = self.positions.get(user.id)
        if not pos:
            return await self.whisper(user.id, "Stand in the spawn area, then type !spawn")
        self.room_cfg["spawn"] = {"x": round(pos[0], 2), "y": round(pos[1], 2), "z": round(pos[2], 2)}
        self.save_config_room()
        await self.say("📍 Spawn area set.")

    def save_config_room(self):
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(self.config, f, indent=2)

    # ------------------------------------------------------------ game loop

    async def run_game(self):
        try:
            await self.prep_round()
            while True:
                await self.play_round()
                if len(self.alive) <= 1:
                    break
                self.round_num += 1
                if self.settings.get("rampEnabled", True):
                    self.ramp += 1
                # re-join queued players between rounds
                for uid in list(self.game_queue):
                    if uid not in self.eliminated:
                        self.alive.add(uid)
                self.game_queue.clear()
                await self.say(f"🔁 Round {self.round_num + 1} starting — {len(self.alive)} players left!")
        except asyncio.CancelledError:
            pass
        finally:
            if self.state != "lobby":
                await self.end_game()

    async def prep_round(self):
        spawn = self.room_cfg["spawn"]
        players = list(self.alive)
        offsets = [(0.0, 0.0), (1.0, 0.0), (-1.0, 0.0), (0.0, 1.0), (0.0, -1.0),
                   (1.0, 1.0), (-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (2.0, 0.0)]
        await self.say("🚶 Teleporting players to the starting area…")
        for i, uid in enumerate(players):
            dx, dz = offsets[i % len(offsets)]
            ok = await self.teleport(uid, spawn["x"] + dx, spawn["y"], spawn["z"] + dz)
            if not ok:
                await self.whisper(uid, "Teleport failed — please walk to the starting area!")
        self.round_num = 1
        await self.say(
            f"🎮 MUSICAL BLOCK — Round 1! {len(players)} players. Mode: {self.mode.upper()}. "
            "Stand on a BLOCK before the music stops!"
        )

    async def play_round(self):
        p = self.mode_params()
        music_time = p["musicTime"]
        check_time = p["checkTime"]

        # PHASE 2: music playing
        self.safe_ids = set()
        await self.say(f"🎵 Music is playing! {music_time}s — move around the blocks!")
        if self.settings.get("revealMode") == "mid":
            await asyncio.sleep(max(1, music_time - self.settings.get("revealAfterSeconds", 6)))
            self.roll_safe_blocks(p["safeCount"])
            safe_colors = sorted({b["color"].upper() for b in self.blocks if b["id"] in self.safe_ids})
            await self.say(f"🟨 SAFE BLOCKS this round: {', '.join(safe_colors)} — get on one!")
            await asyncio.sleep(self.settings.get("revealAfterSeconds", 6))
        else:
            await asyncio.sleep(music_time)
            self.roll_safe_blocks(p["safeCount"])

        # PHASE 3: music stops
        await self.say("🎶 MUSIC STOPPED! Get on a block NOW!")
        await asyncio.sleep(check_time)

        # PHASE 4: block check — authoritative snapshot
        snap = await self.snapshot_positions()
        eliminations = []
        for uid in list(self.alive):
            username = self.registered.get(uid, "Player")
            pos = snap.get(uid)
            if pos is None:
                await self.eliminate(uid, username, "not on any block")
                eliminations.append(username)
                continue
            block = self.block_at(pos[0], pos[2])
            if block is None:
                if self.settings.get("requireFloor", True):
                    await self.eliminate(uid, username, "not on any block")
                    eliminations.append(username)
                continue
            if block["id"] in self.safe_ids:
                await self.whisper(uid, f"✅ {block['id']} was SAFE — you survived!")
            else:
                await self.eliminate(uid, username, f"{block['id']} was dangerous")
                eliminations.append(username)

        # PHASE 5: reveal (bot can't move furniture — announced instead)
        dead = sorted({b["color"].upper() for b in self.blocks if b["id"] not in self.safe_ids})
        alive_count = len(self.alive)
        await self.say(f"⚡ Round {self.round_num} done — {alive_count} left! "
                       f"Dangerous colors were: {', '.join(dead) if dead else 'none'}.")

    async def end_game(self):
        self.state = "over"
        winners = [self.registered[uid] for uid in self.alive if uid in self.registered]
        if len(winners) == 1:
            await self.say(f"🏆 {winners[0]} {self.settings.get('prizeText', 'wins!')}")
        elif winners:
            await self.say(f"🤝 It's a draw between: {', '.join(winners)}!")
        else:
            await self.say("😅 Everyone got eliminated — no winner this time!")
        self.reset_game()
        await self.say("🔄 Arena reset. Type !join for the next game!")