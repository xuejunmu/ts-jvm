public class Puppy extends Dog {
    Puppy(String n) {
        super(n);
    }

    @Override
    void bark() {
        System.out.println("汪汪汪");
    }

    public static void main(String[] args) {
        Dog d = new Puppy("豆豆");
        d.bark();
    }
}
