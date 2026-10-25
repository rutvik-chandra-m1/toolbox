package app.toolbox.personal;

import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Notifications that stay (ongoing), come back when swiped away, and have buttons that act without
 * opening the app. Used through src/shared/notifications (never directly by a tool). Permission and
 * exact-alarm questions are answered by @capacitor/local-notifications, which shares the app.
 */
@CapacitorPlugin(name = "RichNotifications")
public class RichNotificationsPlugin extends Plugin {
    @Override
    public void load() {
        // Alarms are lost when the app is force-stopped; the app being open again is the moment to re-arm them.
        RichNotifier.restoreAll(getContext(), false);
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    /** A tap on the notification or on "Read now": clear it and tell the web app which screen to open. */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String key = intent.getStringExtra(RichNotifier.EXTRA_KEY);
        if (key == null) return;
        String route = intent.getStringExtra(RichNotifier.EXTRA_ROUTE);
        intent.removeExtra(RichNotifier.EXTRA_KEY); // an activity restart must not replay it
        RichNotifier.cancel(getContext(), key);

        JSObject data = new JSObject();
        data.put("id", key);
        data.put("route", route);
        notifyListeners("notificationOpened", data, true); // retained until the web app is listening (cold start)
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            RichNotifier.schedule(getContext(), new JSONObject(call.getData().toString()));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not schedule the notification: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("id is required");
            return;
        }
        RichNotifier.cancel(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        Context context = getContext();
        JSArray list = new JSArray();
        for (JSONObject entry : RichStore.all(context)) {
            if (entry.optBoolean("shown")) continue;
            JSObject item = new JSObject();
            item.put("id", entry.optString("id"));
            item.put("title", entry.optString("title"));
            item.put("body", entry.optString("body"));
            item.put("at", entry.optLong("at"));
            item.put("channelId", entry.optString("channelId"));
            list.put(item);
        }
        JSObject result = new JSObject();
        result.put("notifications", list);
        call.resolve(result);
    }

    @PluginMethod
    public void takeEvents(PluginCall call) {
        JSObject result = new JSObject();
        result.put("events", RichStore.takeEvents(getContext()));
        call.resolve(result);
    }
}
