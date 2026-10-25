package app.toolbox.personal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Alarms, notification buttons and the "phone restarted / clock changed" broadcasts all land here. */
public class RichReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        String key = intent.getStringExtra(RichNotifier.EXTRA_KEY);

        switch (action) {
            case RichNotifier.ACTION_FIRE:
                if (key != null) RichNotifier.onFire(context, key);
                break;
            case RichNotifier.ACTION_DELETED:
                if (key != null) RichNotifier.onDeleted(context, key);
                break;
            case RichNotifier.ACTION_SNOOZE:
                if (key != null) RichNotifier.snooze(context, key, intent.getIntExtra(RichNotifier.EXTRA_MINUTES, 60));
                break;
            case RichNotifier.ACTION_DISMISS:
                if (key != null) RichNotifier.dismiss(context, key);
                break;
            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
                RichNotifier.restoreAll(context, true);
                break;
            case Intent.ACTION_TIME_CHANGED:
            case Intent.ACTION_TIMEZONE_CHANGED:
                RichNotifier.restoreAll(context, false);
                break;
            default:
                break;
        }
    }
}
