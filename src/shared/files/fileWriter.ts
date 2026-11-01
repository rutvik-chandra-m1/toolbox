import { registerPlugin } from '@capacitor/core';
import { sanitizeFilename } from './filename';
import { isNativePlatform } from './platform';
import { blobToBase64, saveFile } from './saveFile';

/** A file the user now has. */
export interface SavedFile {
  /** The final name; it can differ from the one asked for (`name (1).pdf`). */
  name: string;
  size: number;
  /** Where it is, as a sentence for the user. */
  location: string;
  open: () => Promise<void>;
  share: () => Promise<void>;
}

/**
 * Builds a large file piece by piece, without keeping it in memory. Use this
 * instead of `saveFile` when a file can reach tens of megabytes: `saveFile` needs
 * the whole file as one base64 string, which can crash the Android WebView.
 */
export interface FileWriter {
  write: (bytes: Uint8Array) => Promise<void>;
  /** Finishes the file and hands it to the user. */
  save: () => Promise<SavedFile>;
  /** Deletes what was written so far. */
  discard: () => Promise<void>;
}

/** The app's own native plugin (android/app/src/main/java/app/toolbox/personal/ToolboxFilesPlugin.java). */
interface ToolboxFilesPlugin {
  publish(options: { uri: string; name: string; mimeType: string }): Promise<{ uri: string; name: string }>;
  open(options: { uri: string; mimeType: string }): Promise<void>;
  share(options: { uri: string; mimeType: string; title: string }): Promise<void>;
  keepScreenOn(options: { on: boolean }): Promise<void>;
}

export const ToolboxFiles = registerPlugin<ToolboxFilesPlugin>('ToolboxFiles');

/** Bytes sent over the Capacitor bridge at a time. */
const NATIVE_CHUNK = 3 * 1024 * 1024;

/**
 * **Browser:** parts are kept as Blobs (which the browser may hold on disk) and
 * the finished file is downloaded. **Android:** parts are appended to a file in the
 * app cache, which `save` moves to Downloads/Toolbox. If that fails (no storage
 * permission on Android 9 or older, a full disk), the file stays in the cache and
 * can still be opened and shared.
 */
export function createFileWriter(filename: string, mimeType: string): Promise<FileWriter> {
  const name = sanitizeFilename(filename, 'download');
  return isNativePlatform() ? createNativeWriter(name, mimeType) : Promise.resolve(createBrowserWriter(name, mimeType));
}

function createBrowserWriter(name: string, mimeType: string): FileWriter {
  const parts: Blob[] = [];

  return {
    async write(bytes) {
      parts.push(new Blob([bytes as BlobPart]));
    },
    async save() {
      const blob = new Blob(parts, { type: mimeType });
      await saveFile(blob, name);
      return {
        name,
        size: blob.size,
        location: 'Your browser has downloaded it. Check your Downloads if you cannot see it.',
        async open() {
          window.open(URL.createObjectURL(blob), '_blank', 'noopener');
        },
        async share() {
          const file = new File([blob], name, { type: mimeType });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: name }).catch((error: unknown) => {
              if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
            });
          } else {
            await saveFile(blob, name);
          }
        },
      };
    },
    async discard() {
      parts.length = 0;
    },
  };
}

async function createNativeWriter(name: string, mimeType: string): Promise<FileWriter> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem');
  const target = { path: name, directory: Directory.Cache };
  // A run that was killed halfway can leave its part behind.
  await Filesystem.deleteFile(target).catch(() => {});
  let size = 0;

  return {
    async write(bytes) {
      for (let start = 0; start < bytes.length; start += NATIVE_CHUNK) {
        const chunk = bytes.subarray(start, start + NATIVE_CHUNK);
        await Filesystem.appendFile({ ...target, data: await blobToBase64(new Blob([chunk as BlobPart])) });
      }
      size += bytes.length;
    },
    async save() {
      const { uri: cacheUri } = await Filesystem.getUri(target);
      let file = { uri: cacheUri, name };
      let location = 'Saved in Downloads/Toolbox.';
      try {
        file = await ToolboxFiles.publish({ ...file, mimeType });
        await Filesystem.deleteFile(target);
      } catch (error) {
        console.error(error);
        location = 'It could not be saved to Downloads, so it is only inside the app. Use Share to keep a copy.';
      }
      return {
        name: file.name,
        size,
        location,
        open: () => ToolboxFiles.open({ uri: file.uri, mimeType }),
        share: () => ToolboxFiles.share({ uri: file.uri, mimeType, title: file.name }),
      };
    },
    async discard() {
      await Filesystem.deleteFile(target).catch(() => {});
    },
  };
}
