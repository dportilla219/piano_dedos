@echo off
cd /d "%~dp0"
py -3.11 piano_dedos.py %*
if errorlevel 1 pause
