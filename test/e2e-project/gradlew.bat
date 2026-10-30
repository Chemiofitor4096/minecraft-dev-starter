@echo off
rem Fake gradlew: print ready markers then hang. Used by the launch end-to-end check.
echo Build file: %CD%\build.gradle
echo ^> Task :compileJava UP-TO-DATE
echo ^> Task :processResources
echo Starting a Gradle Daemon
echo [Render thread/INFO]: Backend library: LWJGL 3.3.3
echo [Render thread/INFO]: OpenAL initialized on device Speakers
:loop
ping -n 3 127.0.0.1 > nul
goto loop
