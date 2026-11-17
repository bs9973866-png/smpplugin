# AI agent runtime

This process connects 19 separate player clients to your own private Paper 26.2 server. It is separate from the Java plugin.

## Requirements
- Node.js 22+
- The Paper server running on Minecraft Java 26.2
- The AISMP plugin installed
- Keep the server private and whitelist enabled. Offline-mode names are not authenticated identities.

## Install and run (Windows)
Open PowerShell in the `agent-runtime` folder:

```powershell
npm install
$env:MC_HOST="127.0.0.1"
$env:MC_PORT="25565"
$env:MC_VERSION="26.2"
npm start
```

If your server is on another PC, set MC_HOST to its private LAN address. Do not expose an offline-mode server directly to the public internet.

## How it works
- 19 clients connect one after another with unique names from bots.json.
- The Paper plugin arranges them in a circle around world spawn and freezes their movement.
- The plugin starts its 60-second countdown when the first agent joins.
- After the plugin announces the start, each agent begins its assigned peaceful role: scouting, collecting nearby wood, or attempting a small starter camp.
- Chat is in Russian. This first milestone does not include combat behavior.

The AI is currently rule-based, not a connected large language model. The role, movement and basic gathering loops are a foundation for adding memory, diplomacy, settlement planning and richer individual personalities.
