import { ToolboxFiles } from './fileWriter';
import { isNativePlatform } from './platform';

let release: (() => Promise<unknown>) | null = null;

/**
 * Stops the screen from turning off during long work: phones pause the app when
 * the screen goes dark. Call `keepScreenOn(false)` when the work ends.
 */
export async function keepScreenOn(on: boolean): Promise<void> {
  try {
    if (isNativePlatform()) {
      await ToolboxFiles.keepScreenOn({ on });
    } else if (on) {
      const lock = await navigator.wakeLock?.request('screen');
      release = lock ? () => lock.release() : null;
    } else {
      await release?.();
      release = null;
    }
  } catch (error) {
    // Only a convenience: the work itself can continue without it.
    console.warn(error);
  }
}
