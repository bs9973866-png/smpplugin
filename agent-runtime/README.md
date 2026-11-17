# AI agent runtime

This process connects 19 separate player clients to your own private Paper 26.2 server. It is separate from the Java plugin.

## Requirements
- Node.js 22+
- Paper 26.2
- AISMP plugin installed
- Ollama running locally with a model that supports Russian and structured JSON output

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
$env:OLLAMA_MODEL="qwen2.5:3b"
npm start
```

## Install the local AI
Install Ollama, start it, then download the default model:

```powershell
ollama pull qwen2.5:3b
```

Ollama must remain running at `http://127.0.0.1:11434`. The model can be changed with `OLLAMA_MODEL`; the URL can be changed with `OLLAMA_URL`. All model requests go to localhost; no OpenAI API key is used. By default, agents wait instead of pretending to think when Ollama is unavailable. Set `AI_ALLOW_FALLBACK=true` only if you explicitly want the old simple scripted behavior as a backup.

## How decisions work
Every agent periodically sends its own profile, memories, relationships, inventory, nearby agents, nearby wood and current position to Ollama. The model returns a structured decision. The runtime validates it against a strict action allowlist, then executes the selected in-game action through Mineflayer.

Available decisions:
- Explore nearby terrain and record discoveries.
- Gather wood when resources are useful.
- Build or improve a starter camp when materials are available.
- Visit a nearby agent and start a conversation.
- Choose a home location or return to it.
- Talk or rest.

The model is not given direct access to arbitrary JavaScript, shell commands or server commands. Its output is treated as untrusted data and only validated actions can run. If Ollama is unavailable or returns invalid data, agents wait and retry by default. Optional fallback behavior must be explicitly enabled with `AI_ALLOW_FALLBACK=true`.

## Current limits
This is a genuine LLM-driven decision loop, but it is not yet a human-level civilization simulator. Building is currently a small starter-camp action; agents do not yet have a shared faction economy, sophisticated construction planner, farming/food needs, or long-term multi-agent negotiation. The model decides among supported actions; Mineflayer performs the actual movement and block interactions. Live compatibility and behavior still need testing on your exact Paper 26.2 server.
