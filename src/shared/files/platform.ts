import { Capacitor } from '@capacitor/core';

/** True inside the Android (Capacitor) app, false in a normal browser / installed PWA. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
