public class Dog {
    String name;

    Dog(String n) {
        name = n;
    }

    void bark() {
        System.out.println(name);
    }

    public static void main(String[] args) {
        Dog d = new Dog("旺财");
        d.bark();
    }
}
