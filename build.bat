@echo off
echo.
echo  ================================
echo   Building RecCompiler...
echo  ================================
echo.

gcc -o reccompiler.exe src\main.c src\lexer.c src\ast.c src\parser.c src\compiler.c src\vm.c -Wall -Wextra -std=c99 -O2

if %errorlevel% neq 0 (
    echo.
    echo  BUILD FAILED!
    echo  Make sure GCC is installed and in your PATH.
    echo  Download from: https://winlibs.com/
    exit /b 1
)

echo  Build successful!
echo  Output: reccompiler.exe
echo.
echo  Quick start:
echo    reccompiler edit myprogram.c    -- write code
echo    reccompiler run  myprogram.c    -- compile ^& run
echo    reccompiler help                -- all commands
echo.
