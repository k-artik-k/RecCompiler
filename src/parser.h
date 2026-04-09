#ifndef PARSER_H
#define PARSER_H

#include "ast.h"
#include "lexer.h"

/* Parse a complete program (list of function definitions) */
ASTNode *parser_parse(Lexer *l);

#endif /* PARSER_H */
