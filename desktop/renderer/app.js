/**
 * app.js — Main application controller.
 * Wires editor → compiler pipeline → visualizer.
 */

(function () {
    'use strict';

    // ── Initialize components ─────────────────────────
    const editor = new CodeEditor();
    const consolePanel = new ConsolePanel();
    const visualizer = new Visualizer();

    let currentFilePath = null;

    // ── Window controls ───────────────────────────────
    document.getElementById('btn-minimize').addEventListener('click', () => {
        window.electronAPI.minimize();
    });
    document.getElementById('btn-maximize').addEventListener('click', () => {
        window.electronAPI.maximize();
    });
    document.getElementById('btn-close').addEventListener('click', () => {
        window.electronAPI.close();
    });

    // ── File operations ───────────────────────────────
    document.getElementById('btn-open').addEventListener('click', async () => {
        const result = await window.electronAPI.openFile();
        if (result) {
            editor.setValue(result.content);
            currentFilePath = result.path;
            updateFileName(result.path);
            consolePanel.log(`Opened: ${result.path}`, 'dim');
        }
    });

    document.getElementById('btn-save').addEventListener('click', async () => {
        const content = editor.getValue();
        const path = await window.electronAPI.saveFile({ path: currentFilePath, content });
        if (path) {
            currentFilePath = path;
            updateFileName(path);
            consolePanel.log(`Saved: ${path}`, 'dim');
        }
    });

    // ── Examples dropdown ─────────────────────────────
    const examplesBtn = document.getElementById('btn-examples');
    const examplesMenu = document.getElementById('examples-menu');

    examplesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        examplesMenu.classList.toggle('open');
    });

    document.addEventListener('click', () => {
        examplesMenu.classList.remove('open');
    });

    examplesMenu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', async () => {
            const fileName = btn.dataset.file;
            const result = await window.electronAPI.loadExample(fileName);
            if (result) {
                editor.setValue(result.content);
                currentFilePath = result.path;
                updateFileName(result.path);
                consolePanel.log(`Loaded example: ${fileName}`, 'dim');
            } else {
                consolePanel.log(`Could not find example: ${fileName}`, 'error');
            }
            examplesMenu.classList.remove('open');
        });
    });

    // ── Compile & Run ─────────────────────────────────
    const compileBtn = document.getElementById('btn-compile');
    const statusText = document.getElementById('status-text');

    compileBtn.addEventListener('click', () => {
        compileAndRun();
    });

    // Keyboard shortcut: Ctrl+Enter or F5
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey && e.key === 'Enter') || e.key === 'F5') {
            e.preventDefault();
            compileAndRun();
        }
        // Ctrl+S to save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            document.getElementById('btn-save').click();
        }
        // Ctrl+O to open
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            document.getElementById('btn-open').click();
        }
    });

    function compileAndRun() {
        const source = editor.getValue();
        if (!source.trim()) {
            consolePanel.log('No source code to compile.', 'error');
            return;
        }

        consolePanel.clear();
        editor.clearError();
        compileBtn.className = 'compile-btn running';
        statusText.textContent = 'Compiling...';
        consolePanel.showOutput();

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                const startTime = performance.now();

                // Phase 1: Lexical Analysis
                consolePanel.log('▸ Phase 1: Lexical Analysis...', 'dim');
                let tokens;
                try {
                    tokens = window.compiler.tokenizeAll(source);
                    consolePanel.log(`  ${tokens.length} tokens generated`, 'dim');
                    visualizer.renderTokens(tokens);
                } catch (e) {
                    handleError(e);
                    return;
                }

                // Phase 2: Parsing
                consolePanel.log('▸ Phase 2: Parsing (AST)...', 'dim');
                let ast;
                try {
                    const lexer = new window.compiler.Lexer(source);
                    ast = window.compiler.parse(lexer);
                    consolePanel.log('  Syntax tree built', 'dim');
                    visualizer.renderAST(ast);
                } catch (e) {
                    handleError(e);
                    return;
                }

                // Phase 3: Compilation
                consolePanel.log('▸ Phase 3: Bytecode Compilation...', 'dim');
                let program, semanticInfo;
                try {
                    const result = window.compiler.compile(ast);
                    program = result.program;
                    semanticInfo = result.semanticInfo;
                    const instructions = window.compiler.disassemble(program);
                    consolePanel.log(`  ${program.count} bytecodes emitted`, 'dim');
                    visualizer.renderBytecode(instructions, semanticInfo);
                } catch (e) {
                    handleError(e);
                    return;
                }

                // Phase 4: Execution
                consolePanel.log('▸ Phase 4: Execution...', 'dim');
                try {
                    const funcTable = semanticInfo.functions.map(f => ({
                        name: f.name,
                        address: f.address,
                        nParams: f.params.length,
                    }));

                    const execResult = window.compiler.vmExecute(program, {
                        onOutput: (val) => {
                            consolePanel.log(String(val), 'output');
                        },
                        onInput: () => {
                            return consolePanel.getInput();
                        },
                        onCall: () => {},
                        onReturn: () => {},
                        funcTable,
                    });

                    const elapsed = (performance.now() - startTime).toFixed(1);

                    visualizer.renderExecution(execResult);

                    consolePanel.log('', 'dim');
                    consolePanel.log(`✓ Execution complete (${elapsed}ms, ${execResult.stepCount} steps)`, 'success');

                    if (execResult.exitCode !== 0) {
                        consolePanel.log(`  Exit code: ${execResult.exitCode}`, 'dim');
                    }

                    compileBtn.className = 'compile-btn success';
                    statusText.textContent = `Done (${elapsed}ms)`;

                    // Reset button style after 2s
                    setTimeout(() => {
                        compileBtn.className = 'compile-btn';
                        statusText.textContent = 'Ready';
                    }, 2000);

                } catch (e) {
                    handleError(e);
                    return;
                }

            } catch (e) {
                handleError(e);
            }
        }, 50);
    }

    function handleError(e) {
        consolePanel.log('', 'dim');
        consolePanel.log(`✗ ${e.message}`, 'error');

        if (e.line && e.line > 0) {
            editor.setErrorLine(e.line);
        }

        compileBtn.className = 'compile-btn error';
        statusText.textContent = 'Error';

        setTimeout(() => {
            compileBtn.className = 'compile-btn';
            statusText.textContent = 'Ready';
        }, 3000);
    }

    function updateFileName(filePath) {
        if (filePath) {
            const name = filePath.split(/[/\\]/).pop();
            document.getElementById('file-name').textContent = name;
        } else {
            document.getElementById('file-name').textContent = 'untitled.c';
        }
    }

    // ── Resize Handles ────────────────────────────────
    setupResizeH();
    setupResizeV();

    function setupResizeH() {
        const handle = document.getElementById('editor-console-resize');
        const editorPanel = document.getElementById('editor-panel');
        const consolePanel = document.getElementById('console-panel');
        let startY, startEditorH, startConsoleH;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startEditorH = editorPanel.offsetHeight;
            startConsoleH = consolePanel.offsetHeight;
            handle.classList.add('active');

            const onMove = (e) => {
                const dy = e.clientY - startY;
                const newEditorH = Math.max(150, startEditorH + dy);
                const newConsoleH = Math.max(80, startConsoleH - dy);
                editorPanel.style.flex = 'none';
                editorPanel.style.height = newEditorH + 'px';
                consolePanel.style.height = newConsoleH + 'px';
            };

            const onUp = () => {
                handle.classList.remove('active');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function setupResizeV() {
        const handle = document.getElementById('panel-resize');
        const leftPanel = document.getElementById('left-panel');
        let startX, startWidth;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = leftPanel.offsetWidth;
            handle.classList.add('active');

            const onMove = (e) => {
                const dx = e.clientX - startX;
                const newWidth = Math.max(300, Math.min(window.innerWidth - 300, startWidth + dx));
                leftPanel.style.width = newWidth + 'px';
            };

            const onUp = () => {
                handle.classList.remove('active');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── Initial state ─────────────────────────────────
    editor.focus();
    consolePanel.log('RecCompiler Desktop v2.0', 'dim');
    consolePanel.log('Press Ctrl+Enter or F5 to compile and run', 'dim');
    consolePanel.log('', 'dim');

})();
