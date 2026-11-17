# AI agent runtime

This process connects 19 separate player clients to your own private Paper 26.2 server. It is separate from the Java plugin.

## Requirements
- Node.js 22+
- Paper 26.2
- AISMP plugin installed
- Optional: Ollama running locally with a small Russian-capable model

Keep the server private and whitelist enabled. Offline-mode usernames are not authenticated identities. Do not expose an offline-mode server directly to the public internet.

## Install and run (Windows)
1. Start Paper and wait until the server is ready.
2. Open this folder in PowerShell or double-click `start.bat`.
3. The first run installs the Node dependencies automatically.

Manual launch:

```powershell
npm install
$env:MC_HOST="127.0.0.1"
$env:MC_PORT="25565"
$env:MC_VERSION="26.2"
npm start
```

If the server is on another PC, use its private LAN IP for MC_HOST.

## Optional local AI conversations (Ollama)
The game simulation works without Ollama. Without it, agents use built-in Russian dialogue.

To enable locally generated dialogue, install and run Ollama, then download a small model:

```powershell
ollama pull qwen2.5:3b
```

Keep Ollama running, then launch the runtime with:

```powershell
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="qwen2.5:3b"
npm start
```

All model requests go to localhost; no OpenAI API key is used. The runtime queues requests so 19 agents do not send prompts simultaneously. If Ollama is offline, the built-in dialogue is used automatically.

## Current simulation
- 19 unique agent profiles with different roles and personalities.
- Separate real Minecraft client connections.
- Circle staging and 60-second countdown, started only after all 19 agents connect.
- Reconnect attempts if a client drops.
- Explorer, gatherer and builder routines using Mineflayer pathfinding.
- Russian chat and basic relationship tracking between agents.
- Persistent local memories in `memory.json` (created automatically and not committed to Git).
- Optional Ollama-generated dialogue based on each agent's recent events and relationships.

## Honest limitations
This is an evolving prototype, not a finished human-level autonomous civilization. Most in-world actions are currently rule-based. Ollama currently improves dialogue/personality, not pathfinding or strategic planning. The current build does not implement combat. Settlement construction, shared faction goals, diplomacy, food/shelter needs, richer memory retrieval and automated world-history reports remain future milestones.
