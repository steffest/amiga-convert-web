// Web Worker for image processing
// This runs in a background thread to keep the UI responsive

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
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
}

function colorDistanceRedmean(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const rmean = (r1 + r2) / 2;
  return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db;
}

function rgbToXYZ(r, g, b) {
  r = r / 255;
  g = g / 255;
  b = b / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  return [x * 100, y * 100, z * 100];
}

function xyzToLAB(x, y, z) {
  const refX = 95.047;
  const refY = 100.000;
  const refZ = 108.883;

  x = x / refX;
  y = y / refY;
  z = z / refZ;

  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);

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

// Optimized LAB distance when one color is already in LAB
function colorDistanceLABPrecomputed(r1, g1, b1, L2, a2, b2_lab) {
  const [x1, y1, z1] = rgbToXYZ(r1, g1, b1);
  const [L1, a1, b1_lab] = xyzToLAB(x1, y1, z1);

  const dL = L1 - L2;
  const da = a1 - a2;
  const db = b1_lab - b2_lab;

  return dL * dL + da * da + db * db;
}

// Convert palette to LAB color space for faster distance calculations
function convertPaletteToLAB(palette) {
  return palette.map(color => {
    const [x, y, z] = rgbToXYZ(color.r, color.g, color.b);
    const [L, a, b] = xyzToLAB(x, y, z);
    return { r: color.r, g: color.g, b: color.b, labL: L, labA: a, labB: b };
  });
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

// RGB to HSL conversion
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
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
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [r * 255, g * 255, b * 255];
}

// Apply curves to image data
function applyCurves(imageData, curvesLUTs) {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Apply RGB curve first, then individual channel curves
    data[i] = curvesLUTs.red[curvesLUTs.rgb[data[i]]];
    data[i + 1] = curvesLUTs.green[curvesLUTs.rgb[data[i + 1]]];
    data[i + 2] = curvesLUTs.blue[curvesLUTs.rgb[data[i + 2]]];
  }

  return imageData;
}

// Apply adjustments (brightness, contrast, saturation, hue, gamma)
// params: { brightness, contrast, saturation, hue, gamma, curvesLUTs, alphaMode, alphaThreshold, matteColor }
function applyAdjustments(imageData, params) {
  const { brightness, contrast, saturation, hue, gamma, curvesLUTs, alphaMode, alphaThreshold, matteColor } = params;
  const data = imageData.data;

  // Apply curves first
  if (curvesLUTs) {
    imageData = applyCurves(imageData, curvesLUTs);
  }

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
    r = Math.pow(r / 255, 1 / gamma) * 255;
    g = Math.pow(g / 255, 1 / gamma) * 255;
    b = Math.pow(b / 255, 1 / gamma) * 255;

    // Clamp
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  // Handle alpha based on mode
  if (alphaMode === 'threshold') {
    // Threshold mode: pixels below threshold become fully transparent, above become fully opaque
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < alphaThreshold) {
        // Below threshold: fully transparent
        data[i + 3] = 0;
      } else {
        // At or above threshold: fully opaque
        data[i + 3] = 255;
      }
    }
  } else if (matteColor) {
    // Matte mode: composite semi-transparent pixels onto matte color
    const mr = matteColor.r;
    const mg = matteColor.g;
    const mb = matteColor.b;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;

      if (alpha < 1) {
        // Composite: result = source * alpha + matte * (1 - alpha)
        data[i] = data[i] * alpha + mr * (1 - alpha);
        data[i + 1] = data[i + 1] * alpha + mg * (1 - alpha);
        data[i + 2] = data[i + 2] * alpha + mb * (1 - alpha);
        data[i + 3] = 255; // Set to fully opaque
      }
    }
  }

  return imageData;
}

// Median Cut quantization
function medianCut(pixels, colorCount) {
  let boxes = [{ pixels: pixels }];

  while (boxes.length < colorCount) {
    let maxVolume = -1;
    let maxIdx = 0;

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (box.pixels.length <= 1) continue;

      let rMin = 255, rMax = 0;
      let gMin = 255, gMax = 0;
      let bMin = 255, bMax = 0;

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

    if (maxVolume === 0) break;

    const box = boxes[maxIdx];
    let rMin = 255, rMax = 0;
    let gMin = 255, gMax = 0;
    let bMin = 255, bMax = 0;

    for (const pixel of box.pixels) {
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

    let sortKey;
    if (rRange >= gRange && rRange >= bRange) {
      sortKey = "r";
    } else if (gRange >= bRange) {
      sortKey = "g";
    } else {
      sortKey = "b";
    }

    box.pixels.sort((a, b) => a[sortKey] - b[sortKey]);

    const median = Math.floor(box.pixels.length / 2);
    const box1 = { pixels: box.pixels.slice(0, median) };
    const box2 = { pixels: box.pixels.slice(median) };

    boxes.splice(maxIdx, 1, box1, box2);
  }

  return boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const pixel of box.pixels) {
      r += pixel.r;
      g += pixel.g;
      b += pixel.b;
    }
    const count = box.pixels.length;
    return {
      r: quantize4bit(Math.round(r / count)),
      g: quantize4bit(Math.round(g / count)),
      b: quantize4bit(Math.round(b / count)),
    };
  });
}

// Wu quantization
function wuQuantization(imageData, colorCount, metric) {
  const data = imageData.data;
  const pixels = [];

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

// Seeded random for NeuQuant
function seededRandom(seed) {
  let state = seed;
  return function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// NeuQuant (k-means clustering)
function neuQuantization(imageData, colorCount, metric) {
  const data = imageData.data;
  const pixels = [];

  const step = Math.max(1, Math.floor(data.length / (4 * 5000)));
  for (let i = 0; i < data.length; i += 4 * step) {
    pixels.push({
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
    });
  }

  if (pixels.length === 0) {
    return [{ r: 0, g: 0, b: 0 }];
  }

  const random = seededRandom(12345);
  const centroids = [];

  // First centroid: random pixel
  centroids.push({ ...pixels[Math.floor(random() * pixels.length)] });

  // Remaining centroids using k-means++ algorithm
  while (centroids.length < colorCount) {
    const distances = pixels.map((pixel) => {
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = getColorDistance(
          pixel.r, pixel.g, pixel.b,
          centroid.r, centroid.g, centroid.b,
          metric
        );
        minDist = Math.min(minDist, dist);
      }
      return minDist;
    });

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
    const clusters = Array(colorCount).fill(null).map(() => []);

    for (const pixel of pixels) {
      let minDist = Infinity;
      let bestIdx = 0;

      for (let i = 0; i < centroids.length; i++) {
        const dist = getColorDistance(
          pixel.r, pixel.g, pixel.b,
          centroids[i].r, centroids[i].g, centroids[i].b,
          metric
        );

        if (dist < minDist) {
          minDist = dist;
          bestIdx = i;
        }
      }

      clusters[bestIdx].push(pixel);
    }

    let changed = false;
    for (let i = 0; i < centroids.length; i++) {
      if (clusters[i].length > 0) {
        let r = 0, g = 0, b = 0;
        for (const pixel of clusters[i]) {
          r += pixel.r;
          g += pixel.g;
          b += pixel.b;
        }
        const count = clusters[i].length;
        const newR = r / count;
        const newG = g / count;
        const newB = b / count;

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

    if (!changed) break;
  }

  return centroids.map((c) => ({
    r: quantize4bit(Math.round(c.r)),
    g: quantize4bit(Math.round(c.g)),
    b: quantize4bit(Math.round(c.b)),
  }));
}

// RGB Quantization
function rgbQuantization(imageData, colorCount, metric) {
  const data = imageData.data;
  const colorMap = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const r = quantize4bit(data[i]);
    const g = quantize4bit(data[i + 1]);
    const b = quantize4bit(data[i + 2]);
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  const colors = Array.from(colorMap.entries()).map(([key, count]) => {
    const [r, g, b] = key.split(",").map(Number);
    return { r, g, b, count };
  });

  if (colors.length <= colorCount) {
    return colors;
  }

  colors.sort((a, b) => b.count - a.count);

  const palette = [colors[0]];

  while (palette.length < colorCount) {
    let bestCandidate = null;
    let bestScore = -1;

    for (const candidate of colors) {
      if (
        palette.some(
          (p) =>
            p.r === candidate.r && p.g === candidate.g && p.b === candidate.b,
        )
      ) {
        continue;
      }

      let minDist = Infinity;
      for (const existing of palette) {
        const dist = getColorDistance(
          candidate.r, candidate.g, candidate.b,
          existing.r, existing.g, existing.b,
          metric
        );
        minDist = Math.min(minDist, dist);
      }

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

// Select best locked colors based on usage
function selectBestLockedColors(imageData, lockedPalette, colorCount, metric) {
  const data = imageData.data;
  const colorUsage = lockedPalette.map(() => 0);

  // Pre-compute LAB values for locked palette if using LAB metric
  if (metric === "cie76-lab") {
    lockedPalette = convertPaletteToLAB(lockedPalette);
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let minDist = Infinity;
    let closestIdx = 0;

    // Optimized LAB distance with pre-computed palette
    if (metric === "cie76-lab") {
      const [x, y, z] = rgbToXYZ(r, g, b);
      const [L, a, bLab] = xyzToLAB(x, y, z);

      for (let j = 0; j < lockedPalette.length; j++) {
        const color = lockedPalette[j];
        const dL = L - color.labL;
        const da = a - color.labA;
        const db = bLab - color.labB;
        const dist = dL * dL + da * da + db * db;

        if (dist < minDist) {
          minDist = dist;
          closestIdx = j;
        }
      }
    } else {
      for (let j = 0; j < lockedPalette.length; j++) {
        const color = lockedPalette[j];
        const dist = getColorDistance(r, g, b, color.r, color.g, color.b, metric);

        if (dist < minDist) {
          minDist = dist;
          closestIdx = j;
        }
      }
    }

    colorUsage[closestIdx]++;
  }

  const colorsWithUsage = lockedPalette.map((color, idx) => ({
    color,
    usage: colorUsage[idx],
  }));

  colorsWithUsage.sort((a, b) => b.usage - a.usage);

  return colorsWithUsage.slice(0, colorCount).map(item => item.color);
}

// Build palette
// params: { colorCount, quantMethod, colorDistance, lockedColors }
function buildPalette(imageData, params) {
  const { colorCount, quantMethod: method, colorDistance: metric, lockedColors } = params;
  let palette;

  const lockedPalette = lockedColors.map(hex => {
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
    return lockedPalette;
  } else if (remainingColors < 0) {
    return selectBestLockedColors(imageData, lockedPalette, colorCount, metric);
  }

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

  const combinedPalette = [...lockedPalette, ...palette];

  const seen = new Set();
  const uniquePalette = [];
  for (const color of combinedPalette) {
    const key = `${color.r},${color.g},${color.b}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePalette.push(color);
    }
  }

  if (
    uniquePalette.length < colorCount &&
    uniquePalette.length < combinedPalette.length
  ) {
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

    const candidates = Array.from(imageColors).map((key) => {
      const [r, g, b] = key.split(",").map(Number);
      return { r, g, b };
    });

    while (uniquePalette.length < colorCount && candidates.length > 0) {
      let maxMinDist = -1;
      let bestIdx = 0;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        let minDist = Infinity;

        for (const existing of uniquePalette) {
          const dist = getColorDistance(
            candidate.r, candidate.g, candidate.b,
            existing.r, existing.g, existing.b,
            metric
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
function findNearestColor(r, g, b, palette, metric) {
  let minDist = Infinity;
  let bestColor = palette[0];

  // For LAB metric with pre-computed palette
  if (metric === "cie76-lab" && palette[0].labL !== undefined) {
    const [x, y, z] = rgbToXYZ(r, g, b);
    const [L, a, bLab] = xyzToLAB(x, y, z);

    for (const color of palette) {
      const dL = L - color.labL;
      const da = a - color.labA;
      const db = bLab - color.labB;
      const dist = dL * dL + da * da + db * db;

      if (dist < minDist) {
        minDist = dist;
        bestColor = color;
      }
    }
  } else {
    // Standard distance calculation
    for (const color of palette) {
      const dist = getColorDistance(r, g, b, color.r, color.g, color.b, metric);

      if (dist < minDist) {
        minDist = dist;
        bestColor = color;
      }
    }
  }

  return bestColor;
}

// Bayer matrix generation
function generateBayerMatrix(size) {
  if (size === 2) {
    return [
      [0, 2],
      [3, 1],
    ];
  }

  const smaller = generateBayerMatrix(size / 2);
  const matrix = [];

  for (let i = 0; i < size; i++) {
    matrix[i] = [];
    for (let j = 0; j < size; j++) {
      const si = Math.floor(i / 2);
      const sj = Math.floor(j / 2);
      const value = smaller[si][sj] * 4;

      if (i % 2 === 0 && j % 2 === 0) {
        matrix[i][j] = value + 0;
      } else if (i % 2 === 0 && j % 2 === 1) {
        matrix[i][j] = value + 2;
      } else if (i % 2 === 1 && j % 2 === 0) {
        matrix[i][j] = value + 3;
      } else {
        matrix[i][j] = value + 1;
      }
    }
  }

  return matrix;
}

// Apply dithering
// params: { ditherMethod, ditherAmount, bayerSize, colorDistance, errorDampening }
function applyDithering(imageData, palette, params) {
  const { ditherMethod: method, ditherAmount: amount, bayerSize, colorDistance: metric, errorDampening } = params;
  const width = imageData.width;
  const height = imageData.height;
  const data = new Int16Array(imageData.data);

  // Pre-compute LAB values for palette if using LAB metric (huge performance boost)
  if (metric === "cie76-lab") {
    palette = convertPaletteToLAB(palette);
  }

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
  } else {
    // Error diffusion dithering algorithms
    const diffusionMatrices = {
      "floyd-steinberg": [
        [1, 0, 7/16],
        [-1, 1, 3/16],
        [0, 1, 5/16],
        [1, 1, 1/16],
      ],
      "jarvis-judice-ninke": [
        [1, 0, 7/48], [2, 0, 5/48],
        [-2, 1, 3/48], [-1, 1, 5/48], [0, 1, 7/48], [1, 1, 5/48], [2, 1, 3/48],
        [-2, 2, 1/48], [-1, 2, 3/48], [0, 2, 5/48], [1, 2, 3/48], [2, 2, 1/48],
      ],
      "stucki": [
        [1, 0, 8/42], [2, 0, 4/42],
        [-2, 1, 2/42], [-1, 1, 4/42], [0, 1, 8/42], [1, 1, 4/42], [2, 1, 2/42],
        [-2, 2, 1/42], [-1, 2, 2/42], [0, 2, 4/42], [1, 2, 2/42], [2, 2, 1/42],
      ],
      "burkes": [
        [1, 0, 8/32], [2, 0, 4/32],
        [-2, 1, 2/32], [-1, 1, 4/32], [0, 1, 8/32], [1, 1, 4/32], [2, 1, 2/32],
      ],
      "sierra": [
        [1, 0, 5/32], [2, 0, 3/32],
        [-2, 1, 2/32], [-1, 1, 4/32], [0, 1, 5/32], [1, 1, 4/32], [2, 1, 2/32],
        [-1, 2, 2/32], [0, 2, 3/32], [1, 2, 2/32],
      ],
      "sierra-lite": [
        [1, 0, 2/4],
        [-1, 1, 1/4], [0, 1, 1/4],
      ],
      "atkinson": [
        [1, 0, 1/8], [2, 0, 1/8],
        [-1, 1, 1/8], [0, 1, 1/8], [1, 1, 1/8],
        [0, 2, 1/8],
      ],
    };

    const matrix = diffusionMatrices[method];

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

        let errR = (r - color.r) * amount;
        let errG = (g - color.g) * amount;
        let errB = (b - color.b) * amount;

        // Error dampening: if error magnitude exceeds threshold, dampen by 0.8
        // This suppresses bright, sparse pixels (technique from libimagequant)
        if (errorDampening !== null) {
          const errMagnitude = Math.sqrt(errR * errR + errG * errG + errB * errB);
          if (errMagnitude > errorDampening) {
            const dampenFactor = 0.8;
            errR *= dampenFactor;
            errG *= dampenFactor;
            errB *= dampenFactor;
          }
        }

        for (const [dx, dy, weight] of matrix) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = (ny * width + nx) * 4;
            data[nidx] += errR * weight;
            data[nidx + 1] += errG * weight;
            data[nidx + 2] += errB * weight;
          }
        }
      }
    }
  }

  for (let i = 0; i < imageData.data.length; i++) {
    imageData.data[i] = Math.max(0, Math.min(255, data[i]));
  }

  return imageData;
}

// Worker message handler
self.addEventListener('message', function(e) {
  const { id, imageData, width, height, params } = e.data;

  try {
    // Reconstruct ImageData
    const imgData = new ImageData(
      new Uint8ClampedArray(imageData),
      width,
      height
    );

    // Apply adjustments
    const adjusted = applyAdjustments(imgData, params);

    // Build palette
    const palette = buildPalette(adjusted, params);

    // Apply dithering
    const dithered = applyDithering(adjusted, palette, params);

    // Send result back
    self.postMessage({
      id,
      imageData: dithered.data,
      palette,
      success: true
    }, [dithered.data.buffer]);

  } catch (error) {
    self.postMessage({
      id,
      error: error.message,
      success: false
    });
  }
});
