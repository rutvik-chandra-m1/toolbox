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
export function pickFile(acceptedTypes: readonly string[]): Promise<File | null> {
  // A second call replaces a chooser that was left open and never answered.
  pending?.cancel();

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptedTypes.join(',');
    input.style.display = 'none';

    const finish = (file: File | null) => {
      if (pending?.input === input) pending = null;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });

    pending = { input, cancel: () => finish(null) };
    // Must be in the document for some mobile WebViews to open the chooser.
    document.body.appendChild(input);
    input.click();
  });
}
