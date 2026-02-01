// Palette Adjuster - applies color adjustments to indexed PNG palettes

// State
let originalPalette = []; // Original palette from loaded PNG
let adjustedPalette = []; // Palette after adjustments
let indexedPixels = []; // Array of palette indices
let imageWidth = 0;
let imageHeight = 0;
let originalPngBytes = null; // Store original PNG for re-export

// Curves Editor (duplicated from app.js)
const curvesEditor = {
  canvas: null,
  ctx: null,
  currentChannel: "rgb",
  curves: {
    rgb: [
      [0, 0],
      [255, 255],
    ],
    red: [
      [0, 0],
      [255, 255],
    ],
    green: [
      [0, 0],
      [255, 255],
    ],
    blue: [
      [0, 0],
      [255, 255],
    ],
  },
  histogram: null,
  draggingPoint: null,
  selectedPoint: null,

  init() {
    this.canvas = document.getElementById("curvesCanvas");
    this.ctx = this.canvas.getContext("2d");

    // Mouse events
    this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    this.canvas.addEventListener("mouseup", () => this.onMouseUp());
    this.canvas.addEventListener("mouseleave", () => this.onMouseUp());
    this.canvas.addEventListener("dblclick", (e) => this.onDoubleClick(e));

    // Keyboard events for deleting selected point
    window.addEventListener("keydown", (e) => {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT");

      if (
        !isTyping &&
        (e.key === "Delete" || e.key === "Backspace") &&
        this.selectedPoint !== null
      ) {
        const curve = this.curves[this.currentChannel];
        if (this.selectedPoint > 0 && this.selectedPoint < curve.length - 1) {
          curve.splice(this.selectedPoint, 1);
          this.selectedPoint = null;
          this.draw();
          updatePreview();
          e.preventDefault();
        }
      }
    });

    // Channel selector
    document.querySelectorAll(".curves-channel-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".curves-channel-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentChannel = btn.dataset.channel;
        this.selectedPoint = null;
        this.draw();
      });
    });

    // Reset button
    document.getElementById("curvesReset").addEventListener("click", () => {
      this.curves.rgb = [
        [0, 0],
        [255, 255],
      ];
      this.curves.red = [
        [0, 0],
        [255, 255],
      ];
      this.curves.green = [
        [0, 0],
        [255, 255],
      ];
      this.curves.blue = [
        [0, 0],
        [255, 255],
      ];
      this.selectedPoint = null;
      this.draw();
      updatePreview();
    });

    this.draw();
  },

  calculateHistogram(palette) {
    // Create histogram from palette colors (not image pixels)
    const hist = {
      red: new Array(256).fill(0),
      green: new Array(256).fill(0),
      blue: new Array(256).fill(0),
      rgb: new Array(256).fill(0),
    };

    palette.forEach((color) => {
      hist.red[color.r]++;
      hist.green[color.g]++;
      hist.blue[color.b]++;
      const luma = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
      hist.rgb[luma]++;
    });

    // Normalize
    const maxR = Math.max(...hist.red) || 1;
    const maxG = Math.max(...hist.green) || 1;
    const maxB = Math.max(...hist.blue) || 1;
    const maxRGB = Math.max(...hist.rgb) || 1;

    hist.red = hist.red.map((v) => v / maxR);
    hist.green = hist.green.map((v) => v / maxG);
    hist.blue = hist.blue.map((v) => v / maxB);
    hist.rgb = hist.rgb.map((v) => v / maxRGB);

    this.histogram = hist;
    this.draw();
  },

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  },

  canvasToValue(x, y) {
    const padding = 20;
    const width = this.canvas.width - padding * 2;
    const height = this.canvas.height - padding * 2;
    return {
      input: Math.round(((x - padding) / width) * 255),
      output: Math.round(255 - ((y - padding) / height) * 255),
    };
  },

  valueToCanvas(input, output) {
    const padding = 20;
    const width = this.canvas.width - padding * 2;
    const height = this.canvas.height - padding * 2;
    return {
      x: padding + (input / 255) * width,
      y: padding + (1 - output / 255) * height,
    };
  },

  onMouseDown(e) {
    const pos = this.getMousePos(e);
    const curve = this.curves[this.currentChannel];

    for (let i = 0; i < curve.length; i++) {
      const p = this.valueToCanvas(curve[i][0], curve[i][1]);
      const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
      if (dist < 10) {
        this.draggingPoint = i;
        this.selectedPoint = i;
        this.draw();
        return;
      }
    }

    this.selectedPoint = null;

    const value = this.canvasToValue(pos.x, pos.y);
    if (
      value.input >= 0 &&
      value.input <= 255 &&
      value.output >= 0 &&
      value.output <= 255
    ) {
      curve.push([value.input, value.output]);
      curve.sort((a, b) => a[0] - b[0]);
      this.draggingPoint = curve.findIndex(
        (p) => p[0] === value.input && p[1] === value.output,
      );
      this.selectedPoint = this.draggingPoint;
      this.draw();
      updatePreview();
    }
  },

  onMouseMove(e) {
    if (this.draggingPoint === null) return;

    const curve = this.curves[this.currentChannel];
    const pos = this.getMousePos(e);
    const value = this.canvasToValue(pos.x, pos.y);

    value.input = Math.max(0, Math.min(255, value.input));
    value.output = Math.max(0, Math.min(255, value.output));

    curve[this.draggingPoint] = [value.input, value.output];
    curve.sort((a, b) => a[0] - b[0]);

    this.draggingPoint = curve.findIndex(
      (p) => p[0] === value.input && p[1] === value.output,
    );
    this.selectedPoint = this.draggingPoint;

    this.draw();
    updatePreview();
  },

  onMouseUp() {
    this.draggingPoint = null;
    updatePreview();
  },

  onDoubleClick(e) {
    const pos = this.getMousePos(e);
    const curve = this.curves[this.currentChannel];

    for (let i = 1; i < curve.length - 1; i++) {
      const p = this.valueToCanvas(curve[i][0], curve[i][1]);
      const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
      if (dist < 10) {
        curve.splice(i, 1);
        this.draw();
        updatePreview();
        return;
      }
    }
  },

  interpolateCurve(curve) {
    const lut = new Array(256);
    const startInput = curve[0][0];
    const endInput = curve[curve.length - 1][0];

    const tangents = [];
    for (let i = 0; i < curve.length; i++) {
      if (curve.length === 2) {
        const dx = curve[1][0] - curve[0][0];
        const dy = curve[1][1] - curve[0][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      } else if (i === 0) {
        const dx = curve[1][0] - curve[0][0];
        const dy = curve[1][1] - curve[0][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      } else if (i === curve.length - 1) {
        const dx = curve[i][0] - curve[i - 1][0];
        const dy = curve[i][1] - curve[i - 1][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      } else {
        const dx = curve[i + 1][0] - curve[i - 1][0];
        const dy = curve[i + 1][1] - curve[i - 1][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      }
    }

    for (let i = 0; i < 256; i++) {
      if (i < startInput) {
        lut[i] = curve[0][1];
        continue;
      }

      if (i > endInput) {
        lut[i] = curve[curve.length - 1][1];
        continue;
      }

      let segmentIdx = 0;
      for (let j = 0; j < curve.length - 1; j++) {
        if (curve[j][0] <= i && curve[j + 1][0] >= i) {
          segmentIdx = j;
          break;
        }
      }

      const p0 = curve[segmentIdx];
      const p1 = curve[segmentIdx + 1];
      const m0 = tangents[segmentIdx];
      const m1 = tangents[segmentIdx + 1];

      const dx = p1[0] - p0[0];

      if (dx === 0) {
        lut[i] = p0[1];
      } else if (curve.length === 2) {
        const t = (i - p0[0]) / dx;
        lut[i] = Math.round(p0[1] + t * (p1[1] - p0[1]));
      } else {
        const t = (i - p0[0]) / dx;
        const t2 = t * t;
        const t3 = t2 * t;

        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;

        lut[i] = Math.round(
          h00 * p0[1] + h10 * dx * m0 + h01 * p1[1] + h11 * dx * m1,
        );
      }

      lut[i] = Math.max(0, Math.min(255, lut[i]));
    }

    return lut;
  },

  draw() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const padding = 20;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    if (this.histogram) {
      const hist = this.histogram[this.currentChannel];
      ctx.globalAlpha = 0.3;

      if (this.currentChannel === "rgb") {
        ctx.fillStyle = "#ffffff";
      } else if (this.currentChannel === "red") {
        ctx.fillStyle = "#ff4a4a";
      } else if (this.currentChannel === "green") {
        ctx.fillStyle = "#4aff4a";
      } else {
        ctx.fillStyle = "#4a9eff";
      }

      for (let i = 0; i < 256; i++) {
        const x = padding + (i / 255) * graphWidth;
        const h = hist[i] * graphHeight * 0.8;
        ctx.fillRect(x, padding + graphHeight - h, graphWidth / 256, h);
      }

      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = padding + (i / 4) * graphWidth;
      const y = padding + (i / 4) * graphHeight;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + graphHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + graphWidth, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#404040";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, padding + graphHeight);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.currentChannel === "rgb") {
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;

      const redLut = this.interpolateCurve(this.curves.red);
      ctx.strokeStyle = "#ff4a4a";
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const pos = this.valueToCanvas(i, redLut[i]);
        if (i === 0) {
          ctx.moveTo(pos.x, pos.y);
        } else {
          ctx.lineTo(pos.x, pos.y);
        }
      }
      ctx.stroke();

      const greenLut = this.interpolateCurve(this.curves.green);
      ctx.strokeStyle = "#4aff4a";
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const pos = this.valueToCanvas(i, greenLut[i]);
        if (i === 0) {
          ctx.moveTo(pos.x, pos.y);
        } else {
          ctx.lineTo(pos.x, pos.y);
        }
      }
      ctx.stroke();

      const blueLut = this.interpolateCurve(this.curves.blue);
      ctx.strokeStyle = "#4a9eff";
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const pos = this.valueToCanvas(i, blueLut[i]);
        if (i === 0) {
          ctx.moveTo(pos.x, pos.y);
        } else {
          ctx.lineTo(pos.x, pos.y);
        }
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    const curve = this.curves[this.currentChannel];
    const lut = this.interpolateCurve(curve);

    if (this.currentChannel === "rgb") {
      ctx.strokeStyle = "#ffffff";
    } else if (this.currentChannel === "red") {
      ctx.strokeStyle = "#ff4a4a";
    } else if (this.currentChannel === "green") {
      ctx.strokeStyle = "#4aff4a";
    } else {
      ctx.strokeStyle = "#4a9eff";
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const pos = this.valueToCanvas(i, lut[i]);
      if (i === 0) {
        ctx.moveTo(pos.x, pos.y);
      } else {
        ctx.lineTo(pos.x, pos.y);
      }
    }
    ctx.stroke();

    for (let i = 0; i < curve.length; i++) {
      const point = curve[i];
      const pos = this.valueToCanvas(point[0], point[1]);
      const isSelected = i === this.selectedPoint;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#4a9eff" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },

  getCurvesLUTs() {
    return {
      rgb: this.interpolateCurve(this.curves.rgb),
      red: this.interpolateCurve(this.curves.red),
      green: this.interpolateCurve(this.curves.green),
      blue: this.interpolateCurve(this.curves.blue),
    };
  },
};

// Color conversion helpers
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r * 255, g * 255, b * 255];
}

// Apply adjustments to a single color
function adjustColor(r, g, b, luts, brightness, contrast, saturation, hue, gamma) {
  // Apply curves
  r = luts.red[luts.rgb[r]];
  g = luts.green[luts.rgb[g]];
  b = luts.blue[luts.rgb[b]];

  // Brightness
  const brightnessFactor = brightness / 100;
  r += brightnessFactor * 255;
  g += brightnessFactor * 255;
  b += brightnessFactor * 255;

  // Contrast
  const contrastFactor = (contrast + 100) / 100;
  r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
  g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
  b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;

  // Saturation
  const saturationFactor = (saturation + 100) / 100;
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  r = gray + (r - gray) * saturationFactor;
  g = gray + (g - gray) * saturationFactor;
  b = gray + (b - gray) * saturationFactor;

  // Hue shift
  if (hue !== 0) {
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    let [h, s, l] = rgbToHsl(r, g, b);
    h += hue / 360;
    if (h > 1) h -= 1;
    if (h < 0) h += 1;
    [r, g, b] = hslToRgb(h, s, l);
  }

  // Gamma
  r = Math.pow(Math.max(0, r) / 255, 1 / gamma) * 255;
  g = Math.pow(Math.max(0, g) / 255, 1 / gamma) * 255;
  b = Math.pow(Math.max(0, b) / 255, 1 / gamma) * 255;

  // Clamp
  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
  };
}

// Apply adjustments to entire palette
function applyPaletteAdjustments() {
  if (originalPalette.length === 0) return;

  const luts = curvesEditor.getCurvesLUTs();
  const brightness = parseInt(document.getElementById("brightness").value);
  const contrast = parseInt(document.getElementById("contrast").value);
  const saturation = parseInt(document.getElementById("saturation").value);
  const hue = parseInt(document.getElementById("hue").value);
  const gamma = parseFloat(document.getElementById("gamma").value);

  adjustedPalette = originalPalette.map((color) =>
    adjustColor(color.r, color.g, color.b, luts, brightness, contrast, saturation, hue, gamma)
  );
}

// Render image using adjusted palette
function renderWithAdjustedPalette() {
  if (indexedPixels.length === 0 || adjustedPalette.length === 0) return;

  const canvas = document.getElementById("previewCanvas");
  const ctx = canvas.getContext("2d");

  canvas.width = imageWidth;
  canvas.height = imageHeight;

  const imageData = ctx.createImageData(imageWidth, imageHeight);
  const data = imageData.data;

  for (let i = 0; i < indexedPixels.length; i++) {
    const colorIndex = indexedPixels[i];
    const color = adjustedPalette[colorIndex] || { r: 0, g: 0, b: 0 };
    const offset = i * 4;
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

// Update preview (called on any adjustment change)
function updatePreview() {
  applyPaletteAdjustments();
  renderWithAdjustedPalette();
  displayPalette();
}

// Display palette swatches
function displayPalette() {
  const container = document.getElementById("paletteDisplay");
  container.innerHTML = "";

  if (adjustedPalette.length === 0) return;

  adjustedPalette.forEach((color, index) => {
    const div = document.createElement("div");
    div.className = "palette-color";
    div.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;

    // Show original and adjusted color in tooltip
    const orig = originalPalette[index];
    const r4bit = Math.floor(color.r / 17).toString(16);
    const g4bit = Math.floor(color.g / 17).toString(16);
    const b4bit = Math.floor(color.b / 17).toString(16);
    div.dataset.rgb = `#${r4bit}${g4bit}${b4bit}`.toUpperCase();
    div.title = `Original: rgb(${orig.r}, ${orig.g}, ${orig.b})\nAdjusted: rgb(${color.r}, ${color.g}, ${color.b})`;

    container.appendChild(div);
  });
}

// PNG parsing and loading
function extractPLTEChunk(bytes) {
  let offset = 8; // Skip PNG signature

  while (offset < bytes.length) {
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    offset += 4;

    const type = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    offset += 4;

    if (type === "PLTE") {
      const palette = [];
      const numColors = length / 3;

      for (let i = 0; i < numColors; i++) {
        palette.push({
          r: bytes[offset + i * 3],
          g: bytes[offset + i * 3 + 1],
          b: bytes[offset + i * 3 + 2],
        });
      }

      return palette;
    }

    offset += length + 4; // Skip data and CRC

    if (type === "IEND") break;
  }

  return null;
}

function extractIHDR(bytes) {
  let offset = 8;

  while (offset < bytes.length) {
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    offset += 4;

    const type = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    offset += 4;

    if (type === "IHDR") {
      const width =
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3];
      const height =
        (bytes[offset + 4] << 24) |
        (bytes[offset + 5] << 16) |
        (bytes[offset + 6] << 8) |
        bytes[offset + 7];
      const bitDepth = bytes[offset + 8];
      const colorType = bytes[offset + 9];

      return { width, height, bitDepth, colorType };
    }

    offset += length + 4;

    if (type === "IEND") break;
  }

  return null;
}

async function loadIndexedPNG(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Validate PNG signature
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < pngSignature.length; i++) {
    if (bytes[i] !== pngSignature[i]) {
      alert("Invalid PNG file");
      return false;
    }
  }

  // Get IHDR info
  const ihdr = extractIHDR(bytes);
  if (!ihdr) {
    alert("Could not read PNG header");
    return false;
  }

  if (ihdr.colorType !== 3) {
    alert("This tool requires an indexed PNG (color type 3). The selected image is not indexed.");
    return false;
  }

  // Extract palette
  const palette = extractPLTEChunk(bytes);
  if (!palette || palette.length === 0) {
    alert("Could not find palette in PNG");
    return false;
  }

  // Store original PNG bytes for later
  originalPngBytes = bytes;

  // Load image to canvas to extract pixel indices
  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      // Draw to temp canvas
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = ihdr.width;
      tempCanvas.height = ihdr.height;
      const tempCtx = tempCanvas.getContext("2d");
      tempCtx.drawImage(img, 0, 0);

      // Get pixel data
      const imageData = tempCtx.getImageData(0, 0, ihdr.width, ihdr.height);
      const data = imageData.data;

      // Map pixels to palette indices
      const pixels = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Find matching palette entry
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let j = 0; j < palette.length; j++) {
          const dr = r - palette[j].r;
          const dg = g - palette[j].g;
          const db = b - palette[j].b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = j;
          }
          if (dist === 0) break; // Exact match
        }
        pixels.push(bestIdx);
      }

      // Store state
      originalPalette = palette;
      adjustedPalette = [...palette];
      indexedPixels = pixels;
      imageWidth = ihdr.width;
      imageHeight = ihdr.height;

      URL.revokeObjectURL(url);
      resolve(true);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Failed to load image");
      resolve(false);
    };

    img.src = url;
  });
}

// Create indexed PNG with adjusted palette
function createIndexedPNG(width, height, indexedData, palette) {
  function createChunk(type, data) {
    const len = data.length;
    const buf = new Uint8Array(len + 12);
    const view = new DataView(buf.buffer);

    view.setUint32(0, len);

    for (let i = 0; i < 4; i++) {
      buf[4 + i] = type.charCodeAt(i);
    }

    buf.set(data, 8);

    const crcData = buf.slice(4, 8 + len);
    const crc = crc32(crcData);
    view.setUint32(8 + len, crc);

    return buf;
  }

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

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // color type 3 = indexed
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const plte = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i].r;
    plte[i * 3 + 1] = palette[i].g;
    plte[i * 3 + 2] = palette[i].b;
  }

  const scanlineLength = width + 1;
  const scanlines = new Uint8Array(height * scanlineLength);
  for (let y = 0; y < height; y++) {
    scanlines[y * scanlineLength] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      scanlines[y * scanlineLength + 1 + x] = indexedData[y * width + x];
    }
  }

  const compressed = pako.deflate(scanlines);

  const iend = new Uint8Array(0);

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

// Export adjusted PNG
function exportAdjustedPNG() {
  if (indexedPixels.length === 0 || adjustedPalette.length === 0) {
    alert("No image loaded");
    return;
  }

  const pngData = createIndexedPNG(
    imageWidth,
    imageHeight,
    new Uint8Array(indexedPixels),
    adjustedPalette,
  );

  const blob = new Blob([pngData], { type: "image/png" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.download = "palette-adjusted.png";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

// Slider sync function
function setupSliderNumberSync(sliderId, numberId) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);

  if (!slider || !number) return;

  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);

  slider.addEventListener("input", () => {
    number.value = slider.value;
    number.style.borderColor = "";
    updatePreview();
  });

  number.addEventListener("input", () => {
    const value = parseFloat(number.value);

    if (isNaN(value) || value < min || value > max) {
      number.style.borderColor = "#ff4a4a";
    } else {
      number.style.borderColor = "";
      slider.value = number.value;
      updatePreview();
    }
  });

  number.addEventListener("blur", () => {
    const value = parseFloat(number.value);

    if (isNaN(value) || value < min || value > max) {
      number.value = slider.value;
      number.style.borderColor = "";
    }
  });
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // Initialize curves editor
  curvesEditor.init();

  // Setup slider syncs
  setupSliderNumberSync("brightness", "brightnessNumber");
  setupSliderNumberSync("contrast", "contrastNumber");
  setupSliderNumberSync("saturation", "saturationNumber");
  setupSliderNumberSync("hue", "hueNumber");
  setupSliderNumberSync("gamma", "gammaNumber");

  // Double-click to reset sliders
  const sliderDefaults = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    gamma: 1,
  };

  Object.entries(sliderDefaults).forEach(([sliderId, defaultValue]) => {
    const slider = document.getElementById(sliderId);
    const number = document.getElementById(sliderId + "Number");

    if (slider) {
      slider.addEventListener("dblclick", () => {
        slider.value = defaultValue;
        if (number) {
          number.value = defaultValue;
        }
        updatePreview();
      });
    }
  });

  // Collapsible sections
  document.querySelectorAll(".control-group h3").forEach((h3) => {
    h3.addEventListener("click", () => {
      const group = h3.parentElement;
      const content = group.querySelector(".control-group-content");

      if (group.classList.contains("collapsed")) {
        group.classList.remove("collapsed");
        content.style.maxHeight = content.scrollHeight + "px";
      } else {
        group.classList.add("collapsed");
        content.style.maxHeight = "0";
      }
    });

    const group = h3.parentElement;
    const content = group.querySelector(".control-group-content");
    if (content && !group.classList.contains("collapsed")) {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });

  // Reset all button
  document.getElementById("resetAllBtn").addEventListener("click", () => {
    // Reset sliders
    document.getElementById("brightness").value = 0;
    document.getElementById("brightnessNumber").value = 0;
    document.getElementById("contrast").value = 0;
    document.getElementById("contrastNumber").value = 0;
    document.getElementById("saturation").value = 0;
    document.getElementById("saturationNumber").value = 0;
    document.getElementById("hue").value = 0;
    document.getElementById("hueNumber").value = 0;
    document.getElementById("gamma").value = 1;
    document.getElementById("gammaNumber").value = 1;

    // Reset curves
    curvesEditor.curves.rgb = [
      [0, 0],
      [255, 255],
    ];
    curvesEditor.curves.red = [
      [0, 0],
      [255, 255],
    ];
    curvesEditor.curves.green = [
      [0, 0],
      [255, 255],
    ];
    curvesEditor.curves.blue = [
      [0, 0],
      [255, 255],
    ];
    curvesEditor.selectedPoint = null;
    curvesEditor.draw();

    updatePreview();
  });

  // File input handling
  const imageInput = document.getElementById("imageInput");
  const chooseImageBtn = document.getElementById("chooseImageBtn");
  const changeImageBtn = document.getElementById("changeImageBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const canvasDisplay = document.getElementById("canvasDisplay");
  const canvasGrid = document.getElementById("canvasGrid");
  const dropMessage = document.getElementById("dropMessage");

  chooseImageBtn.addEventListener("click", () => {
    imageInput.click();
  });

  changeImageBtn.addEventListener("click", () => {
    imageInput.click();
  });

  imageInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const success = await loadIndexedPNG(file);
    if (success) {
      canvasDisplay.classList.add("has-image");
      canvasGrid.style.display = "grid";
      dropMessage.style.display = "none";
      chooseImageBtn.style.display = "none";
      changeImageBtn.style.display = "block";
      downloadBtn.disabled = false;

      // Update histogram
      curvesEditor.calculateHistogram(originalPalette);

      updatePreview();
    }

    e.target.value = "";
  });

  // Drag and drop
  canvasDisplay.addEventListener("dragover", (e) => {
    e.preventDefault();
    canvasDisplay.classList.add("drag-over");
  });

  canvasDisplay.addEventListener("dragleave", () => {
    canvasDisplay.classList.remove("drag-over");
  });

  canvasDisplay.addEventListener("drop", async (e) => {
    e.preventDefault();
    canvasDisplay.classList.remove("drag-over");

    const file = e.dataTransfer.files[0];
    if (file && file.type === "image/png") {
      const success = await loadIndexedPNG(file);
      if (success) {
        canvasDisplay.classList.add("has-image");
        canvasGrid.style.display = "grid";
        dropMessage.style.display = "none";
        chooseImageBtn.style.display = "none";
        changeImageBtn.style.display = "block";
        downloadBtn.disabled = false;

        curvesEditor.calculateHistogram(originalPalette);
        updatePreview();
      }
    }
  });

  // Click on drop zone to choose image
  dropMessage.addEventListener("click", () => {
    imageInput.click();
  });

  // Download button
  downloadBtn.addEventListener("click", () => {
    exportAdjustedPNG();
  });

  // Zoom handling
  const zoomLevel = document.getElementById("zoomLevel");
  const previewWrapper = document.getElementById("previewWrapper");

  zoomLevel.addEventListener("change", () => {
    const zoom = zoomLevel.value;

    // Remove all zoom classes
    previewWrapper.classList.remove("zoom-fit", "zoom-1", "zoom-2", "zoom-4");

    if (zoom === "fit") {
      previewWrapper.classList.add("zoom-fit");
    } else {
      previewWrapper.classList.add(`zoom-${zoom}`);
    }
  });
});
