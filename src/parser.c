/*
 * parser.c — Recursive-descent parser for mini-C.
 *
 * Grammar (simplified):
 *   program     → func_def*
 *   func_def    → type IDENT '(' params? ')' block
 *   block       → '{' stmt* '}'
 *   stmt        → var_decl | if | while | for | return | expr_stmt | block
 *   expr        → assign
 *   assign      → IDENT '=' assign | logic_or
 *   logic_or    → logic_and ('||' logic_and)*
 *   logic_and   → equality  ('&&' equality)*
 *   equality    → comparison (('=='|'!=') comparison)*
 *   comparison  → addition   (('<'|'>'|'<='|'>=') addition)*
 *   addition    → multiply   (('+'|'-') multiply)*
 *   multiply    → unary      (('*'|'/'|'%') unary)*
 *   unary       → ('-'|'!') unary | postfix
 *   postfix     → primary ( '(' args? ')' )?
 *   primary     → NUMBER | IDENT | '(' expr ')'
 */

#include "parser.h"

/* ── Parser helpers ─────────────────────────────────────── */
static Token cur(Lexer *l)         { return l->current; }
static int   curline(Lexer *l)     { return l->current.line; }

static bool check(Lexer *l, TokenType t) { return cur(l).type == t; }

static bool match(Lexer *l, TokenType t) {
    if (check(l, t)) { lexer_advance(l); return true; }
    return false;
}

static void expect(Lexer *l, TokenType t) {
    if (!check(l, t))
        error_exit(curline(l), "expected '%s', got '%s'",
                   token_type_name(t), token_type_name(cur(l).type));
    lexer_advance(l);
}

/* ── Forward declarations ───────────────────────────────── */
static ASTNode *parse_block(Lexer *l);
static ASTNode *parse_stmt(Lexer *l);
static ASTNode *parse_expr(Lexer *l);

/* ── Type specifier ─────────────────────────────────────── */
static bool is_type(Lexer *l) {
    return check(l, TOKEN_INT) || check(l, TOKEN_VOID);
}

static TokenType parse_type(Lexer *l) {
    TokenType t = cur(l).type;
    if (t != TOKEN_INT && t != TOKEN_VOID)
        error_exit(curline(l), "expected type (int/void), got '%s'",
                   token_type_name(t));
    lexer_advance(l);
    return t;
}

/* ── Expressions (precedence climbing) ──────────────────── */

static ASTNode *parse_primary(Lexer *l) {
    int line = curline(l);

    /* Number literal */
    if (check(l, TOKEN_NUMBER)) {
        ASTNode *n = ast_new(NODE_NUMBER, line);
        n->int_value = cur(l).int_val;
        lexer_advance(l);
        return n;
    }

    /* Identifier (may be followed by '(' for function call) */
    if (check(l, TOKEN_IDENT)) {
        ASTNode *n = ast_new(NODE_IDENT, line);
        strncpy(n->name, cur(l).value, MAX_IDENT_LEN - 1);
        lexer_advance(l);
        return n;
    }

    /* Parenthesised expression */
    if (match(l, TOKEN_LPAREN)) {
        ASTNode *n = parse_expr(l);
        expect(l, TOKEN_RPAREN);
        return n;
    }

    error_exit(line, "unexpected token '%s' in expression",
               token_type_name(cur(l).type));
    return NULL;
}

/* postfix → primary ( '(' args ')' )? */
static ASTNode *parse_postfix(Lexer *l) {
    ASTNode *node = parse_primary(l);

    /* Function call */
    if (node->type == NODE_IDENT && check(l, TOKEN_LPAREN)) {
        int line = curline(l);
        lexer_advance(l); /* eat '(' */
        ASTNode *call = ast_new(NODE_CALL, line);
        strncpy(call->name, node->name, MAX_IDENT_LEN - 1);
        ast_free(node);

        if (!check(l, TOKEN_RPAREN)) {
            ast_add_item(call, parse_expr(l));
            while (match(l, TOKEN_COMMA))
                ast_add_item(call, parse_expr(l));
        }
        expect(l, TOKEN_RPAREN);
        return call;
    }
    return node;
}

/* unary → ('-'|'!') unary | postfix */
static ASTNode *parse_unary(Lexer *l) {
    int line = curline(l);
    if (check(l, TOKEN_MINUS) || check(l, TOKEN_NOT)) {
        TokenType op = cur(l).type;
        lexer_advance(l);
        ASTNode *n = ast_new(NODE_UNARY, line);
        n->op   = op;
        n->left = parse_unary(l);
        return n;
    }
    return parse_postfix(l);
}

/* Generic binary-operator parser (left-associative) */
typedef ASTNode *(*ParseFn)(Lexer *);

static ASTNode *parse_binary(Lexer *l, ParseFn sub,
                              int n_ops, const TokenType ops[]) {
    ASTNode *left = sub(l);
    for (;;) {
        bool found = false;
        for (int i = 0; i < n_ops; i++) {
            if (check(l, ops[i])) {
                int line = curline(l);
                TokenType op = cur(l).type;
                lexer_advance(l);
                ASTNode *n = ast_new(NODE_BINARY, line);
                n->op    = op;
                n->left  = left;
                n->right = sub(l);
                left = n;
                found = true;
                break;
            }
        }
        if (!found) break;
    }
    return left;
}

static ASTNode *parse_multiply(Lexer *l) {
    static const TokenType ops[] = {TOKEN_STAR, TOKEN_SLASH, TOKEN_PERCENT};
    return parse_binary(l, parse_unary, 3, ops);
}

static ASTNode *parse_addition(Lexer *l) {
    static const TokenType ops[] = {TOKEN_PLUS, TOKEN_MINUS};
    return parse_binary(l, parse_multiply, 2, ops);
}

static ASTNode *parse_comparison(Lexer *l) {
    static const TokenType ops[] = {TOKEN_LT, TOKEN_GT, TOKEN_LTE, TOKEN_GTE};
    return parse_binary(l, parse_addition, 4, ops);
}

static ASTNode *parse_equality(Lexer *l) {
    static const TokenType ops[] = {TOKEN_EQ, TOKEN_NEQ};
    return parse_binary(l, parse_comparison, 2, ops);
}

static ASTNode *parse_logic_and(Lexer *l) {
    static const TokenType ops[] = {TOKEN_AND};
    return parse_binary(l, parse_equality, 1, ops);
}

static ASTNode *parse_logic_or(Lexer *l) {
    static const TokenType ops[] = {TOKEN_OR};
    return parse_binary(l, parse_logic_and, 1, ops);
}

/* assign → IDENT '=' assign | logic_or */
static ASTNode *parse_assign(Lexer *l) {
    ASTNode *left = parse_logic_or(l);

    if (check(l, TOKEN_ASSIGN) && left->type == NODE_IDENT) {
        int line = curline(l);
        lexer_advance(l);
        ASTNode *n = ast_new(NODE_ASSIGN, line);
        strncpy(n->name, left->name, MAX_IDENT_LEN - 1);
        n->expr = parse_assign(l);  /* right-associative */
        ast_free(left);
        return n;
    }
    return left;
}

static ASTNode *parse_expr(Lexer *l) {
    return parse_assign(l);
}

/* ── Statements ─────────────────────────────────────────── */

/* var_decl → 'int' IDENT ('=' expr)? ';' */
static ASTNode *parse_var_decl(Lexer *l) {
    int line = curline(l);
    TokenType dtype = parse_type(l);
    if (dtype == TOKEN_VOID)
        error_exit(line, "cannot declare variable of type void");

    ASTNode *n = ast_new(NODE_VAR_DECL, line);
    n->data_type = dtype;

    if (!check(l, TOKEN_IDENT))
        error_exit(curline(l), "expected variable name");
    strncpy(n->name, cur(l).value, MAX_IDENT_LEN - 1);
    lexer_advance(l);

    if (match(l, TOKEN_ASSIGN))
        n->init = parse_expr(l);

    expect(l, TOKEN_SEMI);
    return n;
}

/* if_stmt → 'if' '(' expr ')' stmt ('else' stmt)? */
static ASTNode *parse_if(Lexer *l) {
    int line = curline(l);
    expect(l, TOKEN_IF);
    expect(l, TOKEN_LPAREN);
    ASTNode *n = ast_new(NODE_IF, line);
    n->cond = parse_expr(l);
    expect(l, TOKEN_RPAREN);
    n->body = parse_stmt(l);
    if (match(l, TOKEN_ELSE))
        n->else_body = parse_stmt(l);
    return n;
}

/* while_stmt → 'while' '(' expr ')' stmt */
static ASTNode *parse_while(Lexer *l) {
    int line = curline(l);
    expect(l, TOKEN_WHILE);
    expect(l, TOKEN_LPAREN);
    ASTNode *n = ast_new(NODE_WHILE, line);
    n->cond = parse_expr(l);
    expect(l, TOKEN_RPAREN);
    n->body = parse_stmt(l);
    return n;
}

/* for_stmt → 'for' '(' (var_decl | expr_stmt | ';') expr? ';' expr? ')' stmt */
static ASTNode *parse_for(Lexer *l) {
    int line = curline(l);
    expect(l, TOKEN_FOR);
    expect(l, TOKEN_LPAREN);
    ASTNode *n = ast_new(NODE_FOR, line);

    /* Init */
    if (is_type(l)) {
        n->init = parse_var_decl(l);   /* includes ';' */
    } else if (!check(l, TOKEN_SEMI)) {
        n->init = parse_expr(l);
        expect(l, TOKEN_SEMI);
    } else {
        expect(l, TOKEN_SEMI);
    }

    /* Condition */
    if (!check(l, TOKEN_SEMI))
        n->cond = parse_expr(l);
    expect(l, TOKEN_SEMI);

    /* Update */
    if (!check(l, TOKEN_RPAREN))
        n->update = parse_expr(l);
    expect(l, TOKEN_RPAREN);

    n->body = parse_stmt(l);
    return n;
}

/* return_stmt → 'return' expr? ';' */
static ASTNode *parse_return(Lexer *l) {
    int line = curline(l);
    expect(l, TOKEN_RETURN);
    ASTNode *n = ast_new(NODE_RETURN, line);
    if (!check(l, TOKEN_SEMI))
        n->expr = parse_expr(l);
    expect(l, TOKEN_SEMI);
    return n;
}

/* block → '{' stmt* '}' */
static ASTNode *parse_block(Lexer *l) {
    int line = curline(l);
    expect(l, TOKEN_LBRACE);
    ASTNode *n = ast_new(NODE_BLOCK, line);
    while (!check(l, TOKEN_RBRACE) && !check(l, TOKEN_EOF))
        ast_add_item(n, parse_stmt(l));
    expect(l, TOKEN_RBRACE);
    return n;
}

/* stmt dispatcher */
static ASTNode *parse_stmt(Lexer *l) {
    if (check(l, TOKEN_LBRACE))  return parse_block(l);
    if (check(l, TOKEN_IF))      return parse_if(l);
    if (check(l, TOKEN_WHILE))   return parse_while(l);
    if (check(l, TOKEN_FOR))     return parse_for(l);
    if (check(l, TOKEN_RETURN))  return parse_return(l);
    if (is_type(l))              return parse_var_decl(l);

    /* Expression statement */
    int line = curline(l);
    ASTNode *n = ast_new(NODE_EXPR_STMT, line);
    n->expr = parse_expr(l);
    expect(l, TOKEN_SEMI);
    return n;
}

/* ── Top-level: function definitions ────────────────────── */

static ASTNode *parse_func_def(Lexer *l) {
    int line = curline(l);
    TokenType rtype = parse_type(l);

    ASTNode *n = ast_new(NODE_FUNC_DEF, line);
    n->data_type = rtype;

    if (!check(l, TOKEN_IDENT))
        error_exit(curline(l), "expected function name");
    strncpy(n->name, cur(l).value, MAX_IDENT_LEN - 1);
    lexer_advance(l);

    expect(l, TOKEN_LPAREN);

    /* Parameter list */
    if (!check(l, TOKEN_RPAREN)) {
        do {
            int pline = curline(l);
            TokenType ptype = parse_type(l);
            if (!check(l, TOKEN_IDENT))
                error_exit(curline(l), "expected parameter name");
            ASTNode *param = ast_new(NODE_IDENT, pline);
            param->data_type = ptype;
            strncpy(param->name, cur(l).value, MAX_IDENT_LEN - 1);
            lexer_advance(l);
            ast_add_item(n, param);  /* params stored in items[] */
        } while (match(l, TOKEN_COMMA));
    }
    expect(l, TOKEN_RPAREN);

    n->body = parse_block(l);
    return n;
}

/* ── Entry point ────────────────────────────────────────── */

ASTNode *parser_parse(Lexer *l) {
    ASTNode *prog = ast_new(NODE_PROGRAM, 1);
    while (!check(l, TOKEN_EOF))
        ast_add_item(prog, parse_func_def(l));
    return prog;
}
