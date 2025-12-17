@echo off
title UDP to HTTP Adapter
cd /d "%~dp0"
"C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot\bin\java.exe" -cp ".;gson-2.10.1.jar" UdpToHttpAdapter
pause
