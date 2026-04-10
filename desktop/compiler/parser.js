/**
 * parser.js — Direct port of src/parser.c
 * Recursive-descent parser for mini-C.
 */

const { TokenType, CompileError, tokenTypeName } = require('./lexer');
const { NodeType, ASTNode } = require('./ast');

class Parser {
    constructor(lexer) {
        this.lexer = lexer;
    }

    cur() { return this.lexer.current; }
    curline() { return this.lexer.current.line; }

    check(t) { return this.cur().type === t; }

    match(t) {
        if (this.check(t)) { this.lexer.advance(); return true; }
        return false;
    }

    expect(t) {
        if (!this.check(t)) {
            throw new CompileError(this.curline(),
                `expected '${tokenTypeName(t)}', got '${tokenTypeName(this.cur().type)}'`);
        }
        this.lexer.advance();
    }

    isType() {
        return this.check(TokenType.TOKEN_INT) || this.check(TokenType.TOKEN_VOID);
    }

    parseType() {
        const t = this.cur().type;
        if (t !== TokenType.TOKEN_INT && t !== TokenType.TOKEN_VOID) {
            throw new CompileError(this.curline(),
                `expected type (int/void), got '${tokenTypeName(t)}'`);
        }
        this.lexer.advance();
        return t;
    }

    // ── Expressions ─────────────────────────────────────

    parsePrimary() {
        const line = this.curline();

        if (this.check(TokenType.TOKEN_NUMBER)) {
            const n = new ASTNode(NodeType.NODE_NUMBER, line);
            n.int_value = this.cur().int_val;
            this.lexer.advance();
            return n;
        }

        if (this.check(TokenType.TOKEN_IDENT)) {
            const n = new ASTNode(NodeType.NODE_IDENT, line);
            n.name = this.cur().value;
            this.lexer.advance();
            return n;
        }

        if (this.match(TokenType.TOKEN_LPAREN)) {
            const n = this.parseExpr();
            this.expect(TokenType.TOKEN_RPAREN);
            return n;
        }

        throw new CompileError(line,
            `unexpected token '${tokenTypeName(this.cur().type)}' in expression`);
    }

    parsePostfix() {
        let node = this.parsePrimary();

        if (node.type === NodeType.NODE_IDENT && this.check(TokenType.TOKEN_LPAREN)) {
            const line = this.curline();
            this.lexer.advance(); // eat '('
            const call = new ASTNode(NodeType.NODE_CALL, line);
            call.name = node.name;

            if (!this.check(TokenType.TOKEN_RPAREN)) {
                call.addItem(this.parseExpr());
                while (this.match(TokenType.TOKEN_COMMA)) {
                    call.addItem(this.parseExpr());
                }
            }
            this.expect(TokenType.TOKEN_RPAREN);
            return call;
        }
        return node;
    }

    parseUnary() {
        const line = this.curline();
        if (this.check(TokenType.TOKEN_MINUS) || this.check(TokenType.TOKEN_NOT)) {
            const op = this.cur().type;
            this.lexer.advance();
            const n = new ASTNode(NodeType.NODE_UNARY, line);
            n.op = op;
            n.left = this.parseUnary();
            return n;
        }
        return this.parsePostfix();
    }

    parseBinary(subParser, ops) {
        let left = subParser.call(this);
        for (;;) {
            let found = false;
            for (const op of ops) {
                if (this.check(op)) {
                    const line = this.curline();
                    const opType = this.cur().type;
                    this.lexer.advance();
                    const n = new ASTNode(NodeType.NODE_BINARY, line);
                    n.op = opType;
                    n.left = left;
                    n.right = subParser.call(this);
                    left = n;
                    found = true;
                    break;
                }
            }
            if (!found) break;
        }
        return left;
    }

    parseMultiply() {
        return this.parseBinary(this.parseUnary,
            [TokenType.TOKEN_STAR, TokenType.TOKEN_SLASH, TokenType.TOKEN_PERCENT]);
    }

    parseAddition() {
        return this.parseBinary(this.parseMultiply,
            [TokenType.TOKEN_PLUS, TokenType.TOKEN_MINUS]);
    }

    parseComparison() {
        return this.parseBinary(this.parseAddition,
            [TokenType.TOKEN_LT, TokenType.TOKEN_GT, TokenType.TOKEN_LTE, TokenType.TOKEN_GTE]);
    }

    parseEquality() {
        return this.parseBinary(this.parseComparison,
            [TokenType.TOKEN_EQ, TokenType.TOKEN_NEQ]);
    }

    parseLogicAnd() {
        return this.parseBinary(this.parseEquality, [TokenType.TOKEN_AND]);
    }

    parseLogicOr() {
        return this.parseBinary(this.parseLogicAnd, [TokenType.TOKEN_OR]);
    }

    parseAssign() {
        let left = this.parseLogicOr();

        if (this.check(TokenType.TOKEN_ASSIGN) && left.type === NodeType.NODE_IDENT) {
            const line = this.curline();
            this.lexer.advance();
            const n = new ASTNode(NodeType.NODE_ASSIGN, line);
            n.name = left.name;
            n.expr = this.parseAssign(); // right-associative
            return n;
        }
        return left;
    }

    parseExpr() {
        return this.parseAssign();
    }

    // ── Statements ─────────────────────────────────────

    parseVarDecl() {
        const line = this.curline();
        const dtype = this.parseType();
        if (dtype === TokenType.TOKEN_VOID) {
            throw new CompileError(line, 'cannot declare variable of type void');
        }

        const n = new ASTNode(NodeType.NODE_VAR_DECL, line);
        n.data_type = dtype;

        if (!this.check(TokenType.TOKEN_IDENT)) {
            throw new CompileError(this.curline(), 'expected variable name');
        }
        n.name = this.cur().value;
        this.lexer.advance();

        if (this.match(TokenType.TOKEN_ASSIGN)) {
            n.init = this.parseExpr();
        }

        this.expect(TokenType.TOKEN_SEMI);
        return n;
    }

    parseIf() {
        const line = this.curline();
        this.expect(TokenType.TOKEN_IF);
        this.expect(TokenType.TOKEN_LPAREN);
        const n = new ASTNode(NodeType.NODE_IF, line);
        n.cond = this.parseExpr();
        this.expect(TokenType.TOKEN_RPAREN);
        n.body = this.parseStmt();
        if (this.match(TokenType.TOKEN_ELSE)) {
            n.else_body = this.parseStmt();
        }
        return n;
    }

    parseWhile() {
        const line = this.curline();
        this.expect(TokenType.TOKEN_WHILE);
        this.expect(TokenType.TOKEN_LPAREN);
        const n = new ASTNode(NodeType.NODE_WHILE, line);
        n.cond = this.parseExpr();
        this.expect(TokenType.TOKEN_RPAREN);
        n.body = this.parseStmt();
        return n;
    }

    parseFor() {
        const line = this.curline();
        this.expect(TokenType.TOKEN_FOR);
        this.expect(TokenType.TOKEN_LPAREN);
        const n = new ASTNode(NodeType.NODE_FOR, line);

        // Init
        if (this.isType()) {
            n.init = this.parseVarDecl();
        } else if (!this.check(TokenType.TOKEN_SEMI)) {
            n.init = this.parseExpr();
            this.expect(TokenType.TOKEN_SEMI);
        } else {
            this.expect(TokenType.TOKEN_SEMI);
        }

        // Condition
        if (!this.check(TokenType.TOKEN_SEMI)) {
            n.cond = this.parseExpr();
        }
        this.expect(TokenType.TOKEN_SEMI);

        // Update
        if (!this.check(TokenType.TOKEN_RPAREN)) {
            n.update = this.parseExpr();
        }
        this.expect(TokenType.TOKEN_RPAREN);

        n.body = this.parseStmt();
        return n;
    }

    parseReturn() {
        const line = this.curline();
        this.expect(TokenType.TOKEN_RETURN);
        const n = new ASTNode(NodeType.NODE_RETURN, line);
        if (!this.check(TokenType.TOKEN_SEMI)) {
            n.expr = this.parseExpr();
        }
        this.expect(TokenType.TOKEN_SEMI);
        return n;
    }

    parseBlock() {
        const line = this.curline();
        this.expect(TokenType.TOKEN_LBRACE);
        const n = new ASTNode(NodeType.NODE_BLOCK, line);
        while (!this.check(TokenType.TOKEN_RBRACE) && !this.check(TokenType.TOKEN_EOF)) {
            n.addItem(this.parseStmt());
        }
        this.expect(TokenType.TOKEN_RBRACE);
        return n;
    }

    parseStmt() {
        if (this.check(TokenType.TOKEN_LBRACE))  return this.parseBlock();
        if (this.check(TokenType.TOKEN_IF))       return this.parseIf();
        if (this.check(TokenType.TOKEN_WHILE))    return this.parseWhile();
        if (this.check(TokenType.TOKEN_FOR))      return this.parseFor();
        if (this.check(TokenType.TOKEN_RETURN))   return this.parseReturn();
        if (this.isType())                         return this.parseVarDecl();

        const line = this.curline();
        const n = new ASTNode(NodeType.NODE_EXPR_STMT, line);
        n.expr = this.parseExpr();
        this.expect(TokenType.TOKEN_SEMI);
        return n;
    }

    // ── Top-level ─────────────────────────────────────

    parseFuncDef() {
        const line = this.curline();
        const rtype = this.parseType();
        const n = new ASTNode(NodeType.NODE_FUNC_DEF, line);
        n.data_type = rtype;

        if (!this.check(TokenType.TOKEN_IDENT)) {
            throw new CompileError(this.curline(), 'expected function name');
        }
        n.name = this.cur().value;
        this.lexer.advance();

        this.expect(TokenType.TOKEN_LPAREN);

        if (!this.check(TokenType.TOKEN_RPAREN)) {
            do {
                const pline = this.curline();
                const ptype = this.parseType();
                if (!this.check(TokenType.TOKEN_IDENT)) {
                    throw new CompileError(this.curline(), 'expected parameter name');
                }
                const param = new ASTNode(NodeType.NODE_IDENT, pline);
                param.data_type = ptype;
                param.name = this.cur().value;
                this.lexer.advance();
                n.addItem(param);
            } while (this.match(TokenType.TOKEN_COMMA));
        }
        this.expect(TokenType.TOKEN_RPAREN);

        // Forward declaration (prototype): type name(params);
        if (this.check(TokenType.TOKEN_SEMI)) {
            this.lexer.advance(); // eat ';'
            return null; // skip forward declarations
        }

        n.body = this.parseBlock();
        return n;
    }

    parse() {
        const prog = new ASTNode(NodeType.NODE_PROGRAM, 1);
        while (!this.check(TokenType.TOKEN_EOF)) {
            const fn = this.parseFuncDef();
            if (fn !== null) {
                prog.addItem(fn);
            }
        }
        return prog;
    }
}

function parse(lexer) {
    const parser = new Parser(lexer);
    return parser.parse();
}

if (typeof module !== 'undefined') {
    module.exports = { Parser, parse };
}
