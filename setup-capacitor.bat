@echo off
chcp 65001 >nul
echo ========================================
echo Capacitor Android 설정 시작
echo ========================================
cd /d "%~dp0"

echo.
echo [1/5] Capacitor 패키지 설치 중...
call npm install @capacitor/core @capacitor/cli @capacitor/android
if errorlevel 1 (
    echo 오류: npm install 실패. Node.js가 설치되어 있는지 확인하세요.
    pause
    exit /b 1
)

echo.
echo [2/5] Capacitor 설정 확인 (capacitor.config.json 사용)

echo.
echo [3/5] Android 플랫폼 추가 중...
call npx cap add android
if errorlevel 1 (
    echo 오류: Android 플랫폼 추가 실패
    pause
    exit /b 1
)

echo.
echo [4/5] 웹 파일 동기화 중...
call npx cap sync

echo.
echo [5/5] 완료! Android Studio를 여시겠습니까?
echo.
choice /C YN /M "Android Studio 열기 (Y=예, N=아니오)"
if errorlevel 2 goto :skip_open
call npx cap open android
:skip_open

echo.
echo ========================================
echo 설정 완료!
echo ========================================
pause
