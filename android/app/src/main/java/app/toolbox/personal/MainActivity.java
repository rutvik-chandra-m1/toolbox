package app.toolbox.personal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super: plugins are loaded in onCreate.
        registerPlugin(RichNotificationsPlugin.class);
        registerPlugin(ToolboxFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
