package app.toolbox.personal;

import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The notification engine behind the RichNotifications plugin: alarms, posting, and what the
 * notification's buttons do. It runs from broadcast receivers, so it works with the app closed.
 *
 * An entry (see RichNotificationsPlugin.schedule) is stored until it is cancelled; "shown" says
 * it is currently in the notification shade. Entries that share a notifId replace each other.
 */
final class RichNotifier {
    static final String ACTION_FIRE = "app.toolbox.personal.rich.FIRE";
    static final String ACTION_DELETED = "app.toolbox.personal.rich.DELETED";
    static final String ACTION_SNOOZE = "app.toolbox.personal.rich.SNOOZE";
    static final String ACTION_DISMISS = "app.toolbox.personal.rich.DISMISS";
    static final String ACTION_OPEN = "app.toolbox.personal.rich.OPEN";
    static final String EXTRA_KEY = "rich_key";
    static final String EXTRA_ROUTE = "rich_route";
    static final String EXTRA_MINUTES = "rich_minutes";

    private RichNotifier() {}

    private static void set(JSONObject entry, String name, Object value) {
        try {
            entry.put(name, value);
        } catch (JSONException ignored) {
            // put() only fails for a null name or a non-finite number, neither of which we pass
        }
    }

    private static String key(JSONObject entry) {
        return entry.optString("id");
    }

    /* ------------------------------ alarms ------------------------------ */

    private static PendingIntent firePending(Context context, String key, int flags) {
        Intent intent = new Intent(context, RichReceiver.class)
                .setAction(ACTION_FIRE)
                .setData(Uri.parse("richnotif://fire/" + Uri.encode(key)))
                .putExtra(EXTRA_KEY, key);
        return PendingIntent.getBroadcast(context, 0, intent, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    static void arm(Context context, JSONObject entry) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent pending = firePending(context, key(entry), PendingIntent.FLAG_UPDATE_CURRENT);
        long at = entry.optLong("at");
        try {
            // Without the "Alarms & reminders" permission an exact alarm is refused: fall back to a few minutes' slack.
            if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            }
        } catch (SecurityException e) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        }
    }

    private static void disarm(Context context, String key) {
        PendingIntent pending = firePending(context, key, PendingIntent.FLAG_NO_CREATE);
        if (pending != null) {
            context.getSystemService(AlarmManager.class).cancel(pending);
            pending.cancel();
        }
    }

    /* ----------------------------- operations ---------------------------- */

    static void schedule(Context context, JSONObject entry) {
        set(entry, "shown", false);
        RichStore.put(context, entry);
        arm(context, entry);
    }

    /** Cancels the alarm and, if it is showing, the notification. */
    static void cancel(Context context, String key) {
        JSONObject entry = RichStore.get(context, key);
        if (entry != null && entry.optBoolean("shown")) {
            NotificationManagerCompat.from(context).cancel(entry.optInt("notifId"));
        }
        RichStore.remove(context, key);
        disarm(context, key);
    }

    static void onFire(Context context, String key) {
        JSONObject entry = RichStore.get(context, key);
        if (entry == null) return; // cancelled in the meantime
        // A new notification replaces the one its slot is still showing: forget the old one.
        for (JSONObject other : RichStore.all(context)) {
            if (!key.equals(key(other)) && other.optBoolean("shown") && other.optInt("notifId") == entry.optInt("notifId")) {
                RichStore.remove(context, key(other));
            }
        }
        set(entry, "shown", true);
        RichStore.put(context, entry);
        show(context, entry, false);
    }

    /** The user swiped it away (Android 14+ lets them swipe even an ongoing notification). */
    static void onDeleted(Context context, String key) {
        JSONObject entry = RichStore.get(context, key);
        if (entry == null || !entry.optBoolean("shown")) return;
        if (entry.optBoolean("sticky")) show(context, entry, true);
        else RichStore.remove(context, key);
    }

    /** Hides it and shows it again after `minutes`. */
    static void snooze(Context context, String key, int minutes) {
        JSONObject entry = RichStore.get(context, key);
        if (entry == null) return;
        NotificationManagerCompat.from(context).cancel(entry.optInt("notifId"));
        set(entry, "shown", false);
        set(entry, "at", System.currentTimeMillis() + minutes * 60_000L);
        RichStore.put(context, entry);
        arm(context, entry);
        RichStore.addEvent(context, "snoozed", key);
    }

    /** Removes it for good; the app is told so it can react (for example by returning a lesson to its pool). */
    static void dismiss(Context context, String key) {
        cancel(context, key);
        RichStore.addEvent(context, "dismissed", key);
    }

    /**
     * Re-arms every alarm. After a reboot (`repost`) the notification shade is empty too, so sticky
     * notifications that were showing are posted again, and ones that came due while the phone was off are posted now.
     */
    static void restoreAll(Context context, boolean repost) {
        long now = System.currentTimeMillis();
        for (JSONObject entry : RichStore.all(context)) {
            if (entry.optBoolean("shown")) {
                if (!repost) continue;
                if (entry.optBoolean("sticky")) show(context, entry, true);
                else RichStore.remove(context, key(entry));
            } else if (entry.optLong("at") > now) {
                arm(context, entry);
            } else if (repost) {
                onFire(context, key(entry));
            }
        }
    }

    /* ------------------------------ posting ------------------------------ */

    private static PendingIntent open(Context context, String key, String route, String tag) {
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(ACTION_OPEN)
                .setData(Uri.parse("richnotif://open/" + tag + "/" + Uri.encode(key)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(EXTRA_KEY, key)
                .putExtra(EXTRA_ROUTE, route);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent broadcast(Context context, String action, String key, int minutes) {
        Intent intent = new Intent(context, RichReceiver.class)
                .setAction(action)
                .setData(Uri.parse("richnotif://" + action + "/" + Uri.encode(key)))
                .putExtra(EXTRA_KEY, key)
                .putExtra(EXTRA_MINUTES, minutes);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int iconResource(Context context, String name) {
        for (String candidate : new String[] {name, "ic_stat_notify"}) {
            if (candidate == null || candidate.isEmpty()) continue;
            int id = context.getResources().getIdentifier(candidate, "drawable", context.getPackageName());
            if (id != 0) return id;
        }
        return android.R.drawable.ic_popup_reminder;
    }

    /** Uri of a sound file in res/raw, or null if there is none (the channel then keeps the default sound). */
    private static Uri soundUri(Context context, String name) {
        if (name.isEmpty()) return null;
        int id = context.getResources().getIdentifier(name, "raw", context.getPackageName());
        return id == 0 ? null : Uri.parse("android.resource://" + context.getPackageName() + "/" + id);
    }

    /** The tool's own logo (a PNG in res/drawable-nodpi), shown instead of the app icon. */
    private static Bitmap logo(Context context, String name) {
        if (name.isEmpty()) return null;
        int id = context.getResources().getIdentifier(name, "drawable", context.getPackageName());
        return id == 0 ? null : BitmapFactory.decodeResource(context.getResources(), id);
    }

    private static void applyConversation(Context context, NotificationCompat.Builder builder, JSONObject entry, Bitmap logo) {
        String channelId = entry.optString("channelId");
        IconCompat icon = IconCompat.createWithBitmap(logo);
        Person sender = new Person.Builder().setName(entry.optString("title")).setIcon(icon).setKey(channelId).setImportant(true).build();
        String shortcutId = "conversation-" + channelId;
        try {
            // Android only treats a notification as a conversation when it is tied to a long-lived shortcut for the same person.
            ShortcutManagerCompat.pushDynamicShortcut(context, new ShortcutInfoCompat.Builder(context, shortcutId)
                    .setLongLived(true)
                    .setShortLabel(entry.optString("channelName"))
                    .setIcon(icon)
                    .setPerson(new Person.Builder().setName(entry.optString("channelName")).setIcon(icon).setKey(channelId).build())
                    .setIntent(new Intent(context, MainActivity.class).setAction(Intent.ACTION_MAIN))
                    .build());
            builder.setShortcutId(shortcutId);
        } catch (RuntimeException ignored) {
            // without the shortcut it is still a notification with the logo as its large icon
        }
        builder.addPerson(sender);
        builder.setStyle(new NotificationCompat.MessagingStyle(new Person.Builder().setName("You").build())
                .addMessage(entry.optString("body"), System.currentTimeMillis(), sender));
    }

    @SuppressLint("MissingPermission") // without the notification permission the system simply drops it
    private static void show(Context context, JSONObject entry, boolean quiet) {
        String key = key(entry);
        String route = entry.optString("route", "");
        boolean sticky = entry.optBoolean("sticky");

        Uri sound = soundUri(context, entry.optString("sound"));
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            // A channel's sound cannot be changed after it exists, so a new sound comes with a new channel id.
            JSONArray replaces = entry.optJSONArray("replaces");
            for (int i = 0; replaces != null && i < replaces.length(); i++) manager.deleteNotificationChannel(replaces.optString(i));

            NotificationChannel channel = new NotificationChannel(
                    entry.optString("channelId"), entry.optString("channelName"), NotificationManager.IMPORTANCE_HIGH);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            if (sound != null) {
                channel.setSound(sound, new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
            }
            manager.createNotificationChannel(channel);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, entry.optString("channelId"))
                .setSmallIcon(iconResource(context, entry.optString("icon")))
                .setContentTitle(entry.optString("title"))
                .setContentText(entry.optString("body"))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(sticky)
                .setAutoCancel(!sticky)
                .setSilent(quiet) // a re-post after a swipe must not buzz again
                .setContentIntent(open(context, key, route, "tap"))
                .setDeleteIntent(broadcast(context, ACTION_DELETED, key, 0));

        Bitmap logo = logo(context, entry.optString("logo"));
        if (logo != null) {
            builder.setLargeIcon(logo);
            // Recent Android versions put the app's own icon next to every notification. The only picture an app may put
            // there itself is a conversation's avatar, so a notification with a logo is posted as a one-person conversation.
            applyConversation(context, builder, entry, logo);
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(entry.optString("body")));
        }
        if (sound != null && Build.VERSION.SDK_INT < 26) builder.setSound(sound); // before channels, the sound belongs to the notification

        String color = entry.optString("color");
        if (!color.isEmpty()) {
            try {
                builder.setColor(Color.parseColor(color));
            } catch (IllegalArgumentException ignored) {
                // an unreadable colour just means the default one
            }
        }

        JSONArray actions = entry.optJSONArray("actions");
        for (int i = 0; actions != null && i < actions.length(); i++) {
            JSONObject action = actions.optJSONObject(i);
            if (action == null) continue;
            String kind = action.optString("kind");
            PendingIntent target;
            if ("open".equals(kind)) target = open(context, key, route, "action-" + action.optString("id"));
            else if ("snooze".equals(kind)) target = broadcast(context, ACTION_SNOOZE, key, action.optInt("minutes", 60));
            else target = broadcast(context, ACTION_DISMISS, key, 0);
            builder.addAction(0, action.optString("title"), target);
        }

        NotificationManagerCompat.from(context).notify(entry.optInt("notifId"), builder.build());
    }
}
