#ifndef LEXER_H
#define LEXER_H

#include "common.h"

/* ── Token types ────────────────────────────────────────── */
typedef enum {
    /* Keywords */
    TOKEN_INT, TOKEN_VOID, TOKEN_IF, TOKEN_ELSE,
    TOKEN_WHILE, TOKEN_FOR, TOKEN_RETURN,

    /* Literals & identifiers */
    TOKEN_NUMBER,       /* integer literal       */
    TOKEN_IDENT,        /* identifier            */

    /* Arithmetic */
    TOKEN_PLUS,         /* +  */
    TOKEN_MINUS,        /* -  */
    TOKEN_STAR,         /* *  */
    TOKEN_SLASH,        /* /  */
    TOKEN_PERCENT,      /* %  */

    /* Assignment */
    TOKEN_ASSIGN,       /* =  */

    /* Comparison */
    TOKEN_EQ,           /* == */
    TOKEN_NEQ,          /* != */
    TOKEN_LT,           /* <  */
    TOKEN_GT,           /* >  */
    TOKEN_LTE,          /* <= */
    TOKEN_GTE,          /* >= */

    /* Logical */
    TOKEN_AND,          /* && */
    TOKEN_OR,           /* || */
    TOKEN_NOT,          /* !  */

    /* Punctuation */
    TOKEN_LPAREN,       /* (  */
    TOKEN_RPAREN,       /* )  */
    TOKEN_LBRACE,       /* {  */
    TOKEN_RBRACE,       /* }  */
    TOKEN_SEMI,         /* ;  */
    TOKEN_COMMA,        /* ,  */

    /* Special */
    TOKEN_EOF,
    TOKEN_ERROR
} TokenType;

/* A single token produced by the lexer */
typedef struct {
    TokenType type;
    char      value[MAX_IDENT_LEN];   /* text of the token */
    int       int_val;                /* numeric value (for TOKEN_NUMBER) */
    int       line;
} Token;

/* Lexer state */
typedef struct {
    const char *source;
    int         pos;
    int         line;
    Token       current;
} Lexer;

/* API */
void  lexer_init(Lexer *l, const char *source);
void  lexer_advance(Lexer *l);     /* read next token into l->current */

/* Convenience: returns name string for a token type (for error messages) */
const char *token_type_name(TokenType t);

#endif /* LEXER_H */
