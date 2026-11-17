@echo off
chcp 65001 >nul
title AI SMP - Build plugin
where mvn >nul 2>nul
if errorlevel 1 (
  echo Maven is not installed or not added to PATH.
  echo Install Maven and Java 25, then run this file again.
  pause
  exit /b 1
)
java -version
mvn clean package
if errorlevel 1 (
  echo.
  echo BUILD FAILED. Copy the complete error log when asking for help.
  pause
  exit /b 1
)
echo.
echo SUCCESS: target\ai-smp-1.0.0.jar
pause
