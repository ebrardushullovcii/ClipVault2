@echo off

if "%npm_node_execpath%"=="" (
  echo npm_node_execpath not set. Unable to run UI install.
  exit /b 1
)

if "%npm_execpath%"=="" (
  echo npm_execpath not set. Unable to run UI install.
  exit /b 1
)

pushd "%~dp0..\ui" || exit /b 1

"%npm_node_execpath%" "%npm_execpath%" install --no-audit --no-fund
set "install_exit=%errorlevel%"

popd
exit /b %install_exit%
