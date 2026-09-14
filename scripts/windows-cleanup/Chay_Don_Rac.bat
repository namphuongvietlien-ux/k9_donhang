@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Dọn rác Windows - Giải phóng ổ C:

:: Luôn chạy từ thư mục chứa script, kể cả khi UAC mở lại file.
cd /d "%~dp0"

:: Yêu cầu quyền Administrator (UAC).
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  Script can quyen Administrator.
    echo  Dang mo hop thoai UAC...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"
    if errorlevel 1 (
        echo Khong the nang quyen. Hay chuot phai file nay -^> Run as administrator.
        pause
        exit /b 1
    )
    exit /b 0
)

echo.
echo  [OK] Dang chay voi quyen Administrator
echo.

set "PYTHON="
where py >nul 2>&1
if %errorLevel%==0 (
    set "PYTHON=py -3"
    goto :run
)
where python >nul 2>&1
if %errorLevel%==0 (
    set "PYTHON=python"
    goto :run
)
where python3 >nul 2>&1
if %errorLevel%==0 (
    set "PYTHON=python3"
    goto :run
)

echo  Khong tim thay Python 3 trong PATH.
echo  Cai dat tai https://www.python.org/downloads/
echo  Nho CHON "Add python.exe to PATH" khi cai.
echo.
pause
exit /b 1

:run
%PYTHON% "%~dp0clean_windows_junk.py" %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
    echo  Script ket thuc voi ma loi %RC%.
)
pause
exit /b %RC%
