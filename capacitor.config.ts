import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.toolbox.personal',
  appName: 'Toolbox',
  // Output of `vite build --mode native` (see vite.config.ts).
  webDir: 'dist-android',
  plugins: {
    // Android 15+ draws edge-to-edge; this injects --safe-area-inset-* CSS
    // variables so the header can clear the status bar (see src/index.css).
    SystemBars: { insetsHandling: 'css' },
    // Notifier: white status-bar icon (res/drawable/ic_stat_notify.xml) tinted with the brand colour.
    LocalNotifications: { smallIcon: 'ic_stat_notify', iconColor: '#4f46e5' },
  },
};

export default config;
