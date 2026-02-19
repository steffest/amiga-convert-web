// Indexed PNG export functionality

/**
 * Calculate CRC32 checksum for PNG chunk validation
 * @param {Uint8Array} data - Input data
 * @returns {number} CRC32 checksum
 * @private
 */
function crc32(data) {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = crc ^ data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return crc ^ -1;
}

/**
 * Create a PNG chunk with type, data, and CRC
 * @param {string} type - 4-character chunk type (e.g., 'IHDR', 'PLTE', 'IDAT')
 * @param {Uint8Array} data - Chunk data
 * @returns {Uint8Array} Complete chunk including length, type, data, and CRC
 * @private
 */
function createChunk(type, data) {
  const len = data.length;
  const buf = new Uint8Array(len + 12);
  const view = new DataView(buf.buffer);

  // Length
  view.setUint32(0, len);

  // Type
  for (let i = 0; i < 4; i++) {
    buf[4 + i] = type.charCodeAt(i);
  }

  // Data
  buf.set(data, 8);

  // CRC
  const crcData = buf.slice(4, 8 + len);
  const crc = crc32(crcData);
  view.setUint32(8 + len, crc);

  return buf;
}

/**
 * @typedef {Object} PaletteColor
 * @property {number} r - Red channel (0-255)
 * @property {number} g - Green channel (0-255)
 * @property {number} b - Blue channel (0-255)
 */

/**
 * Create an indexed PNG file with a color palette
 * Uses 8-bit indexed color (color type 3) with up to 256 colors
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {Uint8Array} indexedData - Pixel data as palette indices (0-255)
 * @param {PaletteColor[]} palette - Array of RGB colors
 * @returns {Uint8Array} Complete PNG file as byte array
 * @example
 * const png = createIndexedPNG(320, 200, pixelIndices, [
 *   { r: 0, g: 0, b: 0 },
 *   { r: 255, g: 255, b: 255 }
 * ]);
 * const blob = new Blob([png], { type: 'image/png' });
 */
export function createIndexedPNG(width, height, indexedData, palette) {
  // PNG signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // color type 3 = indexed
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // PLTE chunk
  const plte = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i].r;
    plte[i * 3 + 1] = palette[i].g;
    plte[i * 3 + 2] = palette[i].b;
  }

  // IDAT chunk - prepare scanlines with filter byte
  const scanlineLength = width + 1; // +1 for filter byte
  const scanlines = new Uint8Array(height * scanlineLength);
  for (let y = 0; y < height; y++) {
    scanlines[y * scanlineLength] = 0; // filter type 0 (none)
    for (let x = 0; x < width; x++) {
      scanlines[y * scanlineLength + 1 + x] = indexedData[y * width + x];
    }
  }

  // Compress with pako (must be available globally)
  const compressed = pako.deflate(scanlines);

  // IEND chunk (empty)
  const iend = new Uint8Array(0);

  // Combine all chunks
  const ihdrChunk = createChunk("IHDR", ihdr);
  const plteChunk = createChunk("PLTE", plte);
  const idatChunk = createChunk("IDAT", compressed);
  const iendChunk = createChunk("IEND", iend);

  const totalLength =
    signature.length +
    ihdrChunk.length +
    plteChunk.length +
    idatChunk.length +
    iendChunk.length;
  const png = new Uint8Array(totalLength);

  let offset = 0;
  png.set(signature, offset);
  offset += signature.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(plteChunk, offset);
  offset += plteChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);

  return png;
}
