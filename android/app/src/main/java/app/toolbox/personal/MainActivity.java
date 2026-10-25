package app.toolbox.personal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RichNotificationsPlugin.class); // before super: plugins are loaded in onCreate
        super.onCreate(savedInstanceState);
    }
}
