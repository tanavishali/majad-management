@echo off
setlocal
cd /d "%~dp0"
echo === Order Desk: one-click start ===
where node >nul 2>nul || (echo Node.js 20+ install karein: https://nodejs.org & pause & exit /b 1)
where docker >nul 2>nul || (echo Docker Desktop install karke chalayen, ya MONGO_URI ko Atlas par set karein - README dekhein & pause & exit /b 1)
if not exist node_modules (
  echo Installing packages...
  call npm install || (echo npm install fail hua & pause & exit /b 1)
)
if not exist backend\.env copy backend\.env.example backend\.env >nul
echo Starting MongoDB...
docker compose -f backend\docker-compose.yml up -d --wait mongo || (echo MongoDB start nahi hua. Docker Desktop chal raha hai? & pause & exit /b 1)
echo Seeding demo data (admin / admin123)...
call npm run seed
start "Order Desk API" cmd /k npm run dev:api
start "Order Desk Web" cmd /k npm run dev:web
timeout /t 10 >nul
start http://localhost:5173
echo.
echo Web: http://localhost:5173   API: http://localhost:4000/healthz
echo Login: admin / admin123
