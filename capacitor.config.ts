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
  },
};

export default config;
