/**
 * console.js — Output console and terminal component.
 */

class ConsolePanel {
    constructor() {
        this.outputEl = document.getElementById('console-output');
        this.terminalHistory = document.getElementById('terminal-history');
        this.terminalInput = document.getElementById('terminal-input');
        this.tabs = document.querySelectorAll('.console-tab');
        this.contents = {
            output: document.getElementById('console-output'),
            terminal: document.getElementById('console-terminal'),
        };

        // Input callback for scan()
        this.inputCallback = null;
        this.inputQueue = [];

        this.setupEvents();
    }

    setupEvents() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.tabs.forEach(t => t.classList.remove('active'));
                Object.values(this.contents).forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                this.contents[tab.dataset.tab].classList.add('active');
            });
        });

        // Clear button
        document.getElementById('btn-clear-console').addEventListener('click', () => {
            this.clear();
        });

        // Terminal input
        this.terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = this.terminalInput.value.trim();
                this.terminalInput.value = '';

                // Show in terminal history
                this.addTerminalLine(`› ${val}`, 'info');

                const num = parseInt(val, 10);
                if (isNaN(num)) {
                    this.addTerminalLine('Error: please enter a valid integer', 'error');
                } else {
                    this.inputQueue.push(num);
                    if (this.inputCallback) {
                        this.inputCallback(num);
                        this.inputCallback = null;
                    }
                }
            }
        });
    }

    /**
     * Switch to the output tab.
     */
    showOutput() {
        this.tabs.forEach(t => t.classList.remove('active'));
        Object.values(this.contents).forEach(c => c.classList.remove('active'));
        this.tabs[0].classList.add('active');
        this.contents.output.classList.add('active');
    }

    /**
     * Switch to terminal tab.
     */
    showTerminal() {
        this.tabs.forEach(t => t.classList.remove('active'));
        Object.values(this.contents).forEach(c => c.classList.remove('active'));
        this.tabs[1].classList.add('active');
        this.contents.terminal.classList.add('active');
        this.terminalInput.focus();
    }

    log(text, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = text;
        this.outputEl.appendChild(line);
        this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }

    addTerminalLine(text, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = text;
        this.terminalHistory.appendChild(line);
        this.terminalHistory.scrollTop = this.terminalHistory.scrollHeight;
    }

    clear() {
        this.outputEl.innerHTML = '';
        this.terminalHistory.innerHTML = '';
        this.inputQueue = [];
    }

    /**
     * Get an input value for scan().
     * Returns from queue if available, otherwise prompts.
     */
    getInput() {
        if (this.inputQueue.length > 0) {
            return this.inputQueue.shift();
        }
        // If no input queued, switch to terminal and ask
        this.showTerminal();
        this.addTerminalLine('⏳ Waiting for input (scan())...', 'dim');
        this.terminalInput.focus();
        this.terminalInput.placeholder = 'Enter integer value...';

        // We can't truly block, so return 0 as default
        // For a real async solution, the VM would need to be async
        return 0;
    }
}
