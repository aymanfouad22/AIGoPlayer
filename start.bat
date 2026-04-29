@echo off
echo Starting Go backend...
start "Go Backend" cmd /k "cd backend && C:\Users\ayman\Downloads\go_player\.venv\Scripts\uvicorn.exe server:app --host 0.0.0.0 --port 8000"

echo Starting Go frontend...
start "Go Frontend" cmd /k "cd frontend && npm install && npm start"

echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
