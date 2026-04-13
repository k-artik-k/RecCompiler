/**
 * visualizer.js — Compiler phase visualizations.
 * Tokens, AST, Bytecode, and Execution (with call stack).
 */

// Inline constants so we don't rely on window.compiler (context bridge limitation)
const _NODE_LABELS = {
    'NODE_PROGRAM':   'Program',
    'NODE_FUNC_DEF':  'FuncDef',
    'NODE_BLOCK':     'Block',
    'NODE_VAR_DECL':  'VarDecl',
    'NODE_IF':        'If',
    'NODE_WHILE':     'While',
    'NODE_FOR':       'For',
    'NODE_RETURN':    'Return',
    'NODE_EXPR_STMT': 'ExprStmt',
    'NODE_ASSIGN':    'Assign',
    'NODE_BINARY':    'Binary',
    'NODE_UNARY':     'Unary',
    'NODE_CALL':      'Call',
    'NODE_NUMBER':    'Number',
    'NODE_IDENT':     'Ident',
};

const _TOKEN_NAMES = {
    'TOKEN_INT': 'int', 'TOKEN_VOID': 'void', 'TOKEN_IF': 'if',
    'TOKEN_ELSE': 'else', 'TOKEN_WHILE': 'while', 'TOKEN_FOR': 'for',
    'TOKEN_RETURN': 'return', 'TOKEN_NUMBER': 'number', 'TOKEN_IDENT': 'identifier',
    'TOKEN_PLUS': '+', 'TOKEN_MINUS': '-', 'TOKEN_STAR': '*',
    'TOKEN_SLASH': '/', 'TOKEN_PERCENT': '%', 'TOKEN_ASSIGN': '=',
    'TOKEN_EQ': '==', 'TOKEN_NEQ': '!=', 'TOKEN_LT': '<',
    'TOKEN_GT': '>', 'TOKEN_LTE': '<=', 'TOKEN_GTE': '>=',
    'TOKEN_AND': '&&', 'TOKEN_OR': '||', 'TOKEN_NOT': '!',
    'TOKEN_LPAREN': '(', 'TOKEN_RPAREN': ')', 'TOKEN_LBRACE': '{',
    'TOKEN_RBRACE': '}', 'TOKEN_SEMI': ';', 'TOKEN_COMMA': ',',
    'TOKEN_EOF': 'end of file', 'TOKEN_ERROR': 'error',
};

function _tokenTypeName(t) { return _TOKEN_NAMES[t] || '?'; }

class Visualizer {
    constructor() {
        this.tabs = document.querySelectorAll('.viz-tab');
        this.contents = {
            tokens: document.getElementById('viz-tokens'),
            ast: document.getElementById('viz-ast'),
            bytecode: document.getElementById('viz-bytecode'),
            execution: document.getElementById('viz-execution'),
        };

        this.setupEvents();
    }

    setupEvents() {
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.tabs.forEach(t => t.classList.remove('active'));
                Object.values(this.contents).forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                this.contents[tab.dataset.tab].classList.add('active');
            });
        });
    }

    switchTab(name) {
        this.tabs.forEach(t => t.classList.remove('active'));
        Object.values(this.contents).forEach(c => c.classList.remove('active'));
        const tab = document.querySelector(`.viz-tab[data-tab="${name}"]`);
        if (tab) tab.classList.add('active');
        if (this.contents[name]) this.contents[name].classList.add('active');
    }

    clear() {
        const emptyHTML = `
            <div class="viz-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <p>Compile to see results</p>
            </div>`;
        Object.values(this.contents).forEach(c => { c.innerHTML = emptyHTML; });
    }

    // ── Tokens ────────────────────────────────────────
    renderTokens(tokens) {
        const el = this.contents.tokens;
        let html = '<div class="token-grid">';
        html += '<div class="token-grid-header"><span>#</span><span>Type</span><span>Value</span><span>Line</span></div>';

        tokens.forEach((token, i) => {
            html += `<div class="token-row token-cat-${token.category}">`;
            html += `<span class="token-idx">${i}</span>`;
            html += `<span class="token-type">${this.formatTokenType(token.type)}</span>`;
            html += `<span class="token-value">${this.escapeHTML(token.value)}</span>`;
            html += `<span class="token-line">${token.line}</span>`;
            html += '</div>';
        });

        html += '</div>';
        el.innerHTML = html;
    }

    formatTokenType(type) {
        return type.replace('TOKEN_', '').toLowerCase();
    }

    // ── AST ──────────────────────────────────────────
    renderAST(ast) {
        const el = this.contents.ast;
        el.innerHTML = '<div class="ast-tree">' + this.renderASTNode(ast, true) + '</div>';

        // Setup collapsible nodes
        el.querySelectorAll('.ast-node-label').forEach(label => {
            label.addEventListener('click', () => {
                const toggle = label.querySelector('.ast-toggle');
                const children = label.nextElementSibling;
                if (toggle && children && children.classList.contains('ast-children')) {
                    toggle.classList.toggle('collapsed');
                    children.classList.toggle('collapsed');
                }
            });
        });
    }

    renderASTNode(node, isRoot = false) {
        if (!node) return '';

        const typeClass = this.getASTTypeClass(node.type);
        const label = this.getASTLabel(node);
        const detail = this.getASTDetail(node);
        const children = this.getASTChildren(node);
        const hasChildren = children.length > 0;

        let html = isRoot ? '' : '<div class="ast-node">';

        html += '<div class="ast-node-label">';
        if (hasChildren) {
            html += '<span class="ast-toggle">▼</span>';
        } else {
            html += '<span style="width:14px;display:inline-block"></span>';
        }
        html += `<span class="ast-type ${typeClass}">${label}</span>`;
        if (detail) html += `<span class="ast-detail">${detail}</span>`;
        html += '</div>';

        if (hasChildren) {
            html += '<div class="ast-children">';
            children.forEach(child => {
                html += this.renderASTNode(child);
            });
            html += '</div>';
        }

        html += isRoot ? '' : '</div>';
        return html;
    }

    getASTTypeClass(type) {
        const map = {
            'NODE_PROGRAM': 'ast-type-program',
            'NODE_FUNC_DEF': 'ast-type-funcdef',
            'NODE_BLOCK': 'ast-type-block',
            'NODE_VAR_DECL': 'ast-type-vardecl',
            'NODE_IF': 'ast-type-if',
            'NODE_WHILE': 'ast-type-while',
            'NODE_FOR': 'ast-type-for',
            'NODE_RETURN': 'ast-type-return',
            'NODE_EXPR_STMT': 'ast-type-exprstmt',
            'NODE_ASSIGN': 'ast-type-assign',
            'NODE_BINARY': 'ast-type-binary',
            'NODE_UNARY': 'ast-type-unary',
            'NODE_CALL': 'ast-type-call',
            'NODE_NUMBER': 'ast-type-number',
            'NODE_IDENT': 'ast-type-ident',
        };
        return map[type] || '';
    }

    getASTLabel(node) {
        return _NODE_LABELS[node.type] || node.type;
    }

    getASTDetail(node) {
        const parts = [];

        if (node.name) parts.push(`"${node.name}"`);
        if (node.type === 'NODE_NUMBER') parts.push(String(node.int_value));
        if (node.op) parts.push(_tokenTypeName(node.op));
        if (node.data_type) parts.push(`type:${_tokenTypeName(node.data_type)}`);

        return parts.length > 0 ? parts.join(' · ') : '';
    }

    getASTChildren(node) {
        const children = [];
        const addLabeled = (label, child) => {
            if (child) {
                child._label = label;
                children.push(child);
            }
        };

        if (node.items && node.items.length > 0) {
            node.items.forEach((item, i) => children.push(item));
        }
        addLabeled('cond', node.cond);
        addLabeled('body', node.body);
        addLabeled('else', node.else_body);
        addLabeled('init', node.init);
        addLabeled('update', node.update);
        addLabeled('expr', node.expr);
        addLabeled('left', node.left);
        addLabeled('right', node.right);

        return children;
    }

    // ── Bytecode ─────────────────────────────────────
    renderBytecode(instructions, semanticInfo) {
        const el = this.contents.bytecode;

        // Build address-to-function map
        const addrToFunc = {};
        if (semanticInfo && semanticInfo.functions) {
            semanticInfo.functions.forEach(f => {
                addrToFunc[f.address] = f;
            });
        }

        let html = '<table class="bytecode-table"><thead><tr>';
        html += '<th>Addr</th><th>Opcode</th><th>Operands</th>';
        html += '</tr></thead><tbody>';

        instructions.forEach(instr => {
            // Check if this is a function entry point
            if (addrToFunc[instr.addr]) {
                const f = addrToFunc[instr.addr];
                html += `<tr class="bytecode-separator"><td colspan="3"></td></tr>`;
                html += `<tr><td colspan="3" style="padding:4px 10px;color:var(--text-muted);font-size:11px;border-bottom:1px solid var(--border)">`;
                html += `── ${f.name}(${f.params.join(', ')}) → ${f.returnType} ──`;
                html += `</td></tr>`;
            }

            const cat = this.getOpCategory(instr.op);
            html += `<tr class="${cat}">`;
            html += `<td class="bytecode-addr">${String(instr.addr).padStart(4, '0')}</td>`;
            html += `<td class="bytecode-op">${instr.name}</td>`;
            html += `<td class="bytecode-operands">${instr.operands}</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        el.innerHTML = html;
    }

    getOpCategory(op) {
        // Numeric opcode values matching compiler.js
        if (op === 0 || op === 1) return 'op-stack';      // CONST, POP
        if (op >= 2 && op <= 7) return 'op-arith';        // ADD..NEG
        if (op >= 8 && op <= 16) return 'op-cmp';         // EQ..NOT
        if (op === 17 || op === 18) return 'op-var';      // LOAD, STORE
        if (op === 19 || op === 20) return 'op-flow';     // JMP, JZ
        if (op >= 21 && op <= 23) return 'op-func';       // CALL, RET, ENTER
        if (op === 24 || op === 25) return 'op-io';       // PRINT, SCAN
        if (op === 26) return 'op-halt';                   // HALT
        return '';
    }

    // ── Execution ────────────────────────────────────
    renderExecution(result) {
        const el = this.contents.execution;

        let html = '<div class="execution-container">';

        // Stats
        html += '<div class="exec-section">';
        html += '<div class="exec-section-header">Execution Summary</div>';
        html += '<div class="exec-stats">';
        html += `<div class="exec-stat"><div class="exec-stat-value">${result.stepCount}</div><div class="exec-stat-label">Instructions</div></div>`;
        html += `<div class="exec-stat"><div class="exec-stat-value">${result.maxRecursionDepth}</div><div class="exec-stat-label">Max Depth</div></div>`;
        html += `<div class="exec-stat"><div class="exec-stat-value">${result.outputs.length}</div><div class="exec-stat-label">Outputs</div></div>`;
        html += '</div></div>';

        // Output values
        if (result.outputs.length > 0) {
            html += '<div class="exec-section">';
            html += '<div class="exec-section-header">Program Output</div>';
            html += '<div style="padding:8px 12px;font-family:var(--font-mono);font-size:12px;">';
            result.outputs.forEach(v => {
                html += `<div style="color:var(--text-primary);padding:2px 0">${v}</div>`;
            });
            html += '</div></div>';
        }

        // Call Stack Timeline
        if (result.callStackHistory.length > 0) {
            html += '<div class="exec-section">';
            html += `<div class="exec-section-header">Call Stack Timeline <span class="badge">${result.callStackHistory.length} events</span></div>`;
            html += '<div class="call-stack-timeline">';

            result.callStackHistory.forEach(event => {
                const indent = event.depth * 16;
                html += `<div class="call-event" style="padding-left:${12 + indent}px">`;

                if (event.action === 'call') {
                    html += '<span class="call-event-icon call">→</span>';
                    html += `<span class="call-event-depth">${event.depth}</span>`;
                    html += `<span class="call-event-name">${event.name}</span>`;
                    html += `<span class="call-event-detail">(${event.args.join(', ')})</span>`;
                } else {
                    html += '<span class="call-event-icon return">←</span>';
                    html += `<span class="call-event-depth">${event.depth}</span>`;
                    html += `<span class="call-event-name">${event.name}</span>`;
                    html += `<span class="call-event-arrow">→</span>`;
                    html += `<span class="call-event-detail">${event.returnValue}</span>`;
                }

                html += '</div>';
            });

            html += '</div></div>';

            // Max depth call stack snapshot
            const maxDepthEvent = result.callStackHistory.find(
                e => e.action === 'call' && e.depth === result.maxRecursionDepth
            );
            if (maxDepthEvent && maxDepthEvent.stack) {
                html += '<div class="exec-section">';
                html += `<div class="exec-section-header">Peak Call Stack <span class="badge">depth ${result.maxRecursionDepth}</span></div>`;
                html += '<div class="call-stack-visual">';

                // Show stack bottom-to-top (reverse for visual)
                const frames = [...maxDepthEvent.stack];
                frames.forEach((frame, i) => {
                    const depthColor = this.getDepthColor(i, frames.length);
                    html += `<div class="stack-frame" style="border-left: 3px solid ${depthColor}">`;
                    html += `<span class="stack-frame-name">${frame.name}</span>`;
                    html += `<span class="stack-frame-args">(${frame.args.join(', ')})</span>`;
                    html += `<span class="stack-frame-depth">depth ${frame.depth}</span>`;
                    html += '</div>';
                });

                html += '</div></div>';
            }
        }

        html += '</div>';
        el.innerHTML = html;
    }

    getDepthColor(index, total) {
        // Gradient from muted to accent as depth increases
        const ratio = total > 1 ? index / (total - 1) : 0;
        const r = Math.round(85 + ratio * 22);
        const g = Math.round(85 + ratio * 94);
        const b = Math.round(85 + ratio * 170);
        return `rgb(${r}, ${g}, ${b})`;
    }

    escapeHTML(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
