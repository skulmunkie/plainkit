@echo off
rem Serves the SDK site (gallery, theme editor, scorecard) and opens it. Needs only Node: tools\start.cmd [port]
set PORT=%1
if "%PORT%"=="" set PORT=5310
start "" "http://localhost:%PORT%/"
node "%~dp0serve.mjs" %PORT%
