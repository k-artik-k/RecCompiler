// Recursive fibonacci (tree recursion)
int fib(int n) {
    if (n <= 0) return 0;
    if (n == 1) return 1;
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int n = scan();
    int i = 0;
    for (i = 0; i < n; i = i + 1) {
        print(fib(i));
    }
    return 0;
}
