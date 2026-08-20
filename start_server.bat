@echo off
title TEM Invoice Local Server
cls
echo ========================================================
echo   TEMAH Finger of God - Official Invoice Server
echo ========================================================
echo.
echo  Starting local server on port 8000...
echo.
echo  Open on this Computer: http://localhost:8000
echo.
echo  Open on Phone (Same Wi-Fi): http://192.168.100.51:8000
echo.
echo ========================================================
echo.
node server.js
pause
