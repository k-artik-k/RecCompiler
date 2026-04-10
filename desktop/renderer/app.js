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
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            document.getElementById('btn-save').click();
        }
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

        // Gather any queued input values for scan()
        const inputValues = consolePanel.inputQueue.splice(0);

        // Use setTimeout to let UI update before running
        setTimeout(() => {
            const startTime = performance.now();

            const result = window.compiler.compileAndRun(source, inputValues);
            const elapsed = (performance.now() - startTime).toFixed(1);

            // Phase 1: Tokens
            if (result.tokens) {
                consolePanel.log(`▸ Lexical Analysis — ${result.tokens.length} tokens`, 'dim');
                visualizer.renderTokens(result.tokens);
            }

            // Phase 2: AST
            if (result.ast) {
                consolePanel.log('▸ Parsing — syntax tree built', 'dim');
                visualizer.renderAST(result.ast);
            }

            // Phase 3: Bytecode
            if (result.bytecode) {
                consolePanel.log(`▸ Compilation — ${result.bytecode.length} instructions`, 'dim');
                visualizer.renderBytecode(result.bytecode, result.semanticInfo);
            }

            // Phase 4: Execution
            if (result.execution) {
                consolePanel.log('▸ Execution', 'dim');

                // Print outputs
                result.execution.outputs.forEach(val => {
                    consolePanel.log(String(val), 'output');
                });

                visualizer.renderExecution(result.execution);
                visualizer.switchTab('execution');

                consolePanel.log('', 'dim');
                consolePanel.log(`✓ Done in ${elapsed}ms (${result.execution.stepCount} steps, depth ${result.execution.maxRecursionDepth})`, 'success');

                compileBtn.className = 'compile-btn success';
                statusText.textContent = `Done (${elapsed}ms)`;
            }

            // Error handling
            if (result.error) {
                consolePanel.log('', 'dim');
                consolePanel.log(`✗ ${result.error.message}`, 'error');

                if (result.error.line > 0) {
                    editor.setErrorLine(result.error.line);
                }

                compileBtn.className = 'compile-btn error';
                statusText.textContent = 'Error';
            }

            // Reset button after delay
            setTimeout(() => {
                compileBtn.className = 'compile-btn';
                if (!result.error) statusText.textContent = 'Ready';
            }, result.error ? 3000 : 2000);

        }, 30);
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
        const consolePanelEl = document.getElementById('console-panel');
        let startY, startEditorH, startConsoleH;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startEditorH = editorPanel.offsetHeight;
            startConsoleH = consolePanelEl.offsetHeight;
            handle.classList.add('active');

            const onMove = (e) => {
                const dy = e.clientY - startY;
                const newEditorH = Math.max(150, startEditorH + dy);
                const newConsoleH = Math.max(80, startConsoleH - dy);
                editorPanel.style.flex = 'none';
                editorPanel.style.height = newEditorH + 'px';
                consolePanelEl.style.height = newConsoleH + 'px';
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
    consolePanel.log('Press Ctrl+Enter or F5 to compile & run', 'dim');
    consolePanel.log('', 'dim');

})();
