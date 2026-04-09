#ifndef AST_H
#define AST_H

#include "common.h"
#include "lexer.h"

/* ── AST node types ─────────────────────────────────────── */
typedef enum {
    NODE_PROGRAM,       /* top-level: list of function definitions   */
    NODE_FUNC_DEF,      /* function definition                       */
    NODE_BLOCK,         /* { stmts }                                 */
    NODE_VAR_DECL,      /* int x = expr;                             */
    NODE_IF,            /* if (cond) body else else_body              */
    NODE_WHILE,         /* while (cond) body                         */
    NODE_FOR,           /* for (init; cond; update) body              */
    NODE_RETURN,        /* return expr;                               */
    NODE_EXPR_STMT,     /* expr;                                      */
    NODE_ASSIGN,        /* x = expr                                   */
    NODE_BINARY,        /* expr op expr                               */
    NODE_UNARY,         /* op expr                                    */
    NODE_CALL,          /* func(args)                                 */
    NODE_NUMBER,        /* integer literal                            */
    NODE_IDENT,         /* variable reference                         */
} NodeType;

/* ── AST node ───────────────────────────────────────────── */
typedef struct ASTNode {
    NodeType  type;
    int       line;

    /* Literal value (NODE_NUMBER) */
    int       int_value;

    /* Name (NODE_IDENT, NODE_FUNC_DEF, NODE_VAR_DECL, NODE_CALL, NODE_ASSIGN) */
    char      name[MAX_IDENT_LEN];

    /* Operator token type (NODE_BINARY, NODE_UNARY) */
    TokenType op;

    /* Data type: TOKEN_INT or TOKEN_VOID (NODE_FUNC_DEF, NODE_VAR_DECL) */
    TokenType data_type;

    /* Children pointers — usage depends on node type */
    struct ASTNode *cond;       /* IF/WHILE/FOR: condition           */
    struct ASTNode *body;       /* IF(then)/WHILE/FOR/FUNC_DEF: body */
    struct ASTNode *else_body;  /* IF: else branch                   */
    struct ASTNode *init;       /* FOR: initialiser / VAR_DECL: init */
    struct ASTNode *update;     /* FOR: update expression            */
    struct ASTNode *expr;       /* RETURN/EXPR_STMT/ASSIGN: expr     */
    struct ASTNode *left;       /* BINARY/UNARY: left operand        */
    struct ASTNode *right;      /* BINARY: right operand             */

    /* Lists (PROGRAM funcs, BLOCK stmts, FUNC_DEF params, CALL args) */
    struct ASTNode **items;
    int              item_count;
} ASTNode;

/* ── Helpers ────────────────────────────────────────────── */
ASTNode *ast_new(NodeType type, int line);
void     ast_add_item(ASTNode *parent, ASTNode *child);
void     ast_free(ASTNode *node);

#endif /* AST_H */
