import java.lang.reflect.Method;

class Greeter {
    public void greet(String name) {
        System.out.println("你好，" + name + "！");
    }
}

public class ReflectionTest {
    public static void main(String[] args) throws Exception {
        Class<?> cls = Class.forName("Greeter");
        Object obj = cls.getDeclaredConstructor().newInstance();
        Method m = cls.getMethod("greet", String.class);
        m.invoke(obj, "钧沐");
    }
}
