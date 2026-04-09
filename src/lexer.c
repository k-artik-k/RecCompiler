#include "lexer.h"

/* ── Keyword table ──────────────────────────────────────── */
typedef struct { const char *word; TokenType type; } Keyword;

static const Keyword keywords[] = {
    {"int",    TOKEN_INT},
    {"void",   TOKEN_VOID},
    {"if",     TOKEN_IF},
    {"else",   TOKEN_ELSE},
    {"while",  TOKEN_WHILE},
    {"for",    TOKEN_FOR},
    {"return", TOKEN_RETURN},
    {NULL,     TOKEN_EOF}
};

/* ── Helpers ────────────────────────────────────────────── */
static char peek(Lexer *l)           { return l->source[l->pos]; }
static char advance_char(Lexer *l)   { return l->source[l->pos++]; }
static bool at_end(Lexer *l)         { return l->source[l->pos] == '\0'; }

static void skip_whitespace_and_comments(Lexer *l) {
    while (!at_end(l)) {
        char c = peek(l);
        if (c == ' ' || c == '\t' || c == '\r') {
            l->pos++;
        } else if (c == '\n') {
            l->pos++;
            l->line++;
        } else if (c == '/' && l->source[l->pos + 1] == '/') {
            /* Line comment */
            l->pos += 2;
            while (!at_end(l) && peek(l) != '\n') l->pos++;
        } else if (c == '/' && l->source[l->pos + 1] == '*') {
            /* Block comment */
            l->pos += 2;
            while (!at_end(l)) {
                if (peek(l) == '\n') l->line++;
                if (peek(l) == '*' && l->source[l->pos + 1] == '/') {
                    l->pos += 2;
                    break;
                }
                l->pos++;
            }
        } else {
            break;
        }
    }
}

static Token make_token(Lexer *l, TokenType type, const char *val) {
    Token t;
    t.type    = type;
    t.line    = l->line;
    t.int_val = 0;
    strncpy(t.value, val, MAX_IDENT_LEN - 1);
    t.value[MAX_IDENT_LEN - 1] = '\0';
    return t;
}

static Token make_number(Lexer *l, int val) {
    Token t;
    t.type    = TOKEN_NUMBER;
    t.line    = l->line;
    t.int_val = val;
    snprintf(t.value, MAX_IDENT_LEN, "%d", val);
    return t;
}

static Token make_error(Lexer *l, const char *msg) {
    Token t;
    t.type    = TOKEN_ERROR;
    t.line    = l->line;
    t.int_val = 0;
    strncpy(t.value, msg, MAX_IDENT_LEN - 1);
    t.value[MAX_IDENT_LEN - 1] = '\0';
    return t;
}

/* ── Read next token ────────────────────────────────────── */
static Token scan_token(Lexer *l) {
    skip_whitespace_and_comments(l);

    if (at_end(l)) return make_token(l, TOKEN_EOF, "EOF");

    char c = advance_char(l);

    /* Single-char tokens */
    switch (c) {
        case '(': return make_token(l, TOKEN_LPAREN, "(");
        case ')': return make_token(l, TOKEN_RPAREN, ")");
        case '{': return make_token(l, TOKEN_LBRACE, "{");
        case '}': return make_token(l, TOKEN_RBRACE, "}");
        case ';': return make_token(l, TOKEN_SEMI,   ";");
        case ',': return make_token(l, TOKEN_COMMA,  ",");
        case '+': return make_token(l, TOKEN_PLUS,   "+");
        case '-': return make_token(l, TOKEN_MINUS,  "-");
        case '*': return make_token(l, TOKEN_STAR,   "*");
        case '/': return make_token(l, TOKEN_SLASH,  "/");
        case '%': return make_token(l, TOKEN_PERCENT,"%");
        default:  break;
    }

    /* Two-char operators */
    if (c == '=' && peek(l) == '=') { l->pos++; return make_token(l, TOKEN_EQ,  "=="); }
    if (c == '=')                   {            return make_token(l, TOKEN_ASSIGN,"="); }
    if (c == '!' && peek(l) == '=') { l->pos++; return make_token(l, TOKEN_NEQ, "!="); }
    if (c == '!')                   {            return make_token(l, TOKEN_NOT, "!"); }
    if (c == '<' && peek(l) == '=') { l->pos++; return make_token(l, TOKEN_LTE, "<="); }
    if (c == '<')                   {            return make_token(l, TOKEN_LT,  "<"); }
    if (c == '>' && peek(l) == '=') { l->pos++; return make_token(l, TOKEN_GTE, ">="); }
    if (c == '>')                   {            return make_token(l, TOKEN_GT,  ">"); }
    if (c == '&' && peek(l) == '&') { l->pos++; return make_token(l, TOKEN_AND, "&&"); }
    if (c == '|' && peek(l) == '|') { l->pos++; return make_token(l, TOKEN_OR,  "||"); }

    /* Number literal */
    if (isdigit(c)) {
        int val = c - '0';
        while (!at_end(l) && isdigit(peek(l))) {
            val = val * 10 + (advance_char(l) - '0');
        }
        return make_number(l, val);
    }

    /* Identifier or keyword */
    if (isalpha(c) || c == '_') {
        char buf[MAX_IDENT_LEN];
        int  len = 0;
        buf[len++] = c;
        while (!at_end(l) && (isalnum(peek(l)) || peek(l) == '_') && len < MAX_IDENT_LEN - 1) {
            buf[len++] = advance_char(l);
        }
        buf[len] = '\0';

        /* Check keywords */
        for (int i = 0; keywords[i].word != NULL; i++) {
            if (strcmp(buf, keywords[i].word) == 0)
                return make_token(l, keywords[i].type, buf);
        }
        return make_token(l, TOKEN_IDENT, buf);
    }

    return make_error(l, "unexpected character");
}

/* ── Public API ─────────────────────────────────────────── */
void lexer_init(Lexer *l, const char *source) {
    l->source = source;
    l->pos    = 0;
    l->line   = 1;
    lexer_advance(l);   /* prime the first token */
}

void lexer_advance(Lexer *l) {
    l->current = scan_token(l);
    if (l->current.type == TOKEN_ERROR) {
        error_exit(l->current.line, "%s", l->current.value);
    }
}

const char *token_type_name(TokenType t) {
    switch (t) {
        case TOKEN_INT:     return "int";
        case TOKEN_VOID:    return "void";
        case TOKEN_IF:      return "if";
        case TOKEN_ELSE:    return "else";
        case TOKEN_WHILE:   return "while";
        case TOKEN_FOR:     return "for";
        case TOKEN_RETURN:  return "return";
        case TOKEN_NUMBER:  return "number";
        case TOKEN_IDENT:   return "identifier";
        case TOKEN_PLUS:    return "+";
        case TOKEN_MINUS:   return "-";
        case TOKEN_STAR:    return "*";
        case TOKEN_SLASH:   return "/";
        case TOKEN_PERCENT: return "%";
        case TOKEN_ASSIGN:  return "=";
        case TOKEN_EQ:      return "==";
        case TOKEN_NEQ:     return "!=";
        case TOKEN_LT:      return "<";
        case TOKEN_GT:      return ">";
        case TOKEN_LTE:     return "<=";
        case TOKEN_GTE:     return ">=";
        case TOKEN_AND:     return "&&";
        case TOKEN_OR:      return "||";
        case TOKEN_NOT:     return "!";
        case TOKEN_LPAREN:  return "(";
        case TOKEN_RPAREN:  return ")";
        case TOKEN_LBRACE:  return "{";
        case TOKEN_RBRACE:  return "}";
        case TOKEN_SEMI:    return ";";
        case TOKEN_COMMA:   return ",";
        case TOKEN_EOF:     return "end of file";
        case TOKEN_ERROR:   return "error";
        default:            return "?";
    }
}
