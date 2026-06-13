@echo off
REM FlowState dashboard launcher (Windows)
REM   Double-click to run the CSV demo, or pass --serial COMx for live mode.
cd /d "%~dp0"
echo Starting FlowState dashboard...
echo Open http://127.0.0.1:5000 in your browser.
python -m dashboard.app %*
pause
