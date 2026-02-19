// File System Access API helpers

/**
 * Whether the browser supports the File System Access API
 * @type {boolean}
 */
export const supportsFileSystemAccess = 'showOpenFilePicker' in window;

/**
 * Open a file using the File System Access API with fallback to input element
 * @param {HTMLInputElement} inputElement - Hidden file input for fallback
 * @param {Array<{description: string, accept: Object}>} acceptTypes - File type filters
 * @returns {Promise<File|null>} The selected file, or null if cancelled/fallback used
 * @example
 * const file = await openFileWithPicker(input, [{
 *   description: 'Images',
 *   accept: { 'image/*': ['.png', '.jpg'] }
 * }]);
 */
export async function openFileWithPicker(inputElement, acceptTypes) {
  if (supportsFileSystemAccess) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: acceptTypes
      });
      return handle.getFile();
    } catch (e) {
      if (e.name === 'AbortError') return null; // User cancelled
      throw e;
    }
  }
  // Fallback: trigger hidden input
  inputElement.click();
  return null; // File handled by input's change event
}

/**
 * Save a blob to file using the File System Access API with fallback to download
 * @param {Blob} blob - The data to save
 * @param {string} suggestedName - Default filename
 * @param {Array<{description: string, accept: Object}>} [fileTypes] - File type filters (defaults to PNG)
 * @returns {Promise<void>}
 * @example
 * await saveFileWithPicker(pngBlob, 'image.png', [{
 *   description: 'PNG Image',
 *   accept: { 'image/png': ['.png'] }
 * }]);
 */
export async function saveFileWithPicker(blob, suggestedName, fileTypes) {
  // Default to PNG if no file types specified
  const types = fileTypes || [{
    description: 'PNG Image',
    accept: { 'image/png': ['.png'] }
  }];

  if (supportsFileSystemAccess) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // User cancelled
      throw e;
    }
  }
  // Fallback: download via link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = suggestedName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
