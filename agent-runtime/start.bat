@echo off
chcp 65001 >nul
title AI SMP - 19 agents
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing AI agent dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
set MC_HOST=127.0.0.1
set MC_PORT=25565
set MC_VERSION=26.2
echo Connecting 19 AI agents to %MC_HOST%:%MC_PORT%...
call npm start
pause
