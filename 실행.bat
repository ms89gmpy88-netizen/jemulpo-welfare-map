@echo off
rem 제물포 복지지도를 내 컴퓨터에서 엽니다. 이 창을 닫으면 지도도 꺼집니다.
rem 카카오 지도는 등록한 주소 http://localhost:8765 에서만 열리기 때문에 이 방법으로 엽니다.
cd /d "%~dp0"
where npx >nul 2>nul || (echo Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치해 주세요. & pause & exit /b)
rem 이미 다른 검은 창(또는 다른 프로그램)이 8765번으로 지도를 켜 두었으면 브라우저만 엽니다.
netstat -ano | findstr ":8765" | findstr "LISTENING" >nul && (echo 지도가 이미 켜져 있어서 브라우저만 엽니다. & start "" http://localhost:8765/ & timeout /t 3 >nul & exit /b)
echo 제물포 복지지도를 여는 중입니다. 잠시 후 브라우저가 열립니다.
echo 다 보셨으면 이 검은 창을 닫아 주세요.
call npx -y http-server -a localhost -p 8765 -c-1 -o /index.html
echo.
echo 지도가 꺼졌습니다. 다시 보려면 실행.bat을 다시 더블클릭하세요.
echo (바로 꺼졌다면 이미 다른 검은 창이 켜져 있는 것입니다. 그 창을 닫고 다시 실행하세요.)
pause
