/**
 * lexer.js — Direct port of src/lexer.c
 * Tokenizes source code into a stream of tokens.
 */

const TokenType = Object.freeze({
    // Keywords
    TOKEN_INT: 'TOKEN_INT',
    TOKEN_VOID: 'TOKEN_VOID',
    TOKEN_IF: 'TOKEN_IF',
    TOKEN_ELSE: 'TOKEN_ELSE',
    TOKEN_WHILE: 'TOKEN_WHILE',
    TOKEN_FOR: 'TOKEN_FOR',
    TOKEN_RETURN: 'TOKEN_RETURN',

    // Literals & identifiers
    TOKEN_NUMBER: 'TOKEN_NUMBER',
    TOKEN_IDENT: 'TOKEN_IDENT',

    // Arithmetic
    TOKEN_PLUS: 'TOKEN_PLUS',
    TOKEN_MINUS: 'TOKEN_MINUS',
    TOKEN_STAR: 'TOKEN_STAR',
    TOKEN_SLASH: 'TOKEN_SLASH',
    TOKEN_PERCENT: 'TOKEN_PERCENT',

    // Assignment
    TOKEN_ASSIGN: 'TOKEN_ASSIGN',

    // Comparison
    TOKEN_EQ: 'TOKEN_EQ',
    TOKEN_NEQ: 'TOKEN_NEQ',
    TOKEN_LT: 'TOKEN_LT',
    TOKEN_GT: 'TOKEN_GT',
    TOKEN_LTE: 'TOKEN_LTE',
    TOKEN_GTE: 'TOKEN_GTE',

    // Logical
    TOKEN_AND: 'TOKEN_AND',
    TOKEN_OR: 'TOKEN_OR',
    TOKEN_NOT: 'TOKEN_NOT',

    // Punctuation
    TOKEN_LPAREN: 'TOKEN_LPAREN',
    TOKEN_RPAREN: 'TOKEN_RPAREN',
    TOKEN_LBRACE: 'TOKEN_LBRACE',
    TOKEN_RBRACE: 'TOKEN_RBRACE',
    TOKEN_SEMI: 'TOKEN_SEMI',
    TOKEN_COMMA: 'TOKEN_COMMA',

    // Special
    TOKEN_EOF: 'TOKEN_EOF',
    TOKEN_ERROR: 'TOKEN_ERROR',
});

const KEYWORDS = {
    'int':    TokenType.TOKEN_INT,
    'void':   TokenType.TOKEN_VOID,
    'if':     TokenType.TOKEN_IF,
    'else':   TokenType.TOKEN_ELSE,
    'while':  TokenType.TOKEN_WHILE,
    'for':    TokenType.TOKEN_FOR,
    'return': TokenType.TOKEN_RETURN,
};

const TOKEN_NAMES = {
    [TokenType.TOKEN_INT]:     'int',
    [TokenType.TOKEN_VOID]:    'void',
    [TokenType.TOKEN_IF]:      'if',
    [TokenType.TOKEN_ELSE]:    'else',
    [TokenType.TOKEN_WHILE]:   'while',
    [TokenType.TOKEN_FOR]:     'for',
    [TokenType.TOKEN_RETURN]:  'return',
    [TokenType.TOKEN_NUMBER]:  'number',
    [TokenType.TOKEN_IDENT]:   'identifier',
    [TokenType.TOKEN_PLUS]:    '+',
    [TokenType.TOKEN_MINUS]:   '-',
    [TokenType.TOKEN_STAR]:    '*',
    [TokenType.TOKEN_SLASH]:   '/',
    [TokenType.TOKEN_PERCENT]: '%',
    [TokenType.TOKEN_ASSIGN]:  '=',
    [TokenType.TOKEN_EQ]:      '==',
    [TokenType.TOKEN_NEQ]:     '!=',
    [TokenType.TOKEN_LT]:      '<',
    [TokenType.TOKEN_GT]:      '>',
    [TokenType.TOKEN_LTE]:     '<=',
    [TokenType.TOKEN_GTE]:     '>=',
    [TokenType.TOKEN_AND]:     '&&',
    [TokenType.TOKEN_OR]:      '||',
    [TokenType.TOKEN_NOT]:     '!',
    [TokenType.TOKEN_LPAREN]:  '(',
    [TokenType.TOKEN_RPAREN]:  ')',
    [TokenType.TOKEN_LBRACE]:  '{',
    [TokenType.TOKEN_RBRACE]:  '}',
    [TokenType.TOKEN_SEMI]:    ';',
    [TokenType.TOKEN_COMMA]:   ',',
    [TokenType.TOKEN_EOF]:     'end of file',
    [TokenType.TOKEN_ERROR]:   'error',
};

function tokenTypeName(t) {
    return TOKEN_NAMES[t] || '?';
}

/**
 * Categorize a token type for UI coloring.
 */
function tokenCategory(t) {
    switch (t) {
        case TokenType.TOKEN_INT: case TokenType.TOKEN_VOID:
        case TokenType.TOKEN_IF: case TokenType.TOKEN_ELSE:
        case TokenType.TOKEN_WHILE: case TokenType.TOKEN_FOR:
        case TokenType.TOKEN_RETURN:
            return 'keyword';
        case TokenType.TOKEN_NUMBER:
            return 'number';
        case TokenType.TOKEN_IDENT:
            return 'identifier';
        case TokenType.TOKEN_PLUS: case TokenType.TOKEN_MINUS:
        case TokenType.TOKEN_STAR: case TokenType.TOKEN_SLASH:
        case TokenType.TOKEN_PERCENT: case TokenType.TOKEN_ASSIGN:
        case TokenType.TOKEN_EQ: case TokenType.TOKEN_NEQ:
        case TokenType.TOKEN_LT: case TokenType.TOKEN_GT:
        case TokenType.TOKEN_LTE: case TokenType.TOKEN_GTE:
        case TokenType.TOKEN_AND: case TokenType.TOKEN_OR:
        case TokenType.TOKEN_NOT:
            return 'operator';
        case TokenType.TOKEN_LPAREN: case TokenType.TOKEN_RPAREN:
        case TokenType.TOKEN_LBRACE: case TokenType.TOKEN_RBRACE:
        case TokenType.TOKEN_SEMI: case TokenType.TOKEN_COMMA:
            return 'punctuation';
        case TokenType.TOKEN_EOF:
            return 'eof';
        default:
            return 'error';
    }
}

class Lexer {
    constructor(source) {
        this.source = source;
        this.pos = 0;
        this.line = 1;
        this.current = null;
        this.advance(); // prime the first token
    }

    peek() {
        return this.pos < this.source.length ? this.source[this.pos] : '\0';
    }

    advanceChar() {
        return this.source[this.pos++];
    }

    atEnd() {
        return this.pos >= this.source.length;
    }

    skipWhitespaceAndComments() {
        while (!this.atEnd()) {
            const c = this.peek();
            if (c === ' ' || c === '\t' || c === '\r') {
                this.pos++;
            } else if (c === '\n') {
                this.pos++;
                this.line++;
            } else if (c === '/' && this.source[this.pos + 1] === '/') {
                this.pos += 2;
                while (!this.atEnd() && this.peek() !== '\n') this.pos++;
            } else if (c === '/' && this.source[this.pos + 1] === '*') {
                this.pos += 2;
                while (!this.atEnd()) {
                    if (this.peek() === '\n') this.line++;
                    if (this.peek() === '*' && this.source[this.pos + 1] === '/') {
                        this.pos += 2;
                        break;
                    }
                    this.pos++;
                }
            } else {
                break;
            }
        }
    }

    makeToken(type, value) {
        return { type, value, int_val: 0, line: this.line };
    }

    makeNumber(val) {
        return { type: TokenType.TOKEN_NUMBER, value: String(val), int_val: val, line: this.line };
    }

    makeError(msg) {
        return { type: TokenType.TOKEN_ERROR, value: msg, int_val: 0, line: this.line };
    }

    scanToken() {
        this.skipWhitespaceAndComments();
        if (this.atEnd()) return this.makeToken(TokenType.TOKEN_EOF, 'EOF');

        const c = this.advanceChar();

        // Single-char tokens
        switch (c) {
            case '(': return this.makeToken(TokenType.TOKEN_LPAREN, '(');
            case ')': return this.makeToken(TokenType.TOKEN_RPAREN, ')');
            case '{': return this.makeToken(TokenType.TOKEN_LBRACE, '{');
            case '}': return this.makeToken(TokenType.TOKEN_RBRACE, '}');
            case ';': return this.makeToken(TokenType.TOKEN_SEMI, ';');
            case ',': return this.makeToken(TokenType.TOKEN_COMMA, ',');
            case '+': return this.makeToken(TokenType.TOKEN_PLUS, '+');
            case '-': return this.makeToken(TokenType.TOKEN_MINUS, '-');
            case '*': return this.makeToken(TokenType.TOKEN_STAR, '*');
            case '/': return this.makeToken(TokenType.TOKEN_SLASH, '/');
            case '%': return this.makeToken(TokenType.TOKEN_PERCENT, '%');
        }

        // Two-char operators
        if (c === '=' && this.peek() === '=') { this.pos++; return this.makeToken(TokenType.TOKEN_EQ, '=='); }
        if (c === '=') return this.makeToken(TokenType.TOKEN_ASSIGN, '=');
        if (c === '!' && this.peek() === '=') { this.pos++; return this.makeToken(TokenType.TOKEN_NEQ, '!='); }
        if (c === '!') return this.makeToken(TokenType.TOKEN_NOT, '!');
        if (c === '<' && this.peek() === '=') { this.pos++; return this.makeToken(TokenType.TOKEN_LTE, '<='); }
        if (c === '<') return this.makeToken(TokenType.TOKEN_LT, '<');
        if (c === '>' && this.peek() === '=') { this.pos++; return this.makeToken(TokenType.TOKEN_GTE, '>='); }
        if (c === '>') return this.makeToken(TokenType.TOKEN_GT, '>');
        if (c === '&' && this.peek() === '&') { this.pos++; return this.makeToken(TokenType.TOKEN_AND, '&&'); }
        if (c === '|' && this.peek() === '|') { this.pos++; return this.makeToken(TokenType.TOKEN_OR, '||'); }

        // Number literal
        if (c >= '0' && c <= '9') {
            let val = c.charCodeAt(0) - 48;
            while (!this.atEnd() && this.peek() >= '0' && this.peek() <= '9') {
                val = val * 10 + (this.advanceChar().charCodeAt(0) - 48);
            }
            return this.makeNumber(val);
        }

        // Identifier or keyword
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
            let buf = c;
            while (!this.atEnd() && (
                (this.peek() >= 'a' && this.peek() <= 'z') ||
                (this.peek() >= 'A' && this.peek() <= 'Z') ||
                (this.peek() >= '0' && this.peek() <= '9') ||
                this.peek() === '_'
            )) {
                buf += this.advanceChar();
            }
            if (KEYWORDS[buf] !== undefined) {
                return this.makeToken(KEYWORDS[buf], buf);
            }
            return this.makeToken(TokenType.TOKEN_IDENT, buf);
        }

        return this.makeError('unexpected character: ' + c);
    }

    advance() {
        this.current = this.scanToken();
        if (this.current.type === TokenType.TOKEN_ERROR) {
            throw new CompileError(this.current.line, this.current.value);
        }
    }
}

class CompileError extends Error {
    constructor(line, message) {
        super(line > 0 ? `[line ${line}] Error: ${message}` : `Error: ${message}`);
        this.line = line;
        this.name = 'CompileError';
    }
}

/**
 * Tokenize entire source into an array (for visualization).
 */
function tokenizeAll(source) {
    const tokens = [];
    const lexer = new Lexer(source);
    while (lexer.current.type !== TokenType.TOKEN_EOF) {
        tokens.push({ ...lexer.current, category: tokenCategory(lexer.current.type) });
        lexer.advance();
    }
    tokens.push({ ...lexer.current, category: 'eof' });
    return tokens;
}

if (typeof module !== 'undefined') {
    module.exports = { TokenType, Lexer, CompileError, tokenTypeName, tokenCategory, tokenizeAll };
}
