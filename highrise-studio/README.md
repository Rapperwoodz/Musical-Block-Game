# Highrise Studio port — Virtual Movie Theater

A Unity/Lua port of the theater for **Highrise Studio** (create.highrise.game),
built around Highrise's own multiplayer — no Node server needed for this world.

## What this port includes

- **Movie nights** — schedule with a countdown, vote on what to watch, host
  controls, auto-announcement when the show starts. (Highrise worlds can't
  stream external video, so the "show" is a social event: sit, chat, emote.
  Real synced video stays in this project's web game.)
- **Seating** — Highrise's built-in Anchor system (no code needed).
- **Live HUD** (optional) — countdown + now-playing title via UI toolkit.

## Setup (≈20 minutes)

1. **Sign in** at `create.highrise.game` with your Highrise account.
2. **Download Studio Hub** (Studio → getting started) and let it install
   Unity + the Highrise Studio package.
3. Create a new world project called **Movie Theater**.
4. **Build the room** using Studio's furniture/asset catalog: north wall with a
   big screen facade, snack counter corner, exit door.
5. **Seats**: for each seat, create an empty GameObject at the seat position →
   add a **Box Collider** → add the **Anchor (Script)** component (tappable).
   Characters will walk over and sit when players tap the seat.
6. **Scripts** (in `scripts/` of this folder):
   - Create `TheaterServer` (Type: Server) and paste `TheaterServer.lua`.
   - Create `TheaterClient` (Type: Client) and paste `TheaterClient.lua`.
   - Attach both to an empty "Theater Manager" GameObject.
7. **Optional HUD**: import `ui/movie-night.uxml` + `ui/movie-night.uss`,
   create the `MovieNightUI` (Type: UI) script, bind the labels
   (`CountdownLabel`, `MovieLabel`), and set the panel's Output to **HUD**.
8. Test with Studio's multiplayer preview, then Upload → **Release** through
   the Creator Portal so it appears in the Highrise app.

## Chat commands (in-world)

| Command | Who | Effect |
|---|---|---|
| `!movienight 60` | anyone | Schedule a show in 60 minutes (you become host) |
| `!vote <title>` | anyone | Vote on the movie (one vote per player, latest wins) |
| `!start` | host | Start the show early |
| `!stop` | host | End the movie night |

Announcements appear as toasts + a "THEATER" chat bubble by the screen.

## Mapping from the web game

| Web game | Highrise port |
|---|---|
| Node WebSocket server | Highrise's built-in multiplayer + Server scripts |
| Canvas isometric theater | Studio room built in Unity (this world) |
| Seats as tiles | Anchor components (tap to sit) |
| Synced video playback | ❌ Not permitted in Highrise — social event instead |
| Chat/emotes/snacks | Highrise's native chat + emotes |
| Movie-night announcements | Same flow, ported to NetworkValues + Events |

## Honest limitations

- **No video streaming in Highrise worlds** — their platform doesn't permit
  external video playback; movie nights here are the social experience.
- The web game remains the place with real synced films; share its URL with
  your Highrise friends, or run the movie-night bot bridge (ask me).
- Script APIs verified against the Studio docs (create.highrise.game) as of
  today; if a method name shifts with a Studio update, the docs pages cited
  in the research are the reference.