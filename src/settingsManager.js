// Settings save/load manager

// Shared helper functions to read settings from DOM

export function getAdjustmentValues() {
  return {
    brightness: parseInt(document.getElementById("brightness").value),
    contrast: parseInt(document.getElementById("contrast").value),
    saturation: parseInt(document.getElementById("saturation").value),
    hue: parseInt(document.getElementById("hue").value),
    gamma: parseFloat(document.getElementById("gamma").value),
  };
}

export function getConversionValues() {
  return {
    colorCount: parseInt(document.getElementById("colors").value),
    quantMethod: document.getElementById("quantMethod").value,
    colorDistance: document.getElementById("colorDistance").value,
    ditherMethod: document.getElementById("ditherMethod").value,
    ditherAmount: parseFloat(document.getElementById("ditherAmount").value),
    bayerSize: parseInt(document.getElementById("bayerSize").value),
    errorDampeningEnabled: document.getElementById("errorDampeningEnabled").checked,
    errorDampeningThreshold: parseInt(document.getElementById("errorDampeningThreshold").value),
  };
}

export function getAlphaValues() {
  return {
    mode: document.getElementById("alphaMode").value,
    threshold: parseInt(document.getElementById("alphaThreshold").value),
    matteColorHex: document.getElementById("matteColorInput").value,
  };
}

// Parse matte color hex to RGB object (supports #FFF or #FFFFFF)
export function parseMatteColor(hex) {
  hex = hex.trim();
  if (hex.match(/^#[0-9A-Fa-f]{3}$/)) {
    // 3-digit hex
    return {
      r: parseInt(hex[1] + hex[1], 16),
      g: parseInt(hex[2] + hex[2], 16),
      b: parseInt(hex[3] + hex[3], 16),
    };
  } else if (hex.match(/^#[0-9A-Fa-f]{6}$/)) {
    // 6-digit hex
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }
  // Default to white if invalid
  return { r: 255, g: 255, b: 255 };
}

export function gatherSettings(curvesEditor) {
  const adj = getAdjustmentValues();
  const conv = getConversionValues();
  const alpha = getAlphaValues();

  return {
    version: 1,
    conversion: {
      colors: conv.colorCount,
      quantMethod: conv.quantMethod,
      colorDistance: conv.colorDistance,
      ditherMethod: conv.ditherMethod,
      bayerSize: conv.bayerSize,
      ditherAmount: conv.ditherAmount,
      errorDampeningEnabled: conv.errorDampeningEnabled,
      errorDampeningThreshold: conv.errorDampeningThreshold,
    },
    curves: {
      rgb: curvesEditor.curves.rgb.map(p => [...p]),
      red: curvesEditor.curves.red.map(p => [...p]),
      green: curvesEditor.curves.green.map(p => [...p]),
      blue: curvesEditor.curves.blue.map(p => [...p]),
    },
    adjustments: adj,
    alpha: {
      mode: alpha.mode,
      threshold: alpha.threshold,
      matteColor: alpha.matteColorHex,
    },
  };
}

export function applySettings(settings, curvesEditor, updateTransparencyGridCallback) {
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

  // Alpha settings (new format)
  if (settings.alpha) {
    const a = settings.alpha;
    if (a.mode !== undefined) {
      document.getElementById("alphaMode").value = a.mode;
      document.getElementById("alphaModeMatteOptions").style.display = a.mode === "matte" ? "flex" : "none";
      document.getElementById("alphaModeThresholdOptions").style.display = a.mode === "threshold" ? "flex" : "none";
      if (updateTransparencyGridCallback) {
        updateTransparencyGridCallback();
      }
    }
    if (a.threshold !== undefined) {
      document.getElementById("alphaThreshold").value = a.threshold;
      document.getElementById("alphaThresholdNumber").value = a.threshold;
    }
    if (a.matteColor !== undefined) {
      document.getElementById("matteColorInput").value = a.matteColor;
    }
  } else if (settings.matteColor !== undefined) {
    // Backwards compatibility with old format
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
