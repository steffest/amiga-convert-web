// Color utility functions - pure color math

/**
 * Convert RGB values to uppercase hex string
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @returns {string} Hex color string in format #RRGGBB
 */
export function rgbToHex(r, g, b) {
  const hexR = r.toString(16).padStart(2, "0");
  const hexG = g.toString(16).padStart(2, "0");
  const hexB = b.toString(16).padStart(2, "0");
  return `#${hexR}${hexG}${hexB}`.toUpperCase();
}

/**
 * Quantize a color channel value based on bit depth
 * @param {number} value - Input value (0-255)
 * @param {number} bitDepth - Bit depth (9, 12, or 24)
 * @returns {number} Quantized value
 */
export function quantizeColor(value, bitDepth) {
  if (bitDepth === 24) return value;
  if (bitDepth === 9) {
    // 3 bits per channel = 8 levels (0-7)
    return Math.round(value * 7 / 255) * 255 / 7;
  }
  // 12-bit: 4 bits per channel = 16 levels (0-15)
  return Math.round(value / 17) * 17;
}

/**
 * Quantize a color channel value to 4-bit (12-bit total color)
 * Maps 8-bit values (0-255) to the nearest 4-bit equivalent (0, 17, 34, ... 255)
 * @param {number} value - Input value (0-255)
 * @returns {number} Quantized value (one of 16 possible values)
 * @deprecated Use quantizeColor(value, 12) instead
 */
export function quantize4bit(value) {
  return Math.round(value / 17) * 17;
}

/**
 * Format RGB values as hex string based on bit depth
 * @param {number} r - Red channel (0-255, should be pre-quantized)
 * @param {number} g - Green channel (0-255, should be pre-quantized)
 * @param {number} b - Blue channel (0-255, should be pre-quantized)
 * @param {number} bitDepth - Bit depth (9, 12, or 24)
 * @returns {string} Hex string (#RGB for 9/12-bit, #RRGGBB for 24-bit)
 */
export function formatHex(r, g, b, bitDepth) {
  if (bitDepth === 24) {
    return rgbToHex(r, g, b);
  }
  if (bitDepth === 9) {
    // 3 bits per channel: values 0-7
    const r3 = Math.round(r * 7 / 255);
    const g3 = Math.round(g * 7 / 255);
    const b3 = Math.round(b * 7 / 255);
    return `#${r3}${g3}${b3}`;
  }
  // 12-bit: 4 bits per channel, single hex digit each
  const r4 = Math.round(r / 17).toString(16);
  const g4 = Math.round(g / 17).toString(16);
  const b4 = Math.round(b / 17).toString(16);
  return `#${r4}${g4}${b4}`.toUpperCase();
}

/**
 * Get the current bit depth from DOM
 * @returns {number} Bit depth (9, 12, or 24)
 */
export function getBitDepth() {
  const el = document.getElementById("bitDepth");
  return el ? parseInt(el.value) : 12;
}
