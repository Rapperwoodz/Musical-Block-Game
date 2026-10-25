# MUSICAL BLOCK — Get the Bot Running (Quickstart)

The bot is ready to run (`musical_block.py` + `config.json`). What's left is
three credentials and one always-on machine. Here's every path, cheapest first.

## Step 1 — Create the bot account + API token (5 min, on your phone)

1. Log in at `https://create.highrise.game` with the Highrise account you
   want the bot to use (your main account is fine — the bot appears as that
   avatar).
2. Dashboard → **Bots & API Keys** → create a new bot → **Generate API
   Token**. Copy it somewhere private.
3. Open your 20×20 block room in the Highrise app → room info panel (top
   right) → **Share this Room** → copy the **Room ID**.
4. Give the bot **designer rights** in the room (needed for bots; also makes
   teleports work): room info panel → members/roles → set the bot account
   (or its owner) as designer. Easiest: use your own main account as the bot
   owner — it's already the room owner.

⚠️ **Never share the API token** — anyone with it controls your bot. Don't
put it in the GitHub repo, chat, or screenshots.

## Step 2 — Pick where the bot runs (it must stay online 24/7)

### Option A — Your own computer (easiest if you have one)

1. Install Python 3.10+ from python.org.
2. Download the `highrise-bot/` folder (from the GitHub repo once pushed, or
   copy it over).
3. In Terminal / Command Prompt:
   ```
   cd highrise-bot
   pip install -r requirements.txt
   highrise musical_block:MusicalBlockBot YOUR_ROOM_ID YOUR_API_TOKEN
   ```
4. Leave the window open — the bot stays online while it runs.

### Option B — Google Cloud Shell (FREE, works from your iPhone browser)

1. Go to `shell.cloud.google.com` in Safari and sign in with any Google
   account (first time creates a free project — no card needed).
2. In the black terminal:
   ```
   git clone https://github.com/YOUR-USERNAME/Musical-Block-Game.git
   cd Musical-Block-Game/highrise-bot
   pip install -r requirements.txt
   highrise musical_block:MusicalBlockBot YOUR_ROOM_ID YOUR_API_TOKEN
   ```
3. The bot is now in your Highrise room. Note: Cloud Shell times out after
   ~20 min of browser inactivity — keep the tab open during play sessions,
   or click "Open in new window" and leave it running. For a true 24/7 host,
   use Option C.

### Option C — Tiny VPS (true 24/7, ~$4–6/month)

Any DigitalOcean / Hetzner / Oracle free-tier Ubuntu box:
```
ssh root@YOUR_SERVER
apt update && apt install -y python3-pip git
git clone https://github.com/YOUR-USERNAME/Musical-Block-Game.git
cd Musical-Block-Game/highrise-bot
pip3 install -r requirements.txt
nohup highrise musical_block:MusicalBlockBot YOUR_ROOM_ID YOUR_API_TOKEN > bot.log 2>&1 &
```
It keeps running after you log out; check `bot.log` anytime.

## Step 3 — Calibrate and play

Once the bot says it's online in your room:
1. Stand on each colored block → type `!block red1` (with that block's ID).
2. Stand in your spectator corner → `!spectator`; in the starting area → `!spawn`.
3. Everyone types `!join`, then you type `!start`. Game on!

Full command list: `!help` in the room, or see `README.md` in this folder.

## If something goes wrong

- "Auth error" on startup → token wrong/expired: regenerate in the dashboard.
- Teleports fail → the bot's owner lacks rights in the room: fix Step 1.4.
- Blocks detect wrong → recalibrate with `!block <id>` (one screenshot
  estimate is never perfect).
- Bot offline → the process stopped: rerun the launch command (Option C's
  `nohup` line survives disconnects).