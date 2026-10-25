--!Type(Server)
-- Virtual Movie Theater — server logic for the Highrise Studio world.
-- Movie-night scheduling, chat commands, voting and announcements.
--
-- Attach this script to an empty GameObject ("Theater Manager") in your scene.
-- Highrise worlds can't stream external video, so a "movie night" here is a
-- social event: schedule it, vote on what to "watch", then everyone grabs a
-- seat (Anchor) when the show starts and hangs out on the big screen wall.

-- Networked state — matched to the client scripts by name and auto-synced.
local movieTitle = StringValue.new("MovieTitle", "")
local secondsUntil = NumberValue.new("SecondsUntilShow", -1)  -- -1 = nothing scheduled
local isShowing = BoolValue.new("IsShowing", false)
local voteTally = StringValue.new("VoteTally", "")

local announce = Event.new("TheaterAnnouncement")
local commands = Event.new("TheaterCommand")   -- clients fire this to run commands
local voteEvent = Event.new("TheaterVote")     -- clients fire this to vote

-- Server-only state
local remaining = nil   -- countdown seconds, nil = nothing scheduled
local host = nil        -- player who scheduled the show
local votes = {}        -- player name -> movie title

local function fmtTally()
  local counts = {}
  for _, choice in pairs(votes) do
    counts[choice] = (counts[choice] or 0) + 1
  end
  local parts = {}
  for choice, n in pairs(counts) do
    table.insert(parts, choice .. ": " .. n)
  end
  return table.concat(parts, "  •  ")
end

local function startShow()
  isShowing.value = true
  remaining = nil
  secondsUntil.value = -1
  announce:FireAllClients("🎬 Movie night is starting NOW! Grab an anchor seat and enjoy the show!")
end

function self:ServerAwake()
  -- chat command relay (clients forward "!movie night" style commands)
  commands:Connect(function(player, cmd, arg)
    arg = arg or ""
    if cmd == "movienight" then
      local minutes = tonumber(arg)
      if minutes == nil or minutes <= 0 or minutes > 1440 then
        announce:FireClient(player, "❗ Usage: !movienight <minutes>  (e.g. !movienight 60)")
        return
      end
      host = player
      remaining = math.floor(minutes * 60)
      votes = {}
      voteTally.value = ""
      if movieTitle.value == "" then movieTitle.value = "TBD" end
      announce:FireAllClients("🎬 Movie night in " .. math.floor(minutes) .. " minutes! Vote with \"!vote <title>\" — scheduled by " .. player.name)
    elseif cmd == "start" then
      if host and host ~= player then
        announce:FireClient(player, "❗ Only " .. host.name .. " can start the show.")
        return
      end
      startShow()
    elseif cmd == "stop" then
      if host and host ~= player then
        announce:FireClient(player, "❗ Only the host can stop the show.")
        return
      end
      isShowing.value = false
      remaining = nil
      secondsUntil.value = -1
      host = nil
      announce:FireAllClients("🍿 Movie night ended — thanks for coming!")
    end
  end)

  voteEvent:Connect(function(player, choice)
    if not remaining then
      announce:FireClient(player, "❗ No movie night scheduled yet — try \"!movienight 60\"")
      return
    end
    choice = tostring(choice):sub(1, 60)
    if choice == "" then return end
    votes[player.name] = choice
    voteTally.value = fmtTally()
  end)

  -- greet new arrivals while a show is scheduled or running
  scene.PlayerJoined:Connect(function(scene, player)
    if isShowing.value then
      Timer.After(2, function()
        announce:FireClient(player, "🍿 Movie night is running — take a seat!")
      end)
    elseif remaining and remaining > 0 then
      Timer.After(2, function()
        announce:FireClient(player, "🎬 Movie night in " .. remaining .. "s — vote with \"!vote <title>\"")
      end)
    end
  end)

  -- 1-second countdown tick
  Timer.Every(1, function()
    if remaining == nil then return end
    remaining = remaining - 1
    secondsUntil.value = remaining
    if remaining <= 0 then startShow() end
  end)
end