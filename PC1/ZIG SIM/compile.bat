@echo off
echo Compiling Java files with Gson library...
cd /d "%~dp0"
"C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot\bin\javac.exe" -cp ".;gson-2.10.1.jar" TestUdpSender.java
"C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot\bin\javac.exe" -cp ".;gson-2.10.1.jar" UdpToHttpAdapter.java
echo.
echo Compilation complete!
pause
