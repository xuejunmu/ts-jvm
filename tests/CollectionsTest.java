import java.util.ArrayList;
import java.util.HashMap;

public class CollectionsTest {
    public static void main(String[] args) {
        ArrayList<String> list = new ArrayList<>();
        list.add("你好");
        list.add("ts-JVM");
        list.add("钧沐最棒");
        System.out.println("列表大小: " + list.size());
        System.out.println("第0个: " + list.get(0));
        System.out.println("第2个: " + list.get(2));

        HashMap<String, Integer> map = new HashMap<>();
        map.put("苹果", 5);
        map.put("香蕉", 3);
        System.out.println("苹果数量: " + map.get("苹果"));
        System.out.println("HashMap大小: " + map.size());
    }
}
