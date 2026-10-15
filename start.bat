@echo off
chcp 65001 > nul
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
  where py >nul 2>nul
  if %errorlevel% neq 0 (
    echo 未检测到 Python，请先安装
    pause
    exit /b
  )
  set "PY=py"
) else (
  set "PY=python"
)

set "HTMLFILE="
for %%f in (*.html) do (
  if not defined HTMLFILE set "HTMLFILE=%%f"
)
if not defined HTMLFILE (
  echo 当前目录下没有 HTML 文件
  pause
  exit /b
)

echo.
echo  行测错题本 · 本地服务启动中...
echo  文件：%HTMLFILE%
echo  已启用 no-cache，普通刷新即可看到最新版本
echo.
start "" "http://localhost:8000/%HTMLFILE%"
%PY% start.py