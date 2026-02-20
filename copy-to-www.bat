@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo www 폴더로 웹 에셋 복사
echo ========================================

if not exist "www" mkdir www

echo [1/4] index.html, game.js, firebase.js 복사...
copy /Y "index.html" "www\" >nul
copy /Y "game.js" "www\" >nul
copy /Y "firebase.js" "www\" >nul

echo [2/4] 그림 폴더 복사...
if exist "그림" (
    xcopy "그림" "www\그림\" /E /I /Y >nul 2>&1
    echo   - 그림 폴더 복사 완료
) else (
    echo   - 그림 폴더가 없습니다. www\그림\ 에 이미지 파일을 넣어주세요.
)

echo [3/4] 배경음악 폴더 복사...
if exist "배경음악" (
    xcopy "배경음악" "www\배경음악\" /E /I /Y >nul 2>&1
    echo   - 배경음악 폴더 복사 완료
) else (
    echo   - 배경음악 폴더가 없습니다. www\배경음악\ 에 mp3 파일을 넣어주세요.
)

echo [4/4] Capacitor 동기화...
call npx cap sync

echo.
echo ========================================
echo 복사 완료!
echo ========================================
pause
