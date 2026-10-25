package app.toolbox.personal;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Persists the scheduled notifications (so their alarms can be re-armed after a reboot) and the
 * button presses the app has not read yet. Everything is plain JSON in SharedPreferences.
 */
final class RichStore {
    private static final String PREFS = "rich_notifications";
    private static final String ENTRIES = "entries";
    private static final String EVENTS = "events";

    private RichStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject read(Context context) {
        try {
            return new JSONObject(prefs(context).getString(ENTRIES, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void write(Context context, JSONObject all) {
        prefs(context).edit().putString(ENTRIES, all.toString()).apply();
    }

    static synchronized JSONObject get(Context context, String key) {
        return read(context).optJSONObject(key);
    }

    static synchronized void put(Context context, JSONObject entry) {
        try {
            JSONObject all = read(context);
            all.put(entry.getString("id"), entry);
            write(context, all);
        } catch (JSONException ignored) {
            // an entry without an id cannot be stored
        }
    }

    static synchronized void remove(Context context, String key) {
        JSONObject all = read(context);
        all.remove(key);
        write(context, all);
    }

    static synchronized List<JSONObject> all(Context context) {
        JSONObject all = read(context);
        List<JSONObject> list = new ArrayList<>();
        for (Iterator<String> keys = all.keys(); keys.hasNext(); ) {
            JSONObject entry = all.optJSONObject(keys.next());
            if (entry != null) list.add(entry);
        }
        return list;
    }

    static synchronized void addEvent(Context context, String type, String id) {
        try {
            JSONArray events = new JSONArray(prefs(context).getString(EVENTS, "[]"));
            events.put(new JSONObject().put("type", type).put("id", id).put("at", System.currentTimeMillis()));
            prefs(context).edit().putString(EVENTS, events.toString()).apply();
        } catch (JSONException ignored) {
            // an event we cannot record is not worth crashing a notification button for
        }
    }

    /** Returns the recorded events once, then forgets them. */
    static synchronized JSONArray takeEvents(Context context) {
        JSONArray events;
        try {
            events = new JSONArray(prefs(context).getString(EVENTS, "[]"));
        } catch (JSONException e) {
            events = new JSONArray();
        }
        prefs(context).edit().remove(EVENTS).apply();
        return events;
    }
}
