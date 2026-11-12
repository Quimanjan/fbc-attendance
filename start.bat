@echo off
cd /d "%~dp0"
title FBC Attendance System
if not exist dist\server\index.js call npm run build
start "" http://localhost:3000
npm start
pause
