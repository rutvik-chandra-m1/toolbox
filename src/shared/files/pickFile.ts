let pending: { input: HTMLInputElement; cancel: () => void } | null = null;

/**
 * Opens the system file chooser and resolves with the chosen file, or `null` if
 * the user cancelled. Works in browsers and inside the Android (Capacitor)
 * WebView, which shows the system document picker for file inputs.
 *
 * `acceptedTypes` takes extensions and MIME types, e.g.
 * `['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']`.
 * Listing both matters on Android, where pickers filter by MIME type. Treat it
 * as a hint: always validate the file you get back (users can pick "All files").
 *
 * Call it from a user gesture (a click handler); browsers block it otherwise.
 */
export async function pickFile(acceptedTypes: readonly string[]): Promise<File | null> {
  return (await openChooser(acceptedTypes))[0] ?? null;
}

export interface PickFilesOptions {
  /** Open the camera instead of the file chooser (phones; ignored on a laptop). */
  camera?: boolean;
}

/**
 * Like `pickFile`, but the user can choose several files at once. Resolves with
 * an empty list if they cancelled.
 */
export function pickFiles(acceptedTypes: readonly string[], { camera = false }: PickFilesOptions = {}): Promise<File[]> {
  return openChooser(acceptedTypes, (input) => {
    input.multiple = !camera;
    if (camera) input.setAttribute('capture', 'environment');
  });
}

function openChooser(acceptedTypes: readonly string[], configure?: (input: HTMLInputElement) => void): Promise<File[]> {
  // A second call replaces a chooser that was left open and never answered.
  pending?.cancel();

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptedTypes.join(',');
    input.style.display = 'none';
    configure?.(input);

    const finish = (files: File[]) => {
      if (pending?.input === input) pending = null;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => finish([]), { once: true });

    pending = { input, cancel: () => finish([]) };
    // Must be in the document for some mobile WebViews to open the chooser.
    document.body.appendChild(input);
    input.click();
  });
}
