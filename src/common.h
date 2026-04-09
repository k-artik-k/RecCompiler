#ifndef COMMON_H
#define COMMON_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <stdbool.h>
#include <stdarg.h>

/* Limits */
#define MAX_SOURCE      65536
#define MAX_IDENT_LEN   64
#define MAX_LOCALS      256
#define MAX_FUNCTIONS   64
#define MAX_STACK       4096
#define MAX_FRAMES      256
#define MAX_CODE        65536
#define MAX_CHILDREN    256
#define MAX_PATCHES     512

/* Error reporting — prints message and exits */
static inline void error_exit(int line, const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    if (line > 0)
        fprintf(stderr, "[line %d] Error: ", line);
    else
        fprintf(stderr, "Error: ");
    vfprintf(stderr, fmt, args);
    fprintf(stderr, "\n");
    va_end(args);
    exit(1);
}

#endif /* COMMON_H */
