@echo off
rem Fake gradlew that fails like a broken dependency resolution.
echo Build file: %CD%\build.gradle
echo ^> Task :compileJava FAILED
echo FAILURE: Build failed with an exception.
echo.
echo * What went wrong:
echo Could not resolve net.neoforged:neoforge:21.1.251.
echo ^> Run with --stacktrace option to get the stack trace.
echo BUILD FAILED in 2s
exit /b 1
