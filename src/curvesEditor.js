// Curves Editor UI component

// Create curves editor - requires a convertImage callback for real-time updates
export function createCurvesEditor(convertImageCallback) {
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
            convertImageCallback();
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
        convertImageCallback(); // Real-time update
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
        convertImageCallback(); // Real-time update
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
      convertImageCallback(); // Immediate, pending logic handles rapid calls
    },

    onMouseUp() {
      this.draggingPoint = null;
      convertImageCallback(); // Final update when released
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
          convertImageCallback(); // Real-time update
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

  return curvesEditor;
}
