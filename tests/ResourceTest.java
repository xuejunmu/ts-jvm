import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

public class ResourceTest {
    public static void main(String[] args) throws Exception {
        InputStream is = ResourceTest.class.getResourceAsStream("/test.txt");
        BufferedReader br = new BufferedReader(new InputStreamReader(is));
        String line;
        while ((line = br.readLine()) != null) {
            System.out.println(line);
        }
        br.close();
    }
}
