@echo off
title Plyscope
echo Iniciando o Plyscope...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 pause
