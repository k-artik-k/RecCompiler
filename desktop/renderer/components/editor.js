/**
 * editor.js — Custom code editor with line numbers and syntax highlighting.
 */

class CodeEditor {
    constructor() {
        this.textarea = document.getElementById('code-editor');
        this.lineNumbers = document.getElementById('line-numbers');
        this.infoEl = document.getElementById('editor-info');
        this.errorLine = -1;

        this.defaultCode = `// RecCompiler — Write your program here
// Supports: int, void, if/else, while, for, return
// Built-ins: print(expr), scan()

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int x = 5;
    print(factorial(x));
    return 0;
}
`;
        this.textarea.value = this.defaultCode;

        this.setupEvents();
        this.updateLineNumbers();
        this.updateCursorInfo();
    }

    setupEvents() {
        this.textarea.addEventListener('input', () => {
            this.updateLineNumbers();
        });

        this.textarea.addEventListener('scroll', () => {
            this.syncScroll();
        });

        this.textarea.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });

        this.textarea.addEventListener('click', () => this.updateCursorInfo());
        this.textarea.addEventListener('keyup', () => this.updateCursorInfo());
    }

    handleKeydown(e) {
        // Tab support
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            this.textarea.value = this.textarea.value.substring(0, start) + '    ' + this.textarea.value.substring(end);
            this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;
            this.updateLineNumbers();
        }

        // Auto-close braces
        if (e.key === '{') {
            const start = this.textarea.selectionStart;
            // Just let the brace be typed, we'll handle indent on Enter
        }

        // Auto-indent on Enter
        if (e.key === 'Enter') {
            const start = this.textarea.selectionStart;
            const textBefore = this.textarea.value.substring(0, start);
            const currentLine = textBefore.split('\n').pop();
            const indent = currentLine.match(/^(\s*)/)[1];
            const lastChar = textBefore.trimEnd().slice(-1);

            if (lastChar === '{') {
                e.preventDefault();
                const extra = indent + '    ';
                this.textarea.value = textBefore + '\n' + extra + '\n' + indent + '}' + this.textarea.value.substring(start);
                this.textarea.selectionStart = this.textarea.selectionEnd = start + 1 + extra.length;
                this.updateLineNumbers();
            } else if (indent.length > 0) {
                e.preventDefault();
                this.textarea.value = textBefore + '\n' + indent + this.textarea.value.substring(start);
                this.textarea.selectionStart = this.textarea.selectionEnd = start + 1 + indent.length;
                this.updateLineNumbers();
            }
        }
    }

    updateLineNumbers() {
        const lines = this.textarea.value.split('\n');
        let html = '';
        for (let i = 0; i < lines.length; i++) {
            const num = i + 1;
            let cls = 'line-num';
            if (this.errorLine === num) cls += ' error';
            html += `<span class="${cls}">${num}</span>`;
        }
        this.lineNumbers.innerHTML = html;
        this.syncScroll();
    }

    syncScroll() {
        this.lineNumbers.style.transform = `translateY(-${this.textarea.scrollTop}px)`;
    }

    updateCursorInfo() {
        const val = this.textarea.value;
        const pos = this.textarea.selectionStart;
        const lines = val.substring(0, pos).split('\n');
        const ln = lines.length;
        const col = lines[lines.length - 1].length + 1;
        this.infoEl.textContent = `Ln ${ln}, Col ${col}`;
    }

    getValue() {
        return this.textarea.value;
    }

    setValue(text) {
        this.textarea.value = text;
        this.errorLine = -1;
        this.updateLineNumbers();
    }

    setErrorLine(line) {
        this.errorLine = line;
        this.updateLineNumbers();
    }

    clearError() {
        this.errorLine = -1;
        this.updateLineNumbers();
    }

    focus() {
        this.textarea.focus();
    }
}
