// Palette display and interaction

import { rgbToHex, formatHex, getBitDepth } from './colorUtils.js';

/** @type {number|null} Interval ID for color flashing effect */
let flashInterval = null;
/** @type {number|null} Timeout ID for flash delay */
let flashTimeout = null;
/** @type {Uint8ClampedArray|null} Original preview data for restoring after flash */
let originalPreviewData = null;
/** @type {HTMLElement|null} Currently dragged palette item */
let draggedPaletteItem = null;
/** @type {Map<string, number>} Pixel count for each color in the palette */
let palettePixelCounts = new Map();

/**
 * @typedef {Object} PaletteColor
 * @property {number} r - Red channel (0-255)
 * @property {number} g - Green channel (0-255)
 * @property {number} b - Blue channel (0-255)
 */

/**
 * @typedef {Object} PaletteDisplayOptions
 * @property {function(): PaletteColor[]} getCurrentPalette - Get current palette array
 * @property {function(PaletteColor[]): void} setCurrentPalette - Set current palette
 * @property {function(): Set<string>} getLockedColors - Get set of locked color hex strings
 * @property {function(): void} convertImageCallback - Callback to trigger image reconversion
 */

/**
 * @typedef {Object} PaletteDisplay
 * @property {function(PaletteColor[]): void} displayPalette - Display a palette and count pixels
 * @property {function(): void} renderPaletteDisplay - Render the palette UI
 */

/**
 * Create a palette display manager for showing and interacting with color palettes
 * Features:
 * - Displays palette colors with pixel counts
 * - Click to lock/unlock colors
 * - Hover to flash pixels of that color in preview
 * - Drag and drop to reorder colors
 * - Shows locked colors not in current palette as disabled
 *
 * @param {PaletteDisplayOptions} options - Configuration options
 * @returns {PaletteDisplay} Palette display manager instance
 * @example
 * const paletteDisplay = createPaletteDisplay({
 *   getCurrentPalette: () => currentPalette,
 *   setCurrentPalette: (p) => { currentPalette = p; },
 *   getLockedColors: () => lockedColors,
 *   convertImageCallback: convertImage,
 * });
 */
export function createPaletteDisplay(options) {
  const {
    getCurrentPalette,
    setCurrentPalette,
    getLockedColors,
    convertImageCallback,
  } = options;

  const paletteDisplay = {
    /**
     * Display a palette and count pixels for each color
     * @param {PaletteColor[]} palette - Array of RGB colors
     */
    displayPalette(palette) {
      setCurrentPalette(palette);

      // Reset original preview data for flash effect
      originalPreviewData = null;

      // Count pixels for each color
      const previewCanvas = document.getElementById("previewCanvas");
      const ctx = previewCanvas.getContext("2d");
      const imageData = ctx.getImageData(
        0,
        0,
        previewCanvas.width,
        previewCanvas.height,
      );
      const data = imageData.data;

      // Build pixel count map by color
      palettePixelCounts.clear();
      for (let i = 0; i < palette.length; i++) {
        const c = palette[i];
        palettePixelCounts.set(rgbToHex(c.r, c.g, c.b), 0);
      }

      for (let i = 0; i < data.length; i += 4) {
        const hexColor = rgbToHex(data[i], data[i + 1], data[i + 2]);
        if (palettePixelCounts.has(hexColor)) {
          palettePixelCounts.set(hexColor, palettePixelCounts.get(hexColor) + 1);
        }
      }

      this.renderPaletteDisplay();
    },

    /**
     * Render the palette display UI with all colors and interactions
     */
    renderPaletteDisplay() {
      const paletteDisplayEl = document.getElementById("paletteDisplay");
      paletteDisplayEl.innerHTML = "";

      const currentPalette = getCurrentPalette();
      const lockedColors = getLockedColors();

      for (let i = 0; i < currentPalette.length; i++) {
        const color = currentPalette[i];
        const colorDiv = document.createElement("div");
        colorDiv.className = "palette-color";
        colorDiv.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
        colorDiv.dataset.index = i;

        // Convert to hex for internal storage (6-digit)
        const hexColor = rgbToHex(color.r, color.g, color.b);

        // Convert to appropriate format for tooltip based on bit depth
        const bitDepth = getBitDepth();
        const hexDisplay = formatHex(color.r, color.g, color.b, bitDepth);

        // Format pixel count with thousands separator
        const pixelCount = (palettePixelCounts.get(hexColor) || 0).toLocaleString();
        const tooltipText = `${hexDisplay} • ${pixelCount} px`;

        colorDiv.setAttribute("data-rgb", tooltipText);
        colorDiv.setAttribute("data-rgb-full", hexColor);

        // Check if this color is locked
        if (lockedColors.has(hexColor)) {
          colorDiv.classList.add("locked");
        }

        // Click to lock/unlock
        colorDiv.addEventListener("click", (e) => {
          e.stopPropagation();
          const wasLocked = lockedColors.has(hexColor);

          if (wasLocked) {
            lockedColors.delete(hexColor);
            // Reconvert to potentially remove this color
            if (window.sourceImage) {
              convertImageCallback();
            }
          } else {
            lockedColors.add(hexColor);
            // Just update the visual state
            colorDiv.classList.add("locked");
          }
        });

        // Hover to flash pixels of this color
        colorDiv.addEventListener("mouseenter", () => {
          // Clear any existing flash
          if (flashTimeout) clearTimeout(flashTimeout);
          if (flashInterval) clearInterval(flashInterval);

          // Start flashing after a short delay
          flashTimeout = setTimeout(() => {
            const previewCanvas = document.getElementById("previewCanvas");
            const slidePreviewCanvas =
              document.getElementById("slidePreviewCanvas");
            const viewMode = document.getElementById("viewMode").value;

            // Choose the appropriate canvas based on view mode
            let canvas;
            if (viewMode === "slide-reveal") {
              canvas = slidePreviewCanvas;
            } else {
              canvas = previewCanvas;
            }

            const ctx = canvas.getContext("2d");
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // Store original data if not already stored
            if (!originalPreviewData) {
              originalPreviewData = new Uint8ClampedArray(imageData.data);
            }

            const data = imageData.data;
            let flashOn = false;

            // Calculate flash color (lighter or darker)
            const brightness = (color.r + color.g + color.b) / 3;
            const shouldLighten = brightness < 200;
            const flashR = shouldLighten
              ? Math.min(255, color.r + 80)
              : Math.max(0, color.r - 80);
            const flashG = shouldLighten
              ? Math.min(255, color.g + 80)
              : Math.max(0, color.g - 80);
            const flashB = shouldLighten
              ? Math.min(255, color.b + 80)
              : Math.max(0, color.b - 80);

            flashInterval = setInterval(() => {
              flashOn = !flashOn;

              for (let j = 0; j < data.length; j += 4) {
                // Check if this pixel matches the palette color
                if (
                  originalPreviewData[j] === color.r &&
                  originalPreviewData[j + 1] === color.g &&
                  originalPreviewData[j + 2] === color.b
                ) {
                  if (flashOn) {
                    // Flash on: show brightened/darkened color
                    data[j] = flashR;
                    data[j + 1] = flashG;
                    data[j + 2] = flashB;
                  } else {
                    // Flash off: show original color
                    data[j] = color.r;
                    data[j + 1] = color.g;
                    data[j + 2] = color.b;
                  }
                }
              }

              ctx.putImageData(imageData, 0, 0);
            }, 200); // Flash every 200ms
          }, 300); // 300ms delay before starting
        });

        colorDiv.addEventListener("mouseleave", () => {
          // Stop flashing and restore original
          if (flashTimeout) {
            clearTimeout(flashTimeout);
            flashTimeout = null;
          }
          if (flashInterval) {
            clearInterval(flashInterval);
            flashInterval = null;
          }

          // Restore original image data
          if (originalPreviewData) {
            const previewCanvas = document.getElementById("previewCanvas");
            const slidePreviewCanvas =
              document.getElementById("slidePreviewCanvas");
            const viewMode = document.getElementById("viewMode").value;

            let canvas;
            if (viewMode === "slide-reveal") {
              canvas = slidePreviewCanvas;
            } else {
              canvas = previewCanvas;
            }

            const ctx = canvas.getContext("2d");
            const imageData = ctx.createImageData(canvas.width, canvas.height);
            imageData.data.set(originalPreviewData);
            ctx.putImageData(imageData, 0, 0);
          }
        });

        // Drag and drop for reordering
        colorDiv.draggable = true;

        colorDiv.addEventListener("dragstart", (e) => {
          draggedPaletteItem = colorDiv;
          colorDiv.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", i.toString());
        });

        colorDiv.addEventListener("dragend", () => {
          colorDiv.classList.remove("dragging");
          draggedPaletteItem = null;
          // Remove any lingering drag-over classes
          document.querySelectorAll(".palette-color.drag-over").forEach(el => {
            el.classList.remove("drag-over");
          });
        });

        colorDiv.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        });

        colorDiv.addEventListener("dragenter", (e) => {
          e.preventDefault();
          if (draggedPaletteItem && draggedPaletteItem !== colorDiv) {
            colorDiv.classList.add("drag-over");
          }
        });

        colorDiv.addEventListener("dragleave", () => {
          colorDiv.classList.remove("drag-over");
        });

        colorDiv.addEventListener("drop", (e) => {
          e.preventDefault();
          colorDiv.classList.remove("drag-over");

          if (!draggedPaletteItem || draggedPaletteItem === colorDiv) return;

          const fromIndex = parseInt(draggedPaletteItem.dataset.index);
          const toIndex = parseInt(colorDiv.dataset.index);

          if (fromIndex === toIndex) return;

          // Reorder the palette array
          const palette = getCurrentPalette();
          const [movedColor] = palette.splice(fromIndex, 1);
          palette.splice(toIndex, 0, movedColor);

          // Re-render the palette display with new order
          this.renderPaletteDisplay();
        });

        paletteDisplayEl.appendChild(colorDiv);
      }

      // Display locked colors that are not in the active palette (disabled state)
      const paletteColorSet = new Set(
        currentPalette.map((c) => rgbToHex(c.r, c.g, c.b)),
      );

      lockedColors.forEach((hexColor) => {
        // Skip if already in palette
        if (paletteColorSet.has(hexColor)) return;

        // This is a locked color not in the active palette - show as disabled
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);

        const colorDiv = document.createElement("div");
        colorDiv.className = "palette-color locked disabled";
        colorDiv.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

        // Convert to appropriate format for tooltip based on bit depth
        const bitDepth = getBitDepth();
        const hexDisplay = formatHex(r, g, b, bitDepth);

        const tooltipText = `${hexDisplay} • Not used (exceeds color count)`;
        colorDiv.setAttribute("data-rgb", tooltipText);
        colorDiv.setAttribute("data-rgb-full", hexColor);

        // Click to unlock (removing from locked set)
        colorDiv.addEventListener("click", (e) => {
          e.stopPropagation();
          lockedColors.delete(hexColor);
          if (window.sourceImage) {
            convertImageCallback();
          }
        });

        paletteDisplayEl.appendChild(colorDiv);
      });
    },
  };

  return paletteDisplay;
}
