interface Greeter {
    void greet(String name);
}

public class LambdaTest {
    public static void main(String[] args) {
        Greeter g = name -> System.out.println("Hi " + name);
        g.greet("钧沐");
    }
}
