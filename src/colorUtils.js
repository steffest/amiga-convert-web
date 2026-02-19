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
 * Quantize a color channel value to 4-bit (12-bit total color)
 * Maps 8-bit values (0-255) to the nearest 4-bit equivalent (0, 17, 34, ... 255)
 * @param {number} value - Input value (0-255)
 * @returns {number} Quantized value (one of 16 possible values)
 */
export function quantize4bit(value) {
  return Math.floor(value / 17) * 17;
}
