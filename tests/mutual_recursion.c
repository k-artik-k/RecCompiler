// Mutual recursion: is_even / is_odd
// Tests indirect recursion between two functions.

int is_odd(int n) {
    if (n == 0) return 0;
    return is_even(n - 1);
}

int is_even(int n) {
    if (n == 0) return 1;
    return is_odd(n - 1);
}

int main() {
    int n = scan();
    int even = is_even(n);
    if (even) {
        print(1);
    } else {
        print(0);
    }
    return 0;
}
