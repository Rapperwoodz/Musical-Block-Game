--!Type(UI)
-- Optional HUD for the theater: next-show countdown + now-playing title.
-- Requires movie-night.uxml + movie-night.uss imported into your Studio
-- project and wired to this script via the UI panel (see highrise-studio/README).

--!Bind
local countdownLabel : UILabel = nil
--!Bind
local movieLabel : UILabel = nil

-- Networked state — names must match TheaterServer.lua (auto-synced).
local movieTitle = StringValue.new("MovieTitle", "")
local secondsUntil = NumberValue.new("SecondsUntilShow", -1)

function self:ClientAwake()
  local function refreshCountdown(n)
    if n < 0 then
      countdownLabel:SetPrelocalizedText("No show scheduled — !movienight <minutes>")
    elseif n >= 3600 then
      countdownLabel:SetPrelocalizedText("Next show in " .. math.floor(n / 3600) .. "h " .. math.floor((n % 3600) / 60) .. "m")
    else
      countdownLabel:SetPrelocalizedText("Next show in " .. n .. "s")
    end
  end

  secondsUntil.Changed:Connect(refreshCountdown)
  refreshCountdown(secondsUntil.value)

  movieTitle.Changed:Connect(function(t)
    if t == "" then
      movieLabel:SetPrelocalizedText("")
    else
      movieLabel:SetPrelocalizedText("🎬 " .. t)
    end
  end)
  movieLabel:SetPrelocalizedText(movieTitle.value == "" and "" or ("🎬 " .. movieTitle.value))
end