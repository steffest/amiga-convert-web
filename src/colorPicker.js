// Color Picker UI component

/**
 * @typedef {Object} ColorPickerInstance
 * @property {HTMLElement} container - Container element
 * @property {function(number, number, number): void} onChange - Color change callback
 * @property {number[]} hsv - Current color as [h, s, v] (0-1 range)
 * @property {HTMLCanvasElement} squareCanvas - Saturation/value picker canvas
 * @property {HTMLElement} squareCursor - Cursor element for square picker
 * @property {HTMLCanvasElement} hueCanvas - Hue strip canvas
 * @property {HTMLElement} hueCursor - Cursor element for hue strip
 * @property {HTMLElement|null} swatchesContainer - Container for color swatches
 * @property {HTMLInputElement|null} hexInput - Hex color input field
 * @property {HTMLElement|null} preview - Color preview element
 * @property {function(): void} drawSquare - Redraw the saturation/value square
 */

/**
 * Color Picker UI component for selecting 12-bit Amiga colors
 * Provides HSV-based color selection with saturation/value square and hue strip.
 * All colors are quantized to 12-bit (4 bits per channel).
 */
export const ColorPicker = {
  /**
   * Preset color swatches - 3 rows of 12-bit colors (3-digit hex)
   * @type {string[][]}
   */
  swatches: [
    ['444', '999', 'fff', 'f43', 'f90', 'fd0', 'dd0', 'ad0', '6cc', '7df', 'aaf', 'faf'],
    ['333', '888', 'ccc', 'd31', 'e70', 'fc0', 'bb0', '6b0', '1aa', '09e', '76f', 'f2f'],
    ['000', '666', 'bbb', '900', 'c50', 'f90', '880', '143', '077', '06b', '639', 'a19'],
  ],

  /**
   * Convert RGB values to HSV
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {number[]} HSV values as [h, s, v] (0-1 range)
   */
  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, v];
  },

  /**
   * Convert HSV values to RGB
   * @param {number} h - Hue (0-1)
   * @param {number} s - Saturation (0-1)
   * @param {number} v - Value (0-1)
   * @returns {number[]} RGB values as [r, g, b] (0-255)
   */
  hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  },

  /**
   * Quantize RGB to 12-bit color (4 bits per channel)
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {number[]} Quantized RGB as [r, g, b] (values: 0, 17, 34, ... 255)
   */
  quantize12bit(r, g, b) {
    const r4 = Math.floor(r / 17);
    const g4 = Math.floor(g / 17);
    const b4 = Math.floor(b / 17);
    return [r4 * 17, g4 * 17, b4 * 17];
  },

  /**
   * Parse hex color string to RGB values
   * @param {string} hex - Hex color (#RGB or #RRGGBB, # optional)
   * @returns {number[]|null} RGB as [r, g, b] or null if invalid
   */
  parseHex(hex) {
    hex = hex.replace('#', '').toUpperCase();
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16)
      ];
    } else if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
    return null;
  },

  /**
   * Convert RGB to 3-digit hex string (12-bit color)
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {string} Hex string like "#F0A"
   */
  rgbToHex3(r, g, b) {
    const r4 = Math.floor(r / 17).toString(16);
    const g4 = Math.floor(g / 17).toString(16);
    const b4 = Math.floor(b / 17).toString(16);
    return `#${r4}${g4}${b4}`.toUpperCase();
  },

  /**
   * Calculate perceived luminance
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {number} Luminance (0-255)
   */
  luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  },

  /**
   * Create a new color picker instance
   * @param {HTMLElement} container - Container element with picker structure
   * @param {function(number, number, number): void} onChange - Callback when color changes
   * @returns {ColorPickerInstance} The picker instance
   * @example
   * const picker = ColorPicker.create(
   *   document.getElementById('myPicker'),
   *   (r, g, b) => console.log(`Selected: rgb(${r}, ${g}, ${b})`)
   * );
   */
  create(container, onChange) {
    const picker = {
      container,
      onChange,
      hsv: [0, 1, 1],
      squareCanvas: container.querySelector('.picker-square'),
      squareCursor: container.querySelector('.picker-square-cursor'),
      hueCanvas: container.querySelector('.picker-hue'),
      hueCursor: container.querySelector('.picker-hue-cursor'),
      swatchesContainer: container.querySelector('.color-picker-swatches'),
      hexInput: container.querySelector('.color-picker-hex'),
      preview: container.querySelector('.color-picker-preview'),
    };

    // Initialize canvases
    this.initSquare(picker);
    this.initHue(picker);
    this.initSwatches(picker);
    this.initHexInput(picker);

    // Set initial color
    this.setColor(picker, [255, 255, 255]);

    return picker;
  },

  /**
   * Initialize the saturation/value square canvas
   * @param {ColorPickerInstance} picker - Picker instance
   * @private
   */
  initSquare(picker) {
    const canvas = picker.squareCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const drawSquare = () => {
      const imageData = ctx.createImageData(width, height);
      const [h] = picker.hsv;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const s = x / (width - 1);
          const v = 1 - y / (height - 1);
          let [r, g, b] = this.hsvToRgb(h, s, v);
          [r, g, b] = this.quantize12bit(r, g, b);
          const i = (y * width + x) * 4;
          imageData.data[i] = r;
          imageData.data[i + 1] = g;
          imageData.data[i + 2] = b;
          imageData.data[i + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    };

    picker.drawSquare = drawSquare;
    drawSquare();

    const handleMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      picker.hsv[1] = x;
      picker.hsv[2] = 1 - y;
      this.updateFromHsv(picker);
    };

    canvas.addEventListener('mousedown', (e) => {
      handleMove(e);
      const onMove = (e) => handleMove(e);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  /**
   * Initialize the hue strip canvas
   * @param {ColorPickerInstance} picker - Picker instance
   * @private
   */
  initHue(picker) {
    const canvas = picker.hueCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Draw hue strip once
    for (let y = 0; y < height; y++) {
      const h = y / (height - 1);
      const [r, g, b] = this.hsvToRgb(h, 1, 1);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(0, y, width, 1);
    }

    const handleMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      picker.hsv[0] = y;
      picker.drawSquare();
      this.updateFromHsv(picker);
    };

    canvas.addEventListener('mousedown', (e) => {
      handleMove(e);
      const onMove = (e) => handleMove(e);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  /**
   * Initialize the color swatches
   * @param {ColorPickerInstance} picker - Picker instance
   * @private
   */
  initSwatches(picker) {
    if (!picker.swatchesContainer) return;
    picker.swatchesContainer.innerHTML = '';
    this.swatches.flat().forEach(hex => {
      const [r, g, b] = this.parseHex(hex);
      const btn = document.createElement('button');
      btn.className = 'color-picker-swatch';
      btn.style.background = `rgb(${r}, ${g}, ${b})`;
      btn.addEventListener('click', () => {
        this.setColor(picker, [r, g, b]);
      });
      picker.swatchesContainer.appendChild(btn);
    });
  },

  /**
   * Initialize the hex input field
   * @param {ColorPickerInstance} picker - Picker instance
   * @private
   */
  initHexInput(picker) {
    if (!picker.hexInput) return;
    picker.hexInput.addEventListener('input', () => {
      const rgb = this.parseHex(picker.hexInput.value);
      if (rgb) {
        const [r, g, b] = this.quantize12bit(...rgb);
        picker.hsv = this.rgbToHsv(r, g, b);
        picker.drawSquare();
        this.updateCursors(picker);
        this.updatePreview(picker, r, g, b);
        picker.onChange(r, g, b);
      }
    });
  },

  /**
   * Set the picker to a specific color
   * @param {ColorPickerInstance} picker - Picker instance
   * @param {number[]} rgb - RGB color as [r, g, b]
   */
  setColor(picker, [r, g, b]) {
    [r, g, b] = this.quantize12bit(r, g, b);
    picker.hsv = this.rgbToHsv(r, g, b);
    picker.drawSquare();
    this.updateCursors(picker);
    this.updatePreview(picker, r, g, b);
    if (picker.hexInput) {
      picker.hexInput.value = this.rgbToHex3(r, g, b);
    }
    picker.onChange(r, g, b);
  },

  /**
   * Update color from current HSV values
   * @param {ColorPickerInstance} picker - Picker instance
   * @private
   */
  updateFromHsv(picker) {
    let [r, g, b] = this.hsvToRgb(...picker.hsv);
    [r, g, b] = this.quantize12bit(r, g, b);
    this.updateCursors(picker);
    this.updatePreview(picker, r, g, b);
    if (picker.hexInput) {
      picker.hexInput.value = this.rgbToHex3(r, g, b);
    }
    picker.onChange(r, g, b);
  },

  /**
   * Update cursor positions based on current HSV
   * @param {ColorPickerInstance} picker - Picker instance
   * @private
   */
  updateCursors(picker) {
    const [h, s, v] = picker.hsv;
    const [r, g, b] = this.hsvToRgb(h, s, v);

    // Square cursor
    const squareRect = picker.squareCanvas.getBoundingClientRect();
    picker.squareCursor.style.left = `${s * 100}%`;
    picker.squareCursor.style.top = `${(1 - v) * 100}%`;
    picker.squareCursor.classList.toggle('light', this.luminance(r, g, b) > 128);

    // Hue cursor
    picker.hueCursor.style.top = `${h * 100}%`;
  },

  /**
   * Update the color preview element
   * @param {ColorPickerInstance} picker - Picker instance
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @private
   */
  updatePreview(picker, r, g, b) {
    if (picker.preview) {
      picker.preview.style.background = `rgb(${r}, ${g}, ${b})`;
    }
  },
};
