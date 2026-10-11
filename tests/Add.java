public class Add {
    static int add(int a, int b) {
        return a + b;
    }

    static int square(int x) {
        return x * x;
    }

    public static void main(String[] args) {
        int r1 = add(3, 4);
        System.out.println(r1);
        int r2 = square(5);
        System.out.println(r2);
    }
}
