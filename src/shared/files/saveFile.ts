import { sanitizeFilename } from './filename';
import { isNativePlatform } from './platform';

export interface SaveResult {
  /** `download`: a normal browser download. `share`: written to the app, then the Android share sheet opened. */
  method: 'download' | 'share';
  /** Android only: the `file://` URI of the copy that was written. */
  uri?: string;
}

/** The platform-specific parts, injectable so the branching can be tested. */
export interface SaveFileDeps {
  isNativePlatform: () => boolean;
  /** Browser: trigger a download. */
  download: (blob: Blob, filename: string) => void;
  /** Android: write the file, show the share sheet, return the file's URI. */
  saveAndShare: (blob: Blob, filename: string) => Promise<string>;
}

/**
 * Gives the user a file.
 *
 * - **Browser / PWA:** a normal download.
 * - **Android app:** blob downloads do not work inside the Capacitor WebView, so
 *   the file is written with the Filesystem plugin (app cache) and the Share
 *   plugin opens the system share sheet, from which the user can open it, save
 *   it to Drive/Files, or send it. The plugins are loaded only on Android.
 *
 * The platform is detected at runtime. The filename is sanitised.
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  deps: Partial<SaveFileDeps> = {},
): Promise<SaveResult> {
  const platform = { ...defaultDeps, ...deps };
  const safeName = sanitizeFilename(filename, 'download');

  if (platform.isNativePlatform()) {
    const uri = await platform.saveAndShare(blob, safeName);
    return { method: 'share', uri };
  }
  platform.download(blob, safeName);
  return { method: 'download' };
}

function downloadInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1)); // strip "data:...;base64,"
    };
    reader.readAsDataURL(blob);
  });
}

/** Dismissing the share sheet is not an error: the file was already written. */
function isShareCancelled(error: unknown): boolean {
  return /cancel/i.test(error instanceof Error ? error.message : String(error));
}

async function saveAndShareOnAndroid(blob: Blob, filename: string): Promise<string> {
  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });

  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: 'Open or share' });
  } catch (error) {
    if (!isShareCancelled(error)) throw error;
  }
  return uri;
}

const defaultDeps: SaveFileDeps = {
  isNativePlatform,
  download: downloadInBrowser,
  saveAndShare: saveAndShareOnAndroid,
};
