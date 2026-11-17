# AI SMP 26.2

Paper plugin + separate Mineflayer agent runtime for a private Minecraft Java 26.2 world.

## What is in this first version
- 19 named AI player clients (not villagers or disguised mobs).
- Plugin places connected agents in a circle around world spawn.
- Agents are held in place during a 60-second countdown.
- The plugin announces the start and releases them.
- `/aismp status`, `/aismp start`, `/aismp stop`.
- Agent runtime is a separate Node.js process because a Paper plugin cannot create genuine network player clients by itself.

## Requirements
- Paper 26.2
- Java 25 to build/run the Paper 26.2 server
- Node.js 22+
- Private server only. Keep whitelist enabled and do not expose an offline-mode server to the public internet.

## Build the plugin
Run from this repository folder:
```powershell
mvn clean package
```
Copy `target\ai-smp-1.0.0.jar` into the server's `plugins` folder and restart Paper.

## Configure
Edit `plugins/AISMP/config.yml` if you want different names or a different countdown. The default list contains 19 unique names.

## Start the agents
See `agent-runtime/README.md`. Start the server first, then run the agent runtime on the same PC using host `127.0.0.1`.

## Current scope
This initial milestone establishes real player connections, spawn staging, the countdown and a non-combat civilization simulation foundation. Autonomous exploration, resource gathering, settlement building, memory, diplomacy and long-term world history are being added in staged modules; they should not be confused with a finished advanced-AI civilization system yet.
