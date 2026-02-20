@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo Capacitor Android 클린 리빌드
echo ========================================

echo [1] capacitor.config.json 확인...
findstr /C:"webDir" capacitor.config.json
echo webDir이 "www"인지 확인하세요. "c:\\Cursor"이면 잘못된 것입니다.
pause

echo.
echo [2] android 폴더 삭제...
if exist "android" (
    rmdir /S /Q "android"
    echo   - android 삭제 완료
) else (
    echo   - android 폴더 없음
)

echo.
echo [3] www 폴더 내용 확인 (node_modules 있으면 안됨)...
if exist "www\node_modules" (
    echo   [오류] www 안에 node_modules가 있습니다! 삭제 후 다시 실행하세요.
    rmdir /S /Q "www\node_modules"
    echo   - www\node_modules 삭제함
)
if exist "www\android" (
    echo   [오류] www 안에 android가 있습니다! 삭제합니다.
    rmdir /S /Q "www\android"
)

echo.
echo [4] copy-to-www.bat 실행 (웹 에셋 복사)...
call copy-to-www.bat

echo.
echo [5] npx cap add android 실행...
call npx cap add android

echo.
echo [6] npx cap sync 실행...
call npx cap sync

echo.
echo [7] android 폴더 크기 확인...
for /f "tokens=3" %%a in ('dir android /s ^| findstr "bytes"') do echo   크기: %%a
echo.
echo android\app\src\main\assets\public 폴더를 확인하세요.
echo 이 폴더에 index.html, game.js 등만 있어야 합니다 (node_modules 없어야 함).
echo.
pause
