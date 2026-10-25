--!Type(Client)
-- Virtual Movie Theater — client side for the Highrise Studio world.
-- Relays your chat commands to the server and shows live theater toasts.
--
-- Attach this script to a GameObject in your scene (e.g. next to the screen).
-- Commands:  !movienight <minutes>   !vote <title>   !start   !stop

-- Networked state — names must match TheaterServer.lua (auto-synced).
local movieTitle = StringValue.new("MovieTitle", "")
local secondsUntil = NumberValue.new("SecondsUntilShow", -1)
local isShowing = BoolValue.new("IsShowing", false)
local voteTally = StringValue.new("VoteTally", "")

local announce = Event.new("TheaterAnnouncement")
local commands = Event.new("TheaterCommand")
local voteEvent = Event.new("TheaterVote")

function self:ClientAwake()
  -- relay your own chat commands to the server (server validates the actor)
  Chat.TextMessageReceivedHandler:Connect(function(channel, player, message, language, originalMessage)
    if player ~= client.localPlayer then return end
    local text = message or ""
    if text:sub(1, 12) == "!movienight " then
      commands:FireServer("movienight", text:sub(13))
    elseif text == "!start" then
      commands:FireServer("start")
    elseif text == "!stop" then
      commands:FireServer("stop")
    elseif text:sub(1, 6) == "!vote " then
      voteEvent:FireServer(text:sub(7))
    end
  end)

  -- announcements from the server
  announce:Connect(function(text)
    UI.ShowConfirmationToast(text)
    Chat:DisplayChatBubble(self.gameObject.transform, text, "THEATER")
  end)

  -- live state → toasts
  movieTitle.Changed:Connect(function(new)
    if new ~= "" then UI.ShowConfirmationToast("🎬 Now showing: " .. new) end
  end)
  isShowing.Changed:Connect(function(new)
    if new then UI.ShowConfirmationToast("🍿 Movie night started — take a seat!") end
  end)
  voteTally.Changed:Connect(function(new)
    if new ~= "" then UI.ShowConfirmationToast("🗳 Votes: " .. new) end
  end)
end