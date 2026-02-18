// File System Access API helpers
const supportsFileSystemAccess = 'showOpenFilePicker' in window;

async function openFileWithPicker(inputElement, acceptTypes) {
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

async function saveFileWithPicker(blob, suggestedName, fileTypes) {
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

// Curves Editor
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
      // Ignore if typing in an input field
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
        // Don't delete first or last point (anchors)
        if (this.selectedPoint > 0 && this.selectedPoint < curve.length - 1) {
          curve.splice(this.selectedPoint, 1);
          this.selectedPoint = null;
          this.draw();
          convertImage();
          e.preventDefault(); // Prevent browser back navigation on Backspace
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
        this.selectedPoint = null; // Clear selection when switching channels
        this.draw();
      });
    });

    // Reset button - resets all curves
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
      convertImage(); // Real-time update
    });

    // Draw initial state
    this.draw();
  },

  calculateHistogram(imageData) {
    const data = imageData.data;
    const hist = {
      red: new Array(256).fill(0),
      green: new Array(256).fill(0),
      blue: new Array(256).fill(0),
      rgb: new Array(256).fill(0),
    };

    for (let i = 0; i < data.length; i += 4) {
      hist.red[data[i]]++;
      hist.green[data[i + 1]]++;
      hist.blue[data[i + 2]]++;
      const luma = Math.round(
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
      );
      hist.rgb[luma]++;
    }

    // Normalize
    const maxR = Math.max(...hist.red);
    const maxG = Math.max(...hist.green);
    const maxB = Math.max(...hist.blue);
    const maxRGB = Math.max(...hist.rgb);

    hist.red = hist.red.map((v) => v / maxR);
    hist.green = hist.green.map((v) => v / maxG);
    hist.blue = hist.blue.map((v) => v / maxB);
    hist.rgb = hist.rgb.map((v) => v / maxRGB);

    this.histogram = hist;

    // Redraw to show histogram
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

    // Check if clicking near existing point
    for (let i = 0; i < curve.length; i++) {
      const p = this.valueToCanvas(curve[i][0], curve[i][1]);
      const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
      if (dist < 10) {
        this.draggingPoint = i;
        this.selectedPoint = i;
        this.draw(); // Redraw to show selection
        return;
      }
    }

    // Deselect if clicking elsewhere
    this.selectedPoint = null;

    // Add new point
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
      this.selectedPoint = this.draggingPoint; // Select newly created point
      this.draw();
      convertImage(); // Real-time update
    }
  },

  onMouseMove(e) {
    if (this.draggingPoint === null) return;

    const curve = this.curves[this.currentChannel];
    const pos = this.getMousePos(e);
    const value = this.canvasToValue(pos.x, pos.y);

    // Clamp values
    value.input = Math.max(0, Math.min(255, value.input));
    value.output = Math.max(0, Math.min(255, value.output));

    curve[this.draggingPoint] = [value.input, value.output];

    // Sort to maintain order
    curve.sort((a, b) => a[0] - b[0]);

    // Update dragging point index after sort
    this.draggingPoint = curve.findIndex(
      (p) => p[0] === value.input && p[1] === value.output,
    );
    this.selectedPoint = this.draggingPoint; // Keep selection in sync

    this.draw();
    convertImage(); // Immediate, pending logic handles rapid calls
  },

  onMouseUp() {
    this.draggingPoint = null;
    convertImage(); // Final update when released
  },

  onDoubleClick(e) {
    const pos = this.getMousePos(e);
    const curve = this.curves[this.currentChannel];

    // Check if clicking near existing point (not first or last)
    for (let i = 1; i < curve.length - 1; i++) {
      const p = this.valueToCanvas(curve[i][0], curve[i][1]);
      const dist = Math.sqrt((pos.x - p.x) ** 2 + (pos.y - p.y) ** 2);
      if (dist < 10) {
        curve.splice(i, 1);
        this.draw();
        convertImage(); // Real-time update
        return;
      }
    }
  },

  interpolateCurve(curve) {
    const lut = new Array(256);

    // Get the actual input range from the curve endpoints
    const startInput = curve[0][0];
    const endInput = curve[curve.length - 1][0];

    // Calculate tangents using Catmull-Rom method (like Photoshop)
    const tangents = [];
    for (let i = 0; i < curve.length; i++) {
      if (curve.length === 2) {
        // For 2 points, linear interpolation
        const dx = curve[1][0] - curve[0][0];
        const dy = curve[1][1] - curve[0][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      } else if (i === 0) {
        // First point: use Catmull-Rom end condition
        const dx = curve[1][0] - curve[0][0];
        const dy = curve[1][1] - curve[0][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      } else if (i === curve.length - 1) {
        // Last point: use Catmull-Rom end condition
        const dx = curve[i][0] - curve[i - 1][0];
        const dy = curve[i][1] - curve[i - 1][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      } else {
        // Interior points: standard Catmull-Rom tangent
        // m = (p[i+1] - p[i-1]) / (x[i+1] - x[i-1])
        const dx = curve[i + 1][0] - curve[i - 1][0];
        const dy = curve[i + 1][1] - curve[i - 1][1];
        tangents.push(dx === 0 ? 0 : dy / dx);
      }
    }

    for (let i = 0; i < 256; i++) {
      // Handle values before the first point (black point)
      if (i < startInput) {
        lut[i] = curve[0][1];
        continue;
      }

      // Handle values after the last point (white point)
      if (i > endInput) {
        lut[i] = curve[curve.length - 1][1];
        continue;
      }

      // Find the segment this input falls into
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
        // Linear interpolation for just 2 points
        const t = (i - p0[0]) / dx;
        lut[i] = Math.round(p0[1] + t * (p1[1] - p0[1]));
      } else {
        // Cubic Hermite interpolation for smooth curves
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

    // Clear
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    // Draw histogram if available
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

    // Draw grid
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

    // Draw diagonal reference line
    ctx.strokeStyle = "#404040";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, padding + graphHeight);
    ctx.lineTo(padding + graphWidth, padding);
    ctx.stroke();
    ctx.setLineDash([]);

    // When in RGB mode, draw the R, G, B curves in the background
    if (this.currentChannel === "rgb") {
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.5;

      // Draw red curve
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

      // Draw green curve
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

      // Draw blue curve
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

    // Draw curve
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

    // Draw control points
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

  applyCurves(imageData) {
    const data = imageData.data;
    const rgbLut = this.interpolateCurve(this.curves.rgb);
    const redLut = this.interpolateCurve(this.curves.red);
    const greenLut = this.interpolateCurve(this.curves.green);
    const blueLut = this.interpolateCurve(this.curves.blue);

    for (let i = 0; i < data.length; i += 4) {
      data[i] = redLut[rgbLut[data[i]]];
      data[i + 1] = greenLut[rgbLut[data[i + 1]]];
      data[i + 2] = blueLut[rgbLut[data[i + 2]]];
    }

    return imageData;
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

// Quantize to 4-bit per channel (12-bit color)
function quantize4bit(value) {
  return Math.floor(value / 17) * 17;
}

// Color distance metrics
function colorDistanceRGB(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function colorDistanceWeighted(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  // Weight green more (human eyes are most sensitive to green)
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
}

function colorDistanceRedmean(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const rmean = (r1 + r2) / 2;
  // Redmean formula: cheap approximation of perceptual distance
  return (
    (2 + rmean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rmean) / 256) * db * db
  );
}

function rgbToXYZ(r, g, b) {
  // Convert to 0-1 range and apply sRGB gamma correction
  r = r / 255;
  g = g / 255;
  b = b / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Convert to XYZ using D65 illuminant
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  return [x * 100, y * 100, z * 100];
}

function xyzToLAB(x, y, z) {
  // D65 illuminant reference white
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;

  x = x / refX;
  y = y / refY;
  z = z / refZ;

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

  const L = 116 * y - 16;
  const a = 500 * (x - y);
  const b = 200 * (y - z);

  return [L, a, b];
}

function colorDistanceLAB(r1, g1, b1, r2, g2, b2) {
  const [x1, y1, z1] = rgbToXYZ(r1, g1, b1);
  const [L1, a1, b1_lab] = xyzToLAB(x1, y1, z1);

  const [x2, y2, z2] = rgbToXYZ(r2, g2, b2);
  const [L2, a2, b2_lab] = xyzToLAB(x2, y2, z2);

  const dL = L1 - L2;
  const da = a1 - a2;
  const db = b1_lab - b2_lab;

  return dL * dL + da * da + db * db;
}

function getColorDistance(r1, g1, b1, r2, g2, b2, metric) {
  switch (metric) {
    case "weighted-rgb":
      return colorDistanceWeighted(r1, g1, b1, r2, g2, b2);
    case "redmean":
      return colorDistanceRedmean(r1, g1, b1, r2, g2, b2);
    case "cie76-lab":
      return colorDistanceLAB(r1, g1, b1, r2, g2, b2);
    case "rgb-euclidean":
    default:
      return colorDistanceRGB(r1, g1, b1, r2, g2, b2);
  }
}

// Apply image adjustments
// Helper functions for RGB to HSL conversion
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
    h = s = 0; // achromatic
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
    r = g = b = l; // achromatic
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

function applyAdjustments(
  imageData,
  brightness,
  contrast,
  saturation,
  hue,
  gamma,
) {
  // Apply curves first if any are modified
  const hasCurves = Object.entries(curvesEditor.curves).some(
    ([channel, curve]) => {
      // Check if curve has more than 2 points
      if (curve.length > 2) return true;
      // Check if the endpoints have been moved from default [0,0] and [255,255]
      if (curve.length === 2) {
        return (
          curve[0][0] !== 0 ||
          curve[0][1] !== 0 ||
          curve[1][0] !== 255 ||
          curve[1][1] !== 255
        );
      }
      return false;
    },
  );

  if (hasCurves) {
    imageData = curvesEditor.applyCurves(imageData);
  }

  const data = imageData.data;
  const contrastFactor = (contrast + 100) / 100;
  const brightnessFactor = brightness / 100;
  const saturationFactor = (saturation + 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness
    r += brightnessFactor * 255;
    g += brightnessFactor * 255;
    b += brightnessFactor * 255;

    // Contrast
    r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
    g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
    b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;

    // Saturation
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturationFactor;
    g = gray + (g - gray) * saturationFactor;
    b = gray + (b - gray) * saturationFactor;

    // Hue shift
    if (hue !== 0) {
      // Clamp before converting to HSL
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      let [h, s, l] = rgbToHsl(r, g, b);
      h += hue / 360; // Convert degrees to 0-1 range

      // Wrap hue around
      if (h > 1) h -= 1;
      if (h < 0) h += 1;

      [r, g, b] = hslToRgb(h, s, l);
    }

    // Gamma
    r = Math.pow(r / 255, 1 / gamma) * 255;
    g = Math.pow(g / 255, 1 / gamma) * 255;
    b = Math.pow(b / 255, 1 / gamma) * 255;

    // Clamp
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  return imageData;
}

// Median Cut quantization
function medianCut(pixels, colorCount) {
  // Start with all pixels in one box
  let boxes = [{ pixels: pixels }];

  // Keep splitting until we have enough boxes
  while (boxes.length < colorCount) {
    // Find the box with the largest volume
    let maxVolume = -1;
    let maxIdx = 0;

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.pixels.length <= 1) continue;

      let rMin = 255,
        rMax = 0;
      let gMin = 255,
        gMax = 0;
      let bMin = 255,
        bMax = 0;

      for (const pixel of box.pixels) {
        rMin = Math.min(rMin, pixel.r);
        rMax = Math.max(rMax, pixel.r);
        gMin = Math.min(gMin, pixel.g);
        gMax = Math.max(gMax, pixel.g);
        bMin = Math.min(bMin, pixel.b);
        bMax = Math.max(bMax, pixel.b);
      }

      const volume = (rMax - rMin) * (gMax - gMin) * (bMax - bMin);
      if (volume > maxVolume) {
        maxVolume = volume;
        maxIdx = i;
      }
    }

    // If no box can be split, break
    if (maxVolume === -1 || boxes[maxIdx].pixels.length <= 1) {
      break;
    }

    // Split the box with largest volume
    const boxToSplit = boxes[maxIdx];
    const pixels = boxToSplit.pixels;

    // Find the channel with the greatest range
    let rMin = 255,
      rMax = 0;
    let gMin = 255,
      gMax = 0;
    let bMin = 255,
      bMax = 0;

    for (const pixel of pixels) {
      rMin = Math.min(rMin, pixel.r);
      rMax = Math.max(rMax, pixel.r);
      gMin = Math.min(gMin, pixel.g);
      gMax = Math.max(gMax, pixel.g);
      bMin = Math.min(bMin, pixel.b);
      bMax = Math.max(bMax, pixel.b);
    }

    const rRange = rMax - rMin;
    const gRange = gMax - gMin;
    const bRange = bMax - bMin;

    // Sort by the channel with greatest range
    if (rRange >= gRange && rRange >= bRange) {
      pixels.sort((a, b) => a.r - b.r);
    } else if (gRange >= bRange) {
      pixels.sort((a, b) => a.g - b.g);
    } else {
      pixels.sort((a, b) => a.b - b.b);
    }

    // Split in half
    const mid = Math.floor(pixels.length / 2);
    const left = pixels.slice(0, mid);
    const right = pixels.slice(mid);

    // Replace the box with two new boxes
    boxes.splice(maxIdx, 1, { pixels: left }, { pixels: right });
  }

  // Calculate average color for each box
  const palette = [];
  for (const box of boxes) {
    let r = 0,
      g = 0,
      b = 0;
    for (const pixel of box.pixels) {
      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
    }
    const count = box.pixels.length;
    palette.push({
      r: quantize4bit(Math.round(r / count)),
      g: quantize4bit(Math.round(g / count)),
      b: quantize4bit(Math.round(b / count)),
    });
  }

  return palette;
}

// Wu quantization (simplified - uses median cut)
function wuQuantization(imageData, colorCount, metric = "rgb-euclidean") {
  const data = imageData.data;
  const pixels = [];

  // Sample pixels (use all for small images, sample for large)
  const step = Math.max(1, Math.floor(data.length / (4 * 10000)));
  for (let i = 0; i < data.length; i += 4 * step) {
    pixels.push({
      r: quantize4bit(data[i]),
      g: quantize4bit(data[i + 1]),
      b: quantize4bit(data[i + 2]),
    });
  }

  return medianCut(pixels, colorCount);
}

// RGB Quant (popularity + spatial distribution)
function rgbQuantization(imageData, colorCount, metric = "rgb-euclidean") {
  const data = imageData.data;
  const colorMap = new Map();

  // Count color frequencies
  for (let i = 0; i < data.length; i += 4) {
    const r = quantize4bit(data[i]);
    const g = quantize4bit(data[i + 1]);
    const b = quantize4bit(data[i + 2]);
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  // Get all unique colors with their counts
  const colors = Array.from(colorMap.entries()).map(([key, count]) => {
    const [r, g, b] = key.split(",").map(Number);
    return { r, g, b, count };
  });

  // If we have fewer unique colors than requested, return all
  if (colors.length <= colorCount) {
    return colors;
  }

  // Sort by popularity
  colors.sort((a, b) => b.count - a.count);

  // Start with most popular color
  const palette = [colors[0]];

  // Iteratively add colors that maximize distance * popularity
  while (palette.length < colorCount) {
    let bestCandidate = null;
    let bestScore = -1;

    for (const candidate of colors) {
      // Skip if already in palette
      if (
        palette.some(
          (p) =>
            p.r === candidate.r && p.g === candidate.g && p.b === candidate.b,
        )
      ) {
        continue;
      }

      // Calculate minimum distance to existing palette
      let minDist = Infinity;
      for (const existing of palette) {
        const dist = getColorDistance(
          candidate.r,
          candidate.g,
          candidate.b,
          existing.r,
          existing.g,
          existing.b,
          metric,
        );
        minDist = Math.min(minDist, dist);
      }

      // Weight by both popularity and distance
      const score = Math.sqrt(candidate.count) * Math.sqrt(minDist);

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate) {
      palette.push(bestCandidate);
    } else {
      break;
    }
  }

  return palette;
}

// Seeded random number generator for deterministic results
function seededRandom(seed) {
  let state = seed;
  return function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// NeuQuant (simplified - k-means clustering)
function neuQuantization(imageData, colorCount, metric = "rgb-euclidean") {
  const data = imageData.data;
  const pixels = [];

  // Sample pixels
  const step = Math.max(1, Math.floor(data.length / (4 * 5000)));
  for (let i = 0; i < data.length; i += 4 * step) {
    pixels.push({
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
    });
  }

  if (pixels.length === 0) {
    return [];
  }

  // Create deterministic random using image data as seed
  let seed = 0;
  for (let i = 0; i < Math.min(data.length, 100); i++) {
    seed = ((seed << 5) - seed + data[i]) >>> 0;
  }
  const random = seededRandom(seed);

  // Initialize centroids using k-means++ for better distribution
  const centroids = [];

  // First centroid is random
  centroids.push({
    ...pixels[Math.floor(random() * pixels.length)],
  });

  // Remaining centroids using k-means++ algorithm
  while (centroids.length < colorCount) {
    // Calculate distance from each pixel to nearest existing centroid
    const distances = pixels.map((pixel) => {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = getColorDistance(
          pixel.r,
          pixel.g,
          pixel.b,
          centroid.r,
          centroid.g,
          centroid.b,
          metric,
        );
        minDist = Math.min(minDist, dist);
      }
      return minDist;
    });

    // Pick new centroid with probability proportional to distance squared
    const totalDist = distances.reduce((a, b) => a + b, 0);
    let rand = random() * totalDist;
    let idx = 0;

    for (let i = 0; i < distances.length; i++) {
      rand -= distances[i];
      if (rand <= 0) {
        idx = i;
        break;
      }
    }

    centroids.push({ ...pixels[idx] });
  }

  // K-means iterations
  for (let iter = 0; iter < 15; iter++) {
    // Assign pixels to nearest centroid
    const clusters = Array(colorCount)
      .fill(null)
      .map(() => []);

    for (const pixel of pixels) {
      let minDist = Infinity;
      let bestIdx = 0;

      for (let i = 0; i < centroids.length; i++) {
        const dist = getColorDistance(
          pixel.r,
          pixel.g,
          pixel.b,
          centroids[i].r,
          centroids[i].g,
          centroids[i].b,
          metric,
        );

        if (dist < minDist) {
          minDist = dist;
          bestIdx = i;
        }
      }

      clusters[bestIdx].push(pixel);
    }

    // Update centroids
    let changed = false;
    for (let i = 0; i < centroids.length; i++) {
      if (clusters[i].length > 0) {
        let r = 0,
          g = 0,
          b = 0;
        for (const pixel of clusters[i]) {
          r += pixel.r;
          g += pixel.g;
          b += pixel.b;
        }
        const count = clusters[i].length;
        const newR = r / count;
        const newG = g / count;
        const newB = b / count;

        // Check if centroid moved significantly
        if (
          Math.abs(newR - centroids[i].r) > 0.5 ||
          Math.abs(newG - centroids[i].g) > 0.5 ||
          Math.abs(newB - centroids[i].b) > 0.5
        ) {
          changed = true;
        }

        centroids[i] = { r: newR, g: newG, b: newB };
      }
    }

    // Early exit if converged
    if (!changed) break;
  }

  // Quantize centroids to 12-bit
  return centroids.map((c) => ({
    r: quantize4bit(Math.round(c.r)),
    g: quantize4bit(Math.round(c.g)),
    b: quantize4bit(Math.round(c.b)),
  }));
}

// Select best locked colors based on image usage
function selectBestLockedColors(
  imageData,
  lockedPalette,
  colorCount,
  metric = "rgb-euclidean",
) {
  const data = imageData.data;

  // Count how many pixels would use each locked color
  const colorUsage = lockedPalette.map(() => 0);

  // For each pixel, find closest locked color and increment its count
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let minDist = Infinity;
    let closestIdx = 0;

    for (let j = 0; j < lockedPalette.length; j++) {
      const color = lockedPalette[j];
      const dist = getColorDistance(r, g, b, color.r, color.g, color.b, metric);

      if (dist < minDist) {
        minDist = dist;
        closestIdx = j;
      }
    }

    colorUsage[closestIdx]++;
  }

  // Create array of colors with their usage counts
  const colorsWithUsage = lockedPalette.map((color, idx) => ({
    color,
    usage: colorUsage[idx],
  }));

  // Sort by usage (descending) and take top N
  colorsWithUsage.sort((a, b) => b.usage - a.usage);

  return colorsWithUsage.slice(0, colorCount).map((item) => item.color);
}

// Main palette building function
function buildPalette(imageData, colorCount, method, metric = "rgb-euclidean") {
  let palette;

  // Start with locked colors
  const lockedPalette = Array.from(lockedColors).map((hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return {
      r: quantize4bit(r),
      g: quantize4bit(g),
      b: quantize4bit(b),
    };
  });

  const remainingColors = colorCount - lockedPalette.length;

  if (remainingColors === 0) {
    // Exactly enough locked colors - use them in original order
    return lockedPalette;
  } else if (remainingColors < 0) {
    // More locked colors than requested - pick best ones based on usage
    return selectBestLockedColors(imageData, lockedPalette, colorCount, metric);
  }

  // Generate palette for remaining slots
  switch (method) {
    case "median-cut":
      palette = wuQuantization(imageData, remainingColors, metric);
      break;
    case "wuquant":
      palette = wuQuantization(imageData, remainingColors, metric);
      break;
    case "neuquant":
      palette = neuQuantization(imageData, remainingColors, metric);
      break;
    case "rgbquant":
    default:
      palette = rgbQuantization(imageData, remainingColors, metric);
      break;
  }

  // Combine locked and generated colors
  const combinedPalette = [...lockedPalette, ...palette];

  // Remove duplicates that might result from 12-bit quantization
  const seen = new Set();
  const uniquePalette = [];
  for (const color of combinedPalette) {
    const key = `${color.r},${color.g},${color.b}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePalette.push(color);
    }
  }

  // If we lost colors due to deduplication, use median cut to fill gaps
  if (
    uniquePalette.length < colorCount &&
    uniquePalette.length < combinedPalette.length
  ) {
    // Get all unique 12-bit colors from image
    const data = imageData.data;
    const imageColors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      const r = quantize4bit(data[i]);
      const g = quantize4bit(data[i + 1]);
      const b = quantize4bit(data[i + 2]);
      const key = `${r},${g},${b}`;
      if (!seen.has(key)) {
        imageColors.add(key);
      }
    }

    // Add most different colors from the image
    const candidates = Array.from(imageColors).map((key) => {
      const [r, g, b] = key.split(",").map(Number);
      return { r, g, b };
    });

    while (uniquePalette.length < colorCount && candidates.length > 0) {
      // Find candidate most distant from current palette
      let maxMinDist = -1;
      let bestIdx = 0;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        let minDist = Infinity;

        for (const existing of uniquePalette) {
          const dist = getColorDistance(
            candidate.r,
            candidate.g,
            candidate.b,
            existing.r,
            existing.g,
            existing.b,
            metric,
          );
          minDist = Math.min(minDist, dist);
        }

        if (minDist > maxMinDist) {
          maxMinDist = minDist;
          bestIdx = i;
        }
      }

      uniquePalette.push(candidates[bestIdx]);
      candidates.splice(bestIdx, 1);
    }
  }

  return uniquePalette;
}

// Find nearest color in palette
function findNearestColor(r, g, b, palette, metric = "rgb-euclidean") {
  let minDist = Infinity;
  let bestColor = palette[0];

  for (const color of palette) {
    const dist = getColorDistance(r, g, b, color.r, color.g, color.b, metric);

    if (dist < minDist) {
      minDist = dist;
      bestColor = color;
    }
  }

  return bestColor;
}

// Dithering algorithms
function applyDithering(
  imageData,
  palette,
  method,
  amount,
  bayerSize,
  metric = "rgb-euclidean",
) {
  const width = imageData.width;
  const height = imageData.height;
  const data = new Int16Array(imageData.data);

  if (method === "none") {
    for (let i = 0; i < data.length; i += 4) {
      const color = findNearestColor(
        data[i],
        data[i + 1],
        data[i + 2],
        palette,
        metric,
      );
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
    }
  } else if (method === "floyd-steinberg") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = Math.max(0, Math.min(255, data[idx]));
        const g = Math.max(0, Math.min(255, data[idx + 1]));
        const b = Math.max(0, Math.min(255, data[idx + 2]));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;

        const errR = (r - color.r) * amount;
        const errG = (g - color.g) * amount;
        const errB = (b - color.b) * amount;

        if (x + 1 < width) {
          data[idx + 4] += (errR * 7) / 16;
          data[idx + 5] += (errG * 7) / 16;
          data[idx + 6] += (errB * 7) / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            data[idx - 4 + width * 4] += (errR * 3) / 16;
            data[idx - 3 + width * 4] += (errG * 3) / 16;
            data[idx - 2 + width * 4] += (errB * 3) / 16;
          }
          data[idx + width * 4] += (errR * 5) / 16;
          data[idx + 1 + width * 4] += (errG * 5) / 16;
          data[idx + 2 + width * 4] += (errB * 5) / 16;
          if (x + 1 < width) {
            data[idx + 4 + width * 4] += (errR * 1) / 16;
            data[idx + 5 + width * 4] += (errG * 1) / 16;
            data[idx + 6 + width * 4] += (errB * 1) / 16;
          }
        }
      }
    }
  } else if (method === "atkinson") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = Math.max(0, Math.min(255, data[idx]));
        const g = Math.max(0, Math.min(255, data[idx + 1]));
        const b = Math.max(0, Math.min(255, data[idx + 2]));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;

        const errR = ((r - color.r) / 8) * amount;
        const errG = ((g - color.g) / 8) * amount;
        const errB = ((b - color.b) / 8) * amount;

        if (x + 1 < width) {
          data[idx + 4] += errR;
          data[idx + 5] += errG;
          data[idx + 6] += errB;
        }
        if (x + 2 < width) {
          data[idx + 8] += errR;
          data[idx + 9] += errG;
          data[idx + 10] += errB;
        }
        if (y + 1 < height) {
          if (x > 0) {
            data[idx - 4 + width * 4] += errR;
            data[idx - 3 + width * 4] += errG;
            data[idx - 2 + width * 4] += errB;
          }
          data[idx + width * 4] += errR;
          data[idx + 1 + width * 4] += errG;
          data[idx + 2 + width * 4] += errB;
          if (x + 1 < width) {
            data[idx + 4 + width * 4] += errR;
            data[idx + 5 + width * 4] += errG;
            data[idx + 6 + width * 4] += errB;
          }
        }
        if (y + 2 < height) {
          data[idx + width * 8] += errR;
          data[idx + 1 + width * 8] += errG;
          data[idx + 2 + width * 8] += errB;
        }
      }
    }
  } else if (method === "jarvis-judice-ninke") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = Math.max(0, Math.min(255, data[idx]));
        const g = Math.max(0, Math.min(255, data[idx + 1]));
        const b = Math.max(0, Math.min(255, data[idx + 2]));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;

        const errR = (r - color.r) * amount;
        const errG = (g - color.g) * amount;
        const errB = (b - color.b) * amount;

        // JJN distributes error to 12 neighbors with weights summing to 48
        if (x + 1 < width) {
          data[idx + 4] += (errR * 7) / 48;
          data[idx + 5] += (errG * 7) / 48;
          data[idx + 6] += (errB * 7) / 48;
        }
        if (x + 2 < width) {
          data[idx + 8] += (errR * 5) / 48;
          data[idx + 9] += (errG * 5) / 48;
          data[idx + 10] += (errB * 5) / 48;
        }
        if (y + 1 < height) {
          if (x > 1) {
            data[idx - 8 + width * 4] += (errR * 3) / 48;
            data[idx - 7 + width * 4] += (errG * 3) / 48;
            data[idx - 6 + width * 4] += (errB * 3) / 48;
          }
          if (x > 0) {
            data[idx - 4 + width * 4] += (errR * 5) / 48;
            data[idx - 3 + width * 4] += (errG * 5) / 48;
            data[idx - 2 + width * 4] += (errB * 5) / 48;
          }
          data[idx + width * 4] += (errR * 7) / 48;
          data[idx + 1 + width * 4] += (errG * 7) / 48;
          data[idx + 2 + width * 4] += (errB * 7) / 48;
          if (x + 1 < width) {
            data[idx + 4 + width * 4] += (errR * 5) / 48;
            data[idx + 5 + width * 4] += (errG * 5) / 48;
            data[idx + 6 + width * 4] += (errB * 5) / 48;
          }
          if (x + 2 < width) {
            data[idx + 8 + width * 4] += (errR * 3) / 48;
            data[idx + 9 + width * 4] += (errG * 3) / 48;
            data[idx + 10 + width * 4] += (errB * 3) / 48;
          }
        }
        if (y + 2 < height) {
          if (x > 1) {
            data[idx - 8 + width * 8] += (errR * 1) / 48;
            data[idx - 7 + width * 8] += (errG * 1) / 48;
            data[idx - 6 + width * 8] += (errB * 1) / 48;
          }
          if (x > 0) {
            data[idx - 4 + width * 8] += (errR * 3) / 48;
            data[idx - 3 + width * 8] += (errG * 3) / 48;
            data[idx - 2 + width * 8] += (errB * 3) / 48;
          }
          data[idx + width * 8] += (errR * 5) / 48;
          data[idx + 1 + width * 8] += (errG * 5) / 48;
          data[idx + 2 + width * 8] += (errB * 5) / 48;
          if (x + 1 < width) {
            data[idx + 4 + width * 8] += (errR * 3) / 48;
            data[idx + 5 + width * 8] += (errG * 3) / 48;
            data[idx + 6 + width * 8] += (errB * 3) / 48;
          }
          if (x + 2 < width) {
            data[idx + 8 + width * 8] += (errR * 1) / 48;
            data[idx + 9 + width * 8] += (errG * 1) / 48;
            data[idx + 10 + width * 8] += (errB * 1) / 48;
          }
        }
      }
    }
  } else if (method === "stucki") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = Math.max(0, Math.min(255, data[idx]));
        const g = Math.max(0, Math.min(255, data[idx + 1]));
        const b = Math.max(0, Math.min(255, data[idx + 2]));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;

        const errR = (r - color.r) * amount;
        const errG = (g - color.g) * amount;
        const errB = (b - color.b) * amount;

        // Stucki distributes error to 12 neighbors with weights summing to 42
        if (x + 1 < width) {
          data[idx + 4] += (errR * 8) / 42;
          data[idx + 5] += (errG * 8) / 42;
          data[idx + 6] += (errB * 8) / 42;
        }
        if (x + 2 < width) {
          data[idx + 8] += (errR * 4) / 42;
          data[idx + 9] += (errG * 4) / 42;
          data[idx + 10] += (errB * 4) / 42;
        }
        if (y + 1 < height) {
          if (x > 1) {
            data[idx - 8 + width * 4] += (errR * 2) / 42;
            data[idx - 7 + width * 4] += (errG * 2) / 42;
            data[idx - 6 + width * 4] += (errB * 2) / 42;
          }
          if (x > 0) {
            data[idx - 4 + width * 4] += (errR * 4) / 42;
            data[idx - 3 + width * 4] += (errG * 4) / 42;
            data[idx - 2 + width * 4] += (errB * 4) / 42;
          }
          data[idx + width * 4] += (errR * 8) / 42;
          data[idx + 1 + width * 4] += (errG * 8) / 42;
          data[idx + 2 + width * 4] += (errB * 8) / 42;
          if (x + 1 < width) {
            data[idx + 4 + width * 4] += (errR * 4) / 42;
            data[idx + 5 + width * 4] += (errG * 4) / 42;
            data[idx + 6 + width * 4] += (errB * 4) / 42;
          }
          if (x + 2 < width) {
            data[idx + 8 + width * 4] += (errR * 2) / 42;
            data[idx + 9 + width * 4] += (errG * 2) / 42;
            data[idx + 10 + width * 4] += (errB * 2) / 42;
          }
        }
        if (y + 2 < height) {
          if (x > 1) {
            data[idx - 8 + width * 8] += (errR * 1) / 42;
            data[idx - 7 + width * 8] += (errG * 1) / 42;
            data[idx - 6 + width * 8] += (errB * 1) / 42;
          }
          if (x > 0) {
            data[idx - 4 + width * 8] += (errR * 2) / 42;
            data[idx - 3 + width * 8] += (errG * 2) / 42;
            data[idx - 2 + width * 8] += (errB * 2) / 42;
          }
          data[idx + width * 8] += (errR * 4) / 42;
          data[idx + 1 + width * 8] += (errG * 4) / 42;
          data[idx + 2 + width * 8] += (errB * 4) / 42;
          if (x + 1 < width) {
            data[idx + 4 + width * 8] += (errR * 2) / 42;
            data[idx + 5 + width * 8] += (errG * 2) / 42;
            data[idx + 6 + width * 8] += (errB * 2) / 42;
          }
          if (x + 2 < width) {
            data[idx + 8 + width * 8] += (errR * 1) / 42;
            data[idx + 9 + width * 8] += (errG * 1) / 42;
            data[idx + 10 + width * 8] += (errB * 1) / 42;
          }
        }
      }
    }
  } else if (method === "burkes") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = Math.max(0, Math.min(255, data[idx]));
        const g = Math.max(0, Math.min(255, data[idx + 1]));
        const b = Math.max(0, Math.min(255, data[idx + 2]));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;

        const errR = (r - color.r) * amount;
        const errG = (g - color.g) * amount;
        const errB = (b - color.b) * amount;

        // Burkes distributes error to 7 neighbors with weights summing to 32
        if (x + 1 < width) {
          data[idx + 4] += (errR * 8) / 32;
          data[idx + 5] += (errG * 8) / 32;
          data[idx + 6] += (errB * 8) / 32;
        }
        if (x + 2 < width) {
          data[idx + 8] += (errR * 4) / 32;
          data[idx + 9] += (errG * 4) / 32;
          data[idx + 10] += (errB * 4) / 32;
        }
        if (y + 1 < height) {
          if (x > 1) {
            data[idx - 8 + width * 4] += (errR * 2) / 32;
            data[idx - 7 + width * 4] += (errG * 2) / 32;
            data[idx - 6 + width * 4] += (errB * 2) / 32;
          }
          if (x > 0) {
            data[idx - 4 + width * 4] += (errR * 4) / 32;
            data[idx - 3 + width * 4] += (errG * 4) / 32;
            data[idx - 2 + width * 4] += (errB * 4) / 32;
          }
          data[idx + width * 4] += (errR * 8) / 32;
          data[idx + 1 + width * 4] += (errG * 8) / 32;
          data[idx + 2 + width * 4] += (errB * 8) / 32;
          if (x + 1 < width) {
            data[idx + 4 + width * 4] += (errR * 4) / 32;
            data[idx + 5 + width * 4] += (errG * 4) / 32;
            data[idx + 6 + width * 4] += (errB * 4) / 32;
          }
          if (x + 2 < width) {
            data[idx + 8 + width * 4] += (errR * 2) / 32;
            data[idx + 9 + width * 4] += (errG * 2) / 32;
            data[idx + 10 + width * 4] += (errB * 2) / 32;
          }
        }
      }
    }
  } else if (method === "sierra") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = Math.max(0, Math.min(255, data[idx]));
        const g = Math.max(0, Math.min(255, data[idx + 1]));
        const b = Math.max(0, Math.min(255, data[idx + 2]));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;

        const errR = (r - color.r) * amount;
        const errG = (g - color.g) * amount;
        const errB = (b - color.b) * amount;

        // Sierra distributes error to 10 neighbors with weights summing to 32
        if (x + 1 < width) {
          data[idx + 4] += (errR * 5) / 32;
          data[idx + 5] += (errG * 5) / 32;
          data[idx + 6] += (errB * 5) / 32;
        }
        if (x + 2 < width) {
          data[idx + 8] += (errR * 3) / 32;
          data[idx + 9] += (errG * 3) / 32;
          data[idx + 10] += (errB * 3) / 32;
        }
        if (y + 1 < height) {
          if (x > 1) {
            data[idx - 8 + width * 4] += (errR * 2) / 32;
            data[idx - 7 + width * 4] += (errG * 2) / 32;
            data[idx - 6 + width * 4] += (errB * 2) / 32;
          }
          if (x > 0) {
            data[idx - 4 + width * 4] += (errR * 4) / 32;
            data[idx - 3 + width * 4] += (errG * 4) / 32;
            data[idx - 2 + width * 4] += (errB * 4) / 32;
          }
          data[idx + width * 4] += (errR * 5) / 32;
          data[idx + 1 + width * 4] += (errG * 5) / 32;
          data[idx + 2 + width * 4] += (errB * 5) / 32;
          if (x + 1 < width) {
            data[idx + 4 + width * 4] += (errR * 4) / 32;
            data[idx + 5 + width * 4] += (errG * 4) / 32;
            data[idx + 6 + width * 4] += (errB * 4) / 32;
          }
          if (x + 2 < width) {
            data[idx + 8 + width * 4] += (errR * 2) / 32;
            data[idx + 9 + width * 4] += (errG * 2) / 32;
            data[idx + 10 + width * 4] += (errB * 2) / 32;
          }
        }
        if (y + 2 < height) {
          if (x > 0) {
            data[idx - 4 + width * 8] += (errR * 2) / 32;
            data[idx - 3 + width * 8] += (errG * 2) / 32;
            data[idx - 2 + width * 8] += (errB * 2) / 32;
          }
          data[idx + width * 8] += (errR * 3) / 32;
          data[idx + 1 + width * 8] += (errG * 3) / 32;
          data[idx + 2 + width * 8] += (errB * 3) / 32;
          if (x + 1 < width) {
            data[idx + 4 + width * 8] += (errR * 2) / 32;
            data[idx + 5 + width * 8] += (errG * 2) / 32;
            data[idx + 6 + width * 8] += (errB * 2) / 32;
          }
        }
      }
    }
  } else if (method === "sierra-lite") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        const r = Math.max(0, Math.min(255, data[idx]));
        const g = Math.max(0, Math.min(255, data[idx + 1]));
        const b = Math.max(0, Math.min(255, data[idx + 2]));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;

        const errR = (r - color.r) * amount;
        const errG = (g - color.g) * amount;
        const errB = (b - color.b) * amount;

        // Sierra Lite distributes error to 4 neighbors with weights summing to 4
        if (x + 1 < width) {
          data[idx + 4] += (errR * 2) / 4;
          data[idx + 5] += (errG * 2) / 4;
          data[idx + 6] += (errB * 2) / 4;
        }
        if (y + 1 < height) {
          if (x > 0) {
            data[idx - 4 + width * 4] += (errR * 1) / 4;
            data[idx - 3 + width * 4] += (errG * 1) / 4;
            data[idx - 2 + width * 4] += (errB * 1) / 4;
          }
          data[idx + width * 4] += (errR * 1) / 4;
          data[idx + 1 + width * 4] += (errG * 1) / 4;
          data[idx + 2 + width * 4] += (errB * 1) / 4;
        }
      }
    }
  } else if (method === "ordered") {
    const bayer2 = [
      [0, 2],
      [3, 1],
    ];
    const bayer4 = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    const bayer8 = [
      [0, 32, 8, 40, 2, 34, 10, 42],
      [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38],
      [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41],
      [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37],
      [63, 31, 55, 23, 61, 29, 53, 21],
    ];

    const matrices = { 2: bayer2, 4: bayer4, 8: bayer8 };
    const matrix = matrices[bayerSize] || bayer8;
    const matrixMax = bayerSize * bayerSize;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const threshold =
          (matrix[y % bayerSize][x % bayerSize] / matrixMax - 0.5) *
          64 *
          amount;

        const r = Math.max(0, Math.min(255, data[idx] + threshold));
        const g = Math.max(0, Math.min(255, data[idx + 1] + threshold));
        const b = Math.max(0, Math.min(255, data[idx + 2] + threshold));

        const color = findNearestColor(r, g, b, palette, metric);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
      }
    }
  }

  // Copy back to Uint8ClampedArray
  for (let i = 0; i < imageData.data.length; i++) {
    imageData.data[i] = Math.max(0, Math.min(255, data[i]));
  }

  return imageData;
}

// Display palette colors
let lockedColors = new Set();
let currentPalette = [];
let currentIndexedData = null; // Store indexed pixel data for indexed PNG export
let flashInterval = null;
let flashTimeout = null;
let originalPreviewData = null;

function displayPalette(palette) {
  const paletteDisplay = document.getElementById("paletteDisplay");
  paletteDisplay.innerHTML = "";
  currentPalette = palette;

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
  const pixelCounts = new Array(palette.length).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Find which palette color this pixel uses
    for (let j = 0; j < palette.length; j++) {
      if (palette[j].r === r && palette[j].g === g && palette[j].b === b) {
        pixelCounts[j]++;
        break;
      }
    }
  }

  for (let i = 0; i < palette.length; i++) {
    const color = palette[i];
    const colorDiv = document.createElement("div");
    colorDiv.className = "palette-color";
    colorDiv.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
    colorDiv.dataset.index = i;

    // Convert to hex for internal storage (6-digit)
    const hexR = color.r.toString(16).padStart(2, "0");
    const hexG = color.g.toString(16).padStart(2, "0");
    const hexB = color.b.toString(16).padStart(2, "0");
    const hexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();

    // Convert to 12-bit format for tooltip
    const r4bit = Math.floor(color.r / 17).toString(16);
    const g4bit = Math.floor(color.g / 17).toString(16);
    const b4bit = Math.floor(color.b / 17).toString(16);
    const hex12bit = `#${r4bit}${g4bit}${b4bit}`.toUpperCase();

    // Format pixel count with thousands separator
    const pixelCount = pixelCounts[i].toLocaleString();
    const tooltipText = `${hex12bit} • ${pixelCount} px`;

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
          convertImage();
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

          for (let i = 0; i < data.length; i += 4) {
            // Check if this pixel matches the palette color
            if (
              originalPreviewData[i] === color.r &&
              originalPreviewData[i + 1] === color.g &&
              originalPreviewData[i + 2] === color.b
            ) {
              if (flashOn) {
                // Flash on: show brightened/darkened color
                data[i] = flashR;
                data[i + 1] = flashG;
                data[i + 2] = flashB;
              } else {
                // Flash off: show original color
                data[i] = color.r;
                data[i + 1] = color.g;
                data[i + 2] = color.b;
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

    paletteDisplay.appendChild(colorDiv);
  }

  // Display locked colors that are not in the active palette (disabled state)
  const paletteColorSet = new Set(
    palette.map((c) => {
      const hexR = c.r.toString(16).padStart(2, "0");
      const hexG = c.g.toString(16).padStart(2, "0");
      const hexB = c.b.toString(16).padStart(2, "0");
      return `#${hexR}${hexG}${hexB}`.toUpperCase();
    }),
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

    // Convert to 12-bit format for tooltip
    const r4bit = Math.floor(r / 17).toString(16);
    const g4bit = Math.floor(g / 17).toString(16);
    const b4bit = Math.floor(b / 17).toString(16);
    const hex12bit = `#${r4bit}${g4bit}${b4bit}`.toUpperCase();

    const tooltipText = `${hex12bit} • Not used (exceeds color count)`;
    colorDiv.setAttribute("data-rgb", tooltipText);
    colorDiv.setAttribute("data-rgb-full", hexColor);

    // Click to unlock (removing from locked set)
    colorDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      lockedColors.delete(hexColor);
      if (window.sourceImage) {
        convertImage();
      }
    });

    paletteDisplay.appendChild(colorDiv);
  });
}

// Main conversion function
async function convertImage() {
  if (!window.sourceImage) return;

  // If a conversion is already in progress, mark that we need another one
  if (conversionInProgress) {
    pendingConversion = true;
    return;
  }

  // Mark that we're starting a conversion
  conversionInProgress = true;

  // Show palette actions
  document.getElementById("paletteActions").classList.remove("hidden");

  // Use setTimeout to allow UI to update
  setTimeout(() => {
    const originalCanvas = document.getElementById("originalCanvas");
    const previewCanvas = document.getElementById("previewCanvas");
    const slideOriginalCanvas = document.getElementById("slideOriginalCanvas");
    const slidePreviewCanvas = document.getElementById("slidePreviewCanvas");

    const ctx = originalCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    // Get resize dimensions (will auto-detect if different from original)
    const resizeWidth = parseInt(document.getElementById("resizeWidth").value);
    const resizeHeight = parseInt(
      document.getElementById("resizeHeight").value,
    );

    // Use resize dimensions if valid, otherwise use original
    const width =
      !isNaN(resizeWidth) && resizeWidth > 0
        ? resizeWidth
        : window.sourceImage.width;
    const height =
      !isNaN(resizeHeight) && resizeHeight > 0
        ? resizeHeight
        : window.sourceImage.height;

    // Only set canvas sizes if they've changed (setting dimensions clears the canvas)
    if (originalCanvas.width !== width || originalCanvas.height !== height) {
      originalCanvas.width = width;
      originalCanvas.height = height;
      previewCanvas.width = width;
      previewCanvas.height = height;
      slideOriginalCanvas.width = width;
      slideOriginalCanvas.height = height;
      slidePreviewCanvas.width = width;
      slidePreviewCanvas.height = height;
    }

    // Draw original to main canvas (resized if enabled)
    ctx.drawImage(window.sourceImage, 0, 0, width, height);

    // Get image data and calculate histogram
    let imageData = ctx.getImageData(0, 0, width, height);
    curvesEditor.calculateHistogram(imageData);

    // Draw original to slide canvas
    const slideOriginalCtx = slideOriginalCanvas.getContext("2d");
    slideOriginalCtx.drawImage(window.sourceImage, 0, 0, width, height);

    // Increment conversion ID to track this conversion
    currentConversionId++;
    const thisConversionId = currentConversionId;

    // Parse matte color from text input (supports #FFF or #FFFFFF)
    const matteHex = document.getElementById("matteColorInput").value.trim();
    let matteR = 255,
      matteG = 255,
      matteB = 255;

    if (matteHex.match(/^#[0-9A-Fa-f]{3}$/)) {
      // 3-digit hex
      matteR = parseInt(matteHex[1] + matteHex[1], 16);
      matteG = parseInt(matteHex[2] + matteHex[2], 16);
      matteB = parseInt(matteHex[3] + matteHex[3], 16);
    } else if (matteHex.match(/^#[0-9A-Fa-f]{6}$/)) {
      // 6-digit hex
      matteR = parseInt(matteHex.slice(1, 3), 16);
      matteG = parseInt(matteHex.slice(3, 5), 16);
      matteB = parseInt(matteHex.slice(5, 7), 16);
    }

    // Gather all parameters
    const params = {
      brightness: parseInt(document.getElementById("brightness").value),
      contrast: parseInt(document.getElementById("contrast").value),
      saturation: parseInt(document.getElementById("saturation").value),
      hue: parseInt(document.getElementById("hue").value),
      gamma: parseFloat(document.getElementById("gamma").value),
      curvesLUTs: curvesEditor.getCurvesLUTs(),
      colorCount: parseInt(document.getElementById("colors").value),
      quantMethod: document.getElementById("quantMethod").value,
      colorDistance: document.getElementById("colorDistance").value,
      lockedColors: Array.from(lockedColors),
      ditherMethod: document.getElementById("ditherMethod").value,
      ditherAmount: parseFloat(document.getElementById("ditherAmount").value),
      bayerSize: parseInt(document.getElementById("bayerSize").value),
      errorDampening: document.getElementById("errorDampeningEnabled").checked
        ? parseFloat(document.getElementById("errorDampeningThreshold").value)
        : null,
      matteColor: { r: matteR, g: matteG, b: matteB },
    };

    // Send to worker for processing (copy data, don't transfer)
    // This keeps the original preview visible while processing
    conversionWorker.postMessage({
      id: thisConversionId,
      imageData: imageData.data.slice(0), // Copy the array
      width: width,
      height: height,
      params: params,
    });
  }, 10);
}

// Update view mode display
function updateViewMode() {
  const viewMode = document.getElementById("viewMode").value;
  const zoomLevel = document.getElementById("zoomLevel").value;
  const canvasGrid = document.getElementById("canvasGrid");
  const slideContainer = document.getElementById("slideRevealContainer");
  const originalWrapper = document.getElementById("originalWrapper");
  const previewWrapper = document.getElementById("previewWrapper");

  // Hide everything first
  canvasGrid.style.display = "none";
  slideContainer.style.display = "none";
  originalWrapper.classList.remove("hidden");
  previewWrapper.classList.remove("hidden");

  // Apply zoom to all canvases
  const allCanvases = [
    document.getElementById("originalCanvas"),
    document.getElementById("previewCanvas"),
    document.getElementById("slideOriginalCanvas"),
    document.getElementById("slidePreviewCanvas"),
  ];

  if (zoomLevel === "fit") {
    // For fit mode, use responsive CSS approach
    const isStacked = viewMode === "stacked";

    allCanvases.forEach((canvas) => {
      if (!canvas) return;

      // Use responsive sizing with constraints
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.maxWidth = "100%";
      // In stacked mode, each canvas gets 50% of height
      canvas.style.maxHeight = isStacked ? "50%" : "100%";
      canvas.style.objectFit = "contain";
    });
  } else {
    allCanvases.forEach((canvas) => {
      if (!canvas) return;

      const scale = parseFloat(zoomLevel);
      canvas.style.width = "";
      canvas.style.height = "";
      canvas.style.maxWidth = "";
      canvas.style.maxHeight = "";
      canvas.style.objectFit = "";

      if (scale === 1) {
        // For 100%, let browser use natural canvas size
        canvas.style.width = "";
        canvas.style.height = "";
      } else {
        // For zoom, explicitly set CSS size
        const cssWidth = canvas.width * scale;
        const cssHeight = canvas.height * scale;
        canvas.style.width = cssWidth + "px";
        canvas.style.height = cssHeight + "px";
      }
    });
  }

  // Show based on mode
  if (viewMode === "slide-reveal") {
    slideContainer.style.display = "flex";
    slideContainer.style.justifyContent = "center";
    slideContainer.style.alignItems = "flex-start";

    setTimeout(() => {
      updateSlideDivider(currentSlidePosition); // Use stored position
    }, 100);
  } else {
    canvasGrid.style.display = "grid";
    canvasGrid.className = "canvas-grid " + viewMode;

    if (viewMode === "original-only") {
      previewWrapper.classList.add("hidden");
    } else if (viewMode === "preview-only") {
      originalWrapper.classList.add("hidden");
    }
  }
}

// Slide reveal divider handling
let isDraggingSlider = false;
let currentSlidePosition = 50; // Store current position

function updateSlideDivider(percentage) {
  currentSlidePosition = percentage; // Remember the position
  const wrapper = document.getElementById("slideRevealWrapper");
  const divider = document.getElementById("slideDivider");
  const topCanvas = document.getElementById("slideOriginalCanvas");
  const bottomCanvas = document.getElementById("slidePreviewCanvas");

  if (!wrapper || !bottomCanvas || bottomCanvas.width === 0) {
    return;
  }

  // Use the canvas's actual displayed width (CSS width), not pixel width
  const width = bottomCanvas.offsetWidth;
  const position = (percentage / 100) * width;

  divider.style.left = position + "px";
  topCanvas.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
}

document.getElementById("slideDivider").addEventListener("mousedown", () => {
  isDraggingSlider = true;
});

document.addEventListener("mousemove", (e) => {
  if (!isDraggingSlider) return;

  const wrapper = document.getElementById("slideRevealWrapper");
  const canvas = document.getElementById("slidePreviewCanvas");
  const rect = wrapper.getBoundingClientRect();
  const x = e.clientX - rect.left;
  // Use offsetWidth (displayed width) not canvas.width (pixel width)
  const percentage = Math.max(0, Math.min(100, (x / canvas.offsetWidth) * 100));

  updateSlideDivider(percentage);
});

document.addEventListener("mouseup", () => {
  isDraggingSlider = false;
});

// Drag and drop
const canvasDisplay = document.getElementById("canvasDisplay");

canvasDisplay.addEventListener("dragover", (e) => {
  e.preventDefault();
  canvasDisplay.classList.add("drop-target");
});

canvasDisplay.addEventListener("dragleave", () => {
  canvasDisplay.classList.remove("drop-target");
});

canvasDisplay.addEventListener("drop", (e) => {
  e.preventDefault();
  canvasDisplay.classList.remove("drop-target");

  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    loadImageFile(file);
  }
});

function loadImageFile(file) {
  // Store original filename (without extension) for download
  const lastDot = file.name.lastIndexOf(".");
  window.sourceFilename = lastDot > 0 ? file.name.substring(0, lastDot) : file.name;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      window.sourceImage = img;

      // Set resize dimensions to image's natural size
      document.getElementById("resizeWidth").value = img.width;
      document.getElementById("resizeHeight").value = img.height;

      // Store aspect ratio for lock functionality
      window.sourceAspectRatio = img.width / img.height;

      document.getElementById("canvasDisplay").classList.add("has-image");
      document.getElementById("canvasGrid").style.display = "grid";

      // Toggle image buttons
      document.getElementById("chooseImageBtn").style.display = "none";
      document.getElementById("changeImageBtn").style.display = "block";

      convertImage();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Initialize page state on load
window.addEventListener("DOMContentLoaded", () => {
  // Reset to empty state
  document.getElementById("downloadBtn").disabled = true;
  document.getElementById("chooseImageBtn").style.display = "block";
  document.getElementById("changeImageBtn").style.display = "none";
  document.getElementById("canvasDisplay").classList.remove("has-image");
  document.getElementById("canvasGrid").style.display = "none";

  // Clear any persisted file input
  document.getElementById("imageInput").value = "";

  // Reset adjustment controls to default values (prevents browser form persistence)
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

  // Reset conversion controls to default values
  document.getElementById("colors").value = 32;
  document.getElementById("colorsNumber").value = 32;
  document.getElementById("ditherAmount").value = 0.5;
  document.getElementById("ditherAmountNumber").value = 0.5;
  document.getElementById("ditherMethod").value = "floyd-steinberg";
  document.getElementById("quantMethod").value = "rgbquant";
  document.getElementById("colorDistance").value = "rgb-euclidean";
  document.getElementById("matteColorInput").value = "#fff";
  document.getElementById("errorDampeningEnabled").checked = false;
  document.getElementById("errorDampeningThreshold").value = 48;
  document.getElementById("errorDampeningThresholdNumber").value = 48;

  // Set initial visibility for conditional controls
  document.getElementById("bayerSizeControl").style.display = "none";
  document.getElementById("ditherAmountControl").style.display = "block";
  document.getElementById("errorDampeningControl").style.display = "block";

  // Reset window state
  window.sourceImage = null;
});

// Event listeners
document.getElementById("imageInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadImageFile(file);
});

// Make drop message clickable
document.getElementById("dropMessage").addEventListener("click", async () => {
  const file = await openFileWithPicker(
    document.getElementById("imageInput"),
    [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] } }]
  );
  if (file) loadImageFile(file);
});

// Choose Image button (empty state)
document.getElementById("chooseImageBtn").addEventListener("click", async () => {
  const file = await openFileWithPicker(
    document.getElementById("imageInput"),
    [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] } }]
  );
  if (file) loadImageFile(file);
});

// Change Image button (loaded state)
document.getElementById("changeImageBtn").addEventListener("click", async () => {
  const file = await openFileWithPicker(
    document.getElementById("imageInput"),
    [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] } }]
  );
  if (file) loadImageFile(file);
});

// Helper function to update control group max-height
function updateControlGroupHeight(element) {
  const group = element.closest(".control-group");
  if (group && !group.classList.contains("collapsed")) {
    const content = group.querySelector(".control-group-content");
    if (content) {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  }
}

// Show/hide Bayer size control, dither amount, and error dampening
document.getElementById("ditherMethod").addEventListener("change", (e) => {
  const method = e.target.value;
  const bayerControl = document.getElementById("bayerSizeControl");
  const ditherAmountControl = document.getElementById("ditherAmountControl");
  const errorDampeningControl = document.getElementById("errorDampeningControl");

  const isErrorDiffusion = method !== "ordered" && method !== "none";

  bayerControl.style.display = method === "ordered" ? "block" : "none";
  ditherAmountControl.style.display = method === "none" ? "none" : "block";
  errorDampeningControl.style.display = isErrorDiffusion ? "block" : "none";

  // Update the control group height to accommodate the new visibility
  updateControlGroupHeight(bayerControl);
});

// No throttling needed - pending conversion logic handles rapid calls efficiently

// Trigger conversion on any control change
const controls = [
  "colors",
  "quantMethod",
  "ditherMethod",
  "ditherAmount",
  "bayerSize",
  "brightness",
  "contrast",
  "saturation",
  "hue",
  "gamma",
  "errorDampeningThreshold",
];

// Continuous controls (sliders) use debouncing for smooth interaction
const continuousControls = [
  "colors",
  "ditherAmount",
  "brightness",
  "contrast",
  "saturation",
  "hue",
  "gamma",
  "errorDampeningThreshold",
];

// Discrete controls (dropdowns, checkboxes) convert immediately
const discreteControls = [
  "quantMethod",
  "ditherMethod",
  "bayerSize",
  "colorDistance",
  "errorDampeningEnabled",
];

continuousControls.forEach((id) => {
  const element = document.getElementById(id);
  element.addEventListener("input", convertImage); // Immediate, pending logic handles rapid calls
  element.addEventListener("change", convertImage); // Also on release
});

discreteControls.forEach((id) => {
  const element = document.getElementById(id);
  element.addEventListener("change", convertImage); // Immediate for dropdowns
});

// Matte color input converts on change (when user finishes typing)
document
  .getElementById("matteColorInput")
  .addEventListener("change", convertImage);

// View mode and zoom changes
document.getElementById("viewMode").addEventListener("change", () => {
  if (window.sourceImage) {
    updateViewMode();
  }
});

document.getElementById("zoomLevel").addEventListener("change", () => {
  if (window.sourceImage) {
    convertImage();
  }
});

// Handle window resize for fit mode
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const zoomLevel = document.getElementById("zoomLevel").value;
    if (window.sourceImage && zoomLevel === "fit") {
      updateViewMode();
    }
  }, 100); // Debounce resize events
});

// Create indexed PNG manually
function createIndexedPNG(width, height, indexedData, palette) {
  // Helper to create PNG chunks
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

  // CRC32 calculation
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

  // Compress with pako
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

// Download button
document.getElementById("downloadBtn").addEventListener("click", async () => {
  // Always export as indexed PNG
  // Use whichever preview canvas is currently visible/active
  const previewCanvas = document.getElementById("previewCanvas");
  const slidePreviewCanvas = document.getElementById("slidePreviewCanvas");
  const viewMode = document.getElementById("viewMode").value;

  // Choose the appropriate canvas based on view mode
  let canvas;
  if (viewMode === "slide-reveal") {
    canvas = slidePreviewCanvas;
  } else {
    canvas = previewCanvas;
  }

  const baseName = window.sourceFilename || "amiga-converted";

  if (currentPalette.length > 0) {
    // Create indexed PNG with exact palette
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Create indexed pixel array by mapping each pixel to palette index
    const indexed = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Find closest palette color
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let j = 0; j < currentPalette.length; j++) {
        const dr = r - currentPalette[j].r;
        const dg = g - currentPalette[j].g;
        const db = b - currentPalette[j].b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }
      indexed[i / 4] = bestIdx;
    }

    // Create indexed PNG
    const pngData = createIndexedPNG(
      canvas.width,
      canvas.height,
      indexed,
      currentPalette,
    );

    const blob = new Blob([pngData], { type: "image/png" });
    await saveFileWithPicker(blob, `${baseName}.png`);
  } else {
    // Fallback to RGB PNG if no palette available
    const dataUrl = canvas.toDataURL();
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    await saveFileWithPicker(blob, `${baseName}.png`);
  }
});

// Reset all button
document.getElementById("resetAllBtn").addEventListener("click", () => {
  // Reset only adjustment sliders (not curves or conversion options)
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

  // Trigger conversion if image is loaded
  if (window.sourceImage) {
    convertImage();
  }
});

// Settings save/load functions
function gatherSettings() {
  return {
    version: 1,
    conversion: {
      colors: parseInt(document.getElementById("colors").value),
      quantMethod: document.getElementById("quantMethod").value,
      colorDistance: document.getElementById("colorDistance").value,
      ditherMethod: document.getElementById("ditherMethod").value,
      bayerSize: document.getElementById("bayerSize").value,
      ditherAmount: parseFloat(document.getElementById("ditherAmount").value),
      errorDampeningEnabled: document.getElementById("errorDampeningEnabled").checked,
      errorDampeningThreshold: parseInt(document.getElementById("errorDampeningThreshold").value),
    },
    curves: {
      rgb: curvesEditor.curves.rgb.map(p => [...p]),
      red: curvesEditor.curves.red.map(p => [...p]),
      green: curvesEditor.curves.green.map(p => [...p]),
      blue: curvesEditor.curves.blue.map(p => [...p]),
    },
    adjustments: {
      contrast: parseInt(document.getElementById("contrast").value),
      hue: parseInt(document.getElementById("hue").value),
      saturation: parseInt(document.getElementById("saturation").value),
      brightness: parseInt(document.getElementById("brightness").value),
      gamma: parseFloat(document.getElementById("gamma").value),
    },
    matteColor: document.getElementById("matteColorInput").value,
  };
}

function applySettings(settings) {
  if (!settings || typeof settings !== 'object') {
    alert('Invalid settings file');
    return false;
  }

  // Conversion settings
  if (settings.conversion) {
    const c = settings.conversion;
    if (c.colors !== undefined) {
      document.getElementById("colors").value = c.colors;
      document.getElementById("colorsNumber").value = c.colors;
    }
    if (c.quantMethod !== undefined) {
      document.getElementById("quantMethod").value = c.quantMethod;
    }
    if (c.colorDistance !== undefined) {
      document.getElementById("colorDistance").value = c.colorDistance;
    }
    if (c.ditherMethod !== undefined) {
      document.getElementById("ditherMethod").value = c.ditherMethod;
      // Update visibility of related controls
      const method = c.ditherMethod;
      const isErrorDiffusion = method !== "ordered" && method !== "none";
      document.getElementById("bayerSizeControl").style.display = method === "ordered" ? "block" : "none";
      document.getElementById("ditherAmountControl").style.display = method === "none" ? "none" : "block";
      document.getElementById("errorDampeningControl").style.display = isErrorDiffusion ? "block" : "none";
    }
    if (c.bayerSize !== undefined) {
      document.getElementById("bayerSize").value = c.bayerSize;
    }
    if (c.ditherAmount !== undefined) {
      document.getElementById("ditherAmount").value = c.ditherAmount;
      document.getElementById("ditherAmountNumber").value = c.ditherAmount;
    }
    if (c.errorDampeningEnabled !== undefined) {
      document.getElementById("errorDampeningEnabled").checked = c.errorDampeningEnabled;
    }
    if (c.errorDampeningThreshold !== undefined) {
      document.getElementById("errorDampeningThreshold").value = c.errorDampeningThreshold;
      document.getElementById("errorDampeningThresholdNumber").value = c.errorDampeningThreshold;
    }
  }

  // Curves
  if (settings.curves) {
    if (settings.curves.rgb) curvesEditor.curves.rgb = settings.curves.rgb.map(p => [...p]);
    if (settings.curves.red) curvesEditor.curves.red = settings.curves.red.map(p => [...p]);
    if (settings.curves.green) curvesEditor.curves.green = settings.curves.green.map(p => [...p]);
    if (settings.curves.blue) curvesEditor.curves.blue = settings.curves.blue.map(p => [...p]);
    curvesEditor.selectedPoint = null;
    curvesEditor.draw();
  }

  // Adjustments
  if (settings.adjustments) {
    const a = settings.adjustments;
    if (a.contrast !== undefined) {
      document.getElementById("contrast").value = a.contrast;
      document.getElementById("contrastNumber").value = a.contrast;
    }
    if (a.hue !== undefined) {
      document.getElementById("hue").value = a.hue;
      document.getElementById("hueNumber").value = a.hue;
    }
    if (a.saturation !== undefined) {
      document.getElementById("saturation").value = a.saturation;
      document.getElementById("saturationNumber").value = a.saturation;
    }
    if (a.brightness !== undefined) {
      document.getElementById("brightness").value = a.brightness;
      document.getElementById("brightnessNumber").value = a.brightness;
    }
    if (a.gamma !== undefined) {
      document.getElementById("gamma").value = a.gamma;
      document.getElementById("gammaNumber").value = a.gamma;
    }
  }

  // Matte color
  if (settings.matteColor !== undefined) {
    document.getElementById("matteColorInput").value = settings.matteColor;
  }

  // Update control group heights for any visibility changes
  document.querySelectorAll(".control-group-content").forEach(content => {
    const group = content.closest(".control-group");
    if (group && !group.classList.contains("collapsed")) {
      content.style.maxHeight = content.scrollHeight + "px";
    }
  });

  return true;
}

// Save Settings button
document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  const settings = gatherSettings();
  const json = JSON.stringify(settings, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  await saveFileWithPicker(blob, "amiga-converter-settings.json", [{
    description: 'JSON Files',
    accept: { 'application/json': ['.json'] }
  }]);
});

// Load Settings button
document.getElementById("loadSettingsBtn").addEventListener("click", async () => {
  const file = await openFileWithPicker(
    document.getElementById("settingsInput"),
    [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
  );
  if (file) {
    try {
      const text = await file.text();
      const settings = JSON.parse(text);
      if (applySettings(settings) && window.sourceImage) {
        convertImage();
      }
    } catch (e) {
      alert('Failed to load settings: ' + e.message);
    }
  }
});

// Settings input fallback (for browsers without File System Access API)
document.getElementById("settingsInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const settings = JSON.parse(text);
    if (applySettings(settings) && window.sourceImage) {
      convertImage();
    }
  } catch (err) {
    alert('Failed to load settings: ' + err.message);
  }

  e.target.value = "";
});

// Initialize curves editor
curvesEditor.init();

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

  // Set initial max-height
  const group = h3.parentElement;
  const content = group.querySelector(".control-group-content");
  if (content && !group.classList.contains("collapsed")) {
    content.style.maxHeight = content.scrollHeight + "px";
  }
});

// Sync slider and number inputs
function setupSliderNumberSync(sliderId, numberId) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);

  if (!slider || !number) return;

  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);

  slider.addEventListener("input", () => {
    number.value = slider.value;
    number.style.borderColor = ""; // Clear any error state
  });

  // Allow typing but don't update slider until valid
  number.addEventListener("input", () => {
    const value = parseFloat(number.value);

    if (isNaN(value) || value < min || value > max) {
      // Invalid value - show visual feedback but allow typing
      number.style.borderColor = "#ff4a4a";
    } else {
      // Valid value - update slider and trigger conversion
      number.style.borderColor = "";
      slider.value = number.value;
      slider.dispatchEvent(new Event("input"));
    }
  });

  // On blur, enforce valid value
  number.addEventListener("blur", () => {
    const value = parseFloat(number.value);

    if (isNaN(value) || value < min || value > max) {
      // Reset to slider value if invalid
      number.value = slider.value;
      number.style.borderColor = "";
    }
  });
}

setupSliderNumberSync("brightness", "brightnessNumber");
setupSliderNumberSync("contrast", "contrastNumber");
setupSliderNumberSync("saturation", "saturationNumber");
setupSliderNumberSync("hue", "hueNumber");
setupSliderNumberSync("gamma", "gammaNumber");
setupSliderNumberSync("colors", "colorsNumber");
setupSliderNumberSync("ditherAmount", "ditherAmountNumber");
setupSliderNumberSync("errorDampeningThreshold", "errorDampeningThresholdNumber");

// Double-click to reset sliders to default values
const sliderDefaults = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  gamma: 1,
  colors: 32,
  ditherAmount: 0.5,
  errorDampeningThreshold: 48,
};

Object.entries(sliderDefaults).forEach(([sliderId, defaultValue]) => {
  const slider = document.getElementById(sliderId);
  const numberId = sliderId + "Number";
  const number = document.getElementById(numberId);

  if (slider) {
    slider.addEventListener("dblclick", () => {
      slider.value = defaultValue;
      if (number) {
        number.value = defaultValue;
      }
      slider.dispatchEvent(new Event("input"));
    });
  }
});

// Track mouse on preview canvas to highlight palette color
document.getElementById("previewCanvas").addEventListener("mousemove", (e) => {
  const canvas = document.getElementById("previewCanvas");
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

  const ctx = canvas.getContext("2d");
  const pixel = ctx.getImageData(x, y, 1, 1).data;

  // Convert to 12-bit format for comparison
  const r4bit = Math.floor(pixel[0] / 17).toString(16);
  const g4bit = Math.floor(pixel[1] / 17).toString(16);
  const b4bit = Math.floor(pixel[2] / 17).toString(16);
  const pixelColor12bit = `#${r4bit}${g4bit}${b4bit}`.toUpperCase();

  // Find matching palette color
  document.querySelectorAll(".palette-color").forEach((el) => {
    if (el.dataset.rgb === pixelColor12bit) {
      el.classList.add("highlighted");
    } else {
      el.classList.remove("highlighted");
    }
  });
});

document.getElementById("previewCanvas").addEventListener("mouseleave", () => {
  document.querySelectorAll(".palette-color").forEach((el) => {
    el.classList.remove("highlighted");
  });
});

// Click preview canvas to lock color
document.getElementById("previewCanvas").addEventListener("click", (e) => {
  const canvas = document.getElementById("previewCanvas");
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

  const ctx = canvas.getContext("2d");
  const pixel = ctx.getImageData(x, y, 1, 1).data;

  // Convert to full hex format for locking
  const hexR = pixel[0].toString(16).padStart(2, "0");
  const hexG = pixel[1].toString(16).padStart(2, "0");
  const hexB = pixel[2].toString(16).padStart(2, "0");
  const hexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();

  // Lock/unlock the color
  if (lockedColors.has(hexColor)) {
    lockedColors.delete(hexColor);
    if (window.sourceImage) {
      convertImage();
    }
  } else {
    lockedColors.add(hexColor);
    // Update palette display to show locked state
    document.querySelectorAll(".palette-color").forEach((el) => {
      if (el.dataset.rgbFull === hexColor) {
        el.classList.add("locked");
      }
    });
  }
});

// Click original canvas to add/remove custom color
document.getElementById("originalCanvas").addEventListener("click", (e) => {
  const originalCanvas = document.getElementById("originalCanvas");
  const rect = originalCanvas.getBoundingClientRect();
  const x = Math.floor(
    (e.clientX - rect.left) * (originalCanvas.width / rect.width),
  );
  const y = Math.floor(
    (e.clientY - rect.top) * (originalCanvas.height / rect.height),
  );

  // Get the color from the original canvas
  const ctx = originalCanvas.getContext("2d");
  const pixel = ctx.getImageData(x, y, 1, 1).data;

  // Apply curves adjustments to get the adjusted color
  let r = pixel[0];
  let g = pixel[1];
  let b = pixel[2];

  // Apply curves if available
  if (typeof curvesEditor !== "undefined" && curvesEditor.applyToPixel) {
    const adjusted = curvesEditor.applyToPixel(r, g, b);
    r = adjusted.r;
    g = adjusted.g;
    b = adjusted.b;
  }

  // Apply brightness/contrast/saturation/gamma adjustments
  const brightness = parseInt(document.getElementById("brightness").value);
  const contrast = parseInt(document.getElementById("contrast").value);
  const saturation = parseInt(document.getElementById("saturation").value);
  const gamma = parseFloat(document.getElementById("gamma").value);

  // Apply brightness
  r += brightness;
  g += brightness;
  b += brightness;

  // Apply contrast
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  r = contrastFactor * (r - 128) + 128;
  g = contrastFactor * (g - 128) + 128;
  b = contrastFactor * (b - 128) + 128;

  // Apply saturation
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  const satFactor = 1 + saturation / 100;
  r = gray + (r - gray) * satFactor;
  g = gray + (g - gray) * satFactor;
  b = gray + (b - gray) * satFactor;

  // Apply gamma
  r = 255 * Math.pow(r / 255, 1 / gamma);
  g = 255 * Math.pow(g / 255, 1 / gamma);
  b = 255 * Math.pow(b / 255, 1 / gamma);

  // Clamp to valid range
  r = Math.max(0, Math.min(255, Math.round(r)));
  g = Math.max(0, Math.min(255, Math.round(g)));
  b = Math.max(0, Math.min(255, Math.round(b)));

  // Convert to 12-bit color (4 bits per channel)
  const r12bit = Math.round(r / 17) * 17;
  const g12bit = Math.round(g / 17) * 17;
  const b12bit = Math.round(b / 17) * 17;

  // Convert to full hex format
  const hexR = r12bit.toString(16).padStart(2, "0");
  const hexG = g12bit.toString(16).padStart(2, "0");
  const hexB = b12bit.toString(16).padStart(2, "0");
  const hexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();

  // Toggle locked state
  if (lockedColors.has(hexColor)) {
    lockedColors.delete(hexColor);
  } else {
    lockedColors.add(hexColor);
  }

  // Reconvert to apply changes
  if (window.sourceImage) {
    convertImage();
  }
});

// Click slide preview canvas to lock color
document.getElementById("slidePreviewCanvas").addEventListener("click", (e) => {
  const canvas = document.getElementById("slidePreviewCanvas");
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

  const ctx = canvas.getContext("2d");
  const pixel = ctx.getImageData(x, y, 1, 1).data;

  // Convert to full hex format for locking
  const hexR = pixel[0].toString(16).padStart(2, "0");
  const hexG = pixel[1].toString(16).padStart(2, "0");
  const hexB = pixel[2].toString(16).padStart(2, "0");
  const hexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();

  // Lock/unlock the color
  if (lockedColors.has(hexColor)) {
    lockedColors.delete(hexColor);
    if (window.sourceImage) {
      convertImage();
    }
  } else {
    lockedColors.add(hexColor);
    // Update palette display to show locked state
    document.querySelectorAll(".palette-color").forEach((el) => {
      if (el.dataset.rgbFull === hexColor) {
        el.classList.add("locked");
      }
    });
  }
});

// Click slide original canvas to add/remove custom color
document
  .getElementById("slideOriginalCanvas")
  .addEventListener("click", (e) => {
    const slideOriginalCanvas = document.getElementById("slideOriginalCanvas");
    const rect = slideOriginalCanvas.getBoundingClientRect();
    const x = Math.floor(
      (e.clientX - rect.left) * (slideOriginalCanvas.width / rect.width),
    );
    const y = Math.floor(
      (e.clientY - rect.top) * (slideOriginalCanvas.height / rect.height),
    );

    // Get the color from the original canvas
    const ctx = slideOriginalCanvas.getContext("2d");
    const pixel = ctx.getImageData(x, y, 1, 1).data;

    // Apply curves adjustments to get the adjusted color
    let r = pixel[0];
    let g = pixel[1];
    let b = pixel[2];

    // Apply curves if available
    if (typeof curvesEditor !== "undefined" && curvesEditor.applyToPixel) {
      const adjusted = curvesEditor.applyToPixel(r, g, b);
      r = adjusted.r;
      g = adjusted.g;
      b = adjusted.b;
    }

    // Apply brightness/contrast/saturation/gamma adjustments
    const brightness = parseInt(document.getElementById("brightness").value);
    const contrast = parseInt(document.getElementById("contrast").value);
    const saturation = parseInt(document.getElementById("saturation").value);
    const gamma = parseFloat(document.getElementById("gamma").value);

    // Apply brightness
    r += brightness;
    g += brightness;
    b += brightness;

    // Apply contrast
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // Apply saturation
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const satFactor = 1 + saturation / 100;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;

    // Apply gamma
    r = 255 * Math.pow(r / 255, 1 / gamma);
    g = 255 * Math.pow(g / 255, 1 / gamma);
    b = 255 * Math.pow(b / 255, 1 / gamma);

    // Clamp to valid range
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));

    // Convert to 12-bit color (4 bits per channel)
    const r12bit = Math.round(r / 17) * 17;
    const g12bit = Math.round(g / 17) * 17;
    const b12bit = Math.round(b / 17) * 17;

    // Convert to full hex format
    const hexR = r12bit.toString(16).padStart(2, "0");
    const hexG = g12bit.toString(16).padStart(2, "0");
    const hexB = b12bit.toString(16).padStart(2, "0");
    const hexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();

    // Toggle locked state
    if (lockedColors.has(hexColor)) {
      lockedColors.delete(hexColor);
    } else {
      lockedColors.add(hexColor);
    }

    // Reconvert to apply changes
    if (window.sourceImage) {
      convertImage();
    }
  });

// Add color button
document.getElementById("addColorBtn").addEventListener("click", () => {
  document.getElementById("addColorModal").classList.add("active");
  document.getElementById("customColorInput").value = "";
  document.getElementById("customColorInput").focus();
});

document.getElementById("cancelAddColor").addEventListener("click", () => {
  document.getElementById("addColorModal").classList.remove("active");
});

document.getElementById("confirmAddColor").addEventListener("click", () => {
  addCustomColor();
});

document
  .getElementById("customColorInput")
  .addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      addCustomColor();
    }
  });

function addCustomColor() {
  const input = document.getElementById("customColorInput").value.trim();
  let hex = null;

  // Match 3-digit or 6-digit hex
  const hex3Match = input.match(/^#?([0-9A-Fa-f]{3})$/);
  const hex6Match = input.match(/^#?([0-9A-Fa-f]{6})$/);

  if (hex3Match) {
    // Expand 3-digit to 6-digit by duplicating each digit
    const [r, g, b] = hex3Match[1].split("");
    hex = `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  } else if (hex6Match) {
    hex = "#" + hex6Match[1].toUpperCase();
  }

  if (hex) {
    lockedColors.add(hex);
    document.getElementById("addColorModal").classList.remove("active");
    if (window.sourceImage) {
      convertImage();
    }
  } else {
    alert("Please enter a valid hex color (e.g., #F03 or #FF0033)");
  }
}

// Lock all button
document.getElementById("lockAllBtn").addEventListener("click", () => {
  currentPalette.forEach((color) => {
    const hexR = color.r.toString(16).padStart(2, "0");
    const hexG = color.g.toString(16).padStart(2, "0");
    const hexB = color.b.toString(16).padStart(2, "0");
    const hexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();
    lockedColors.add(hexColor);
  });
  if (window.sourceImage) {
    convertImage();
  }
});

// Clear locks button
document.getElementById("clearLocksBtn").addEventListener("click", () => {
  lockedColors.clear();
  if (window.sourceImage) {
    convertImage();
  }
});

// Load palette from PNG
document.getElementById("loadPaletteBtn").addEventListener("click", async () => {
  const file = await openFileWithPicker(
    document.getElementById("paletteInput"),
    [{ description: 'PNG Images', accept: { 'image/png': ['.png'] } }]
  );
  if (file) loadPaletteFromPNG(file);
});

document.getElementById("paletteInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  loadPaletteFromPNG(file);
  e.target.value = ""; // Clear selection
});

async function loadPaletteFromPNG(file) {
  try {
    // Read file as ArrayBuffer for PNG chunk parsing
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Validate PNG signature
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < pngSignature.length; i++) {
      if (bytes[i] !== pngSignature[i]) {
        alert("Invalid PNG file");
        return;
      }
    }

    // Try to extract PLTE chunk (palette for indexed PNGs)
    const palette = extractPLTEChunk(bytes);

    if (palette && palette.length > 0) {
      // Indexed PNG - use PLTE palette
      applyLoadedPalette(
        palette,
        `Loaded ${palette.length} colors from indexed PNG palette`,
      );
    } else {
      // Non-indexed PNG - scan for unique colors
      const scannedPalette = await extractUniqueColors(file);
      if (scannedPalette) {
        applyLoadedPalette(
          scannedPalette,
          `Loaded ${scannedPalette.length} unique colors from image`,
        );
      }
    }
  } catch (error) {
    console.error("Error loading palette:", error);
    alert("Error loading palette from PNG");
  }
}

function extractPLTEChunk(bytes) {
  let offset = 8; // Skip PNG signature

  while (offset < bytes.length) {
    // Read chunk length (4 bytes, big-endian)
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    offset += 4;

    // Read chunk type (4 bytes)
    const type = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    offset += 4;

    if (type === "PLTE") {
      // Found palette chunk - extract RGB triplets
      const palette = [];
      const numColors = length / 3;

      for (let i = 0; i < numColors; i++) {
        const r = bytes[offset + i * 3];
        const g = bytes[offset + i * 3 + 1];
        const b = bytes[offset + i * 3 + 2];

        // Quantize to 12-bit (Amiga format)
        palette.push({
          r: quantize4bit(r),
          g: quantize4bit(g),
          b: quantize4bit(b),
        });
      }

      return palette;
    }

    // Skip chunk data and CRC (4 bytes)
    offset += length + 4;

    // Stop at IEND chunk
    if (type === "IEND") break;
  }

  return null; // No PLTE chunk found
}

async function extractUniqueColors(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        // Draw to temporary canvas
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Collect unique colors (preserve first-occurrence order)
        const uniqueColors = [];
        const colorSet = new Set();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Skip fully transparent pixels
          if (a === 0) continue;

          // Create unique key
          const key = `${r},${g},${b}`;

          if (!colorSet.has(key)) {
            colorSet.add(key);
            uniqueColors.push({
              r: quantize4bit(r),
              g: quantize4bit(g),
              b: quantize4bit(b),
            });
          }

          // Stop if too many colors
          if (uniqueColors.length > 256) {
            alert(
              "Image has more than 256 unique colors. Please use an image with 256 or fewer colors.",
            );
            resolve(null);
            return;
          }
        }

        resolve(uniqueColors);
      };

      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function applyLoadedPalette(palette, message) {
  // Clear existing locks
  lockedColors.clear();

  // Add all palette colors to locked set
  palette.forEach((color) => {
    const hexR = color.r.toString(16).padStart(2, "0");
    const hexG = color.g.toString(16).padStart(2, "0");
    const hexB = color.b.toString(16).padStart(2, "0");
    const hexColor = `#${hexR}${hexG}${hexB}`.toUpperCase();
    lockedColors.add(hexColor);
  });

  // Update color count to match palette size
  const colorCount = palette.length;
  document.getElementById("colors").value = colorCount;
  document.getElementById("colorsNumber").value = colorCount;

  // Show success message
  alert(message);

  // Trigger conversion if image is loaded
  if (window.sourceImage) {
    convertImage();
  }
}

// Close modal on background click
document.getElementById("addColorModal").addEventListener("click", (e) => {
  if (e.target.id === "addColorModal") {
    document.getElementById("addColorModal").classList.remove("active");
  }
});

// Aspect ratio lock functionality
let lastEditedDimension = null;

document.getElementById("resizeWidth").addEventListener("input", (e) => {
  lastEditedDimension = "width";
  const aspectLocked = document.getElementById("aspectRatioLock").checked;

  if (aspectLocked && window.sourceAspectRatio) {
    const newWidth = parseInt(e.target.value);
    if (!isNaN(newWidth) && newWidth > 0) {
      const newHeight = Math.round(newWidth / window.sourceAspectRatio);
      document.getElementById("resizeHeight").value = newHeight;
    }
  }
});

document.getElementById("resizeHeight").addEventListener("input", (e) => {
  lastEditedDimension = "height";
  const aspectLocked = document.getElementById("aspectRatioLock").checked;

  if (aspectLocked && window.sourceAspectRatio) {
    const newHeight = parseInt(e.target.value);
    if (!isNaN(newHeight) && newHeight > 0) {
      const newWidth = Math.round(newHeight * window.sourceAspectRatio);
      document.getElementById("resizeWidth").value = newWidth;
    }
  }
});

// Trigger conversion when dimension values change (on blur or enter)
document.getElementById("resizeWidth").addEventListener("change", () => {
  if (window.sourceImage) {
    convertImage();
  }
});

document.getElementById("resizeHeight").addEventListener("change", () => {
  if (window.sourceImage) {
    convertImage();
  }
});

// Handle aspect ratio lock toggle
document.getElementById("aspectRatioLock").addEventListener("change", (e) => {
  if (e.target.checked && window.sourceAspectRatio) {
    // When locking, update based on the last edited dimension
    const widthInput = document.getElementById("resizeWidth");
    const heightInput = document.getElementById("resizeHeight");

    if (lastEditedDimension === "width") {
      const width = parseInt(widthInput.value);
      if (!isNaN(width) && width > 0) {
        heightInput.value = Math.round(width / window.sourceAspectRatio);
      }
    } else {
      const height = parseInt(heightInput.value);
      if (!isNaN(height) && height > 0) {
        widthInput.value = Math.round(height * window.sourceAspectRatio);
      }
    }
  }
});

// Web Worker setup for non-blocking image processing
let conversionWorker = null;
let currentConversionId = 0;
let conversionInProgress = false;
let pendingConversion = false;

function initWorker() {
  if (conversionWorker) return;

  conversionWorker = new Worker("worker.js");

  conversionWorker.addEventListener("message", function (e) {
    const { id, imageData, palette, success, error } = e.data;

    // Mark conversion as complete
    conversionInProgress = false;

    // Ignore stale results
    if (id !== currentConversionId) {
      // If there's a pending conversion, start it now
      if (pendingConversion) {
        pendingConversion = false;
        convertImage();
      }
      return;
    }

    if (!success) {
      console.error("Worker error:", error);
      // If there's a pending conversion, start it now
      if (pendingConversion) {
        pendingConversion = false;
        convertImage();
      }
      return;
    }

    // Get canvases
    const previewCanvas = document.getElementById("previewCanvas");
    const slidePreviewCanvas = document.getElementById("slidePreviewCanvas");

    // Create ImageData and draw to canvases
    const processedImageData = new ImageData(
      new Uint8ClampedArray(imageData),
      previewCanvas.width,
      previewCanvas.height,
    );

    const previewCtx = previewCanvas.getContext("2d");
    previewCtx.putImageData(processedImageData, 0, 0);

    const slidePreviewCtx = slidePreviewCanvas.getContext("2d");
    slidePreviewCtx.putImageData(processedImageData, 0, 0);

    // Display palette
    displayPalette(palette);

    // Update view mode
    updateViewMode();

    // Enable download
    document.getElementById("downloadBtn").disabled = false;

    // If there's a pending conversion, start it now
    if (pendingConversion) {
      pendingConversion = false;
      convertImage();
    }
  });

  conversionWorker.addEventListener("error", function (e) {
    console.error("Worker error:", e);
    conversionInProgress = false;
    // If there's a pending conversion, start it now
    if (pendingConversion) {
      pendingConversion = false;
      convertImage();
    }
  });
}

// Initialize worker on page load
initWorker();
