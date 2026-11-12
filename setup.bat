@echo off
cd /d "%~dp0"
if not exist .env (
  echo Creating .env from .env.example...
  copy .env.example .env >nul
)
echo Installing packages...
call npm install || goto :fail
echo Building...
call npm run build || goto :fail
echo Loading the bundled data...
call npm run import-db || goto :fail
echo Setting up the database...
call npm run migrate || goto :fail
echo.
echo Setup complete. Run start.bat to start the system.
pause
exit /b 0
:fail
echo.
echo Setup failed. Check the message above (is MySQL running in XAMPP? is .env filled in?).
pause
exit /b 1
