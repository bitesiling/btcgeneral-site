@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 BTC GENERAL 本地预览...
echo 地址：http://127.0.0.1:8788/index.html
start "" "http://127.0.0.1:8788/index.html"
python -m http.server 8788
pause
