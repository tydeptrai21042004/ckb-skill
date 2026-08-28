@echo off
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo [SkillPass] Node.js 22+ is required for native development.
  echo [SkillPass] Docker-only alternative:
  echo   docker compose -f deploy/compose.demo.yaml up --build
  exit /b 1
)
node scripts\dev-cli.mjs %*
