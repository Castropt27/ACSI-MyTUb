@echo off
echo ========================================
echo myTUB Fiscal - Quick Start
echo ========================================
echo.

echo [1/3] Verificando Kafka...
docker ps | findstr kafka >nul
if %errorlevel% neq 0 (
    echo ERRO: Kafka nao esta a correr!
    echo Por favor, executa: cd ..\PC1 ^&^& docker-compose up -d
    pause
    exit /b 1
)
echo OK - Kafka a correr

echo.
echo [2/3] A iniciar Bridge Server...
cd bridge
start cmd /k "npm start"
timeout /t 3 >nul

echo.
echo [3/3] A abrir Frontend...
cd ../web
start index.html

echo.
echo ========================================
echo App iniciada com sucesso!
echo ========================================
echo.
echo - Bridge: http://localhost:8081
echo - Frontend: Aberto no browser
echo.
echo Para parar o bridge, fecha a janela do terminal.
echo.
pause
