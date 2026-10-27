// Raster operations replace exact RGBA values. They do not blend or change size.
const MAX_STROKE_COORDINATE = 8192;

function validatePixels(data) {
  if (!(data instanceof Uint8ClampedArray) || data.length % 4 !== 0) {
    throw new TypeError('Pixels must be a Uint8ClampedArray of complete RGBA pixels.');
  }
}

function validateRaster(data, width, height) {
  validatePixels(data);
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      !Number.isSafeInteger(width * height * 4) || data.length !== width * height * 4) {
    throw new RangeError('Raster dimensions must match the RGBA buffer.');
  }
}

function validatedColor(color) {
  if ((!Array.isArray(color) && !ArrayBuffer.isView(color)) || color.length !== 4) {
    throw new TypeError('Color must contain four RGBA bytes.');
  }
  const result = Array.from(color);
  if (!result.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new RangeError('RGBA channels must be integers from 0 to 255.');
  }
  return result;
}

function validateCoordinate(value) {
  if (!Number.isSafeInteger(value)) throw new RangeError('Pixel coordinates must be integers.');
}

function validateStrokePoint(point) {
  if (!point || typeof point !== 'object') throw new TypeError('Stroke points need x and y.');
  validateCoordinate(point.x);
  validateCoordinate(point.y);
  if (Math.abs(point.x) > MAX_STROKE_COORDINATE || Math.abs(point.y) > MAX_STROKE_COORDINATE) {
    throw new RangeError('Stroke coordinates must be between -8192 and 8192.');
  }
}

function equals(data, offset, color) {
  return data[offset] === color[0] && data[offset + 1] === color[1] &&
    data[offset + 2] === color[2] && data[offset + 3] === color[3];
}

function replace(data, offset, color) {
  if (equals(data, offset, color)) return false;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = color[3];
  return true;
}

/**
 * Draw an inclusive, gap-free integer line with a clipped square brush.
 * Endpoints may lie outside the raster, within [-8192, 8192] on each axis.
 * An even brush extends one more pixel toward negative x/y: size 2 at (x,y)
 * covers (x-1,y-1) through (x,y). Invalid inputs throw before any pixels change.
 */
export function paintLine(data, width, height, start, end, color, size = 1) {
  validateRaster(data, width, height);
  validateStrokePoint(start);
  validateStrokePoint(end);
  const rgba = validatedColor(color);
  if (!Number.isInteger(size) || size < 1 || size > 16) {
    throw new RangeError('Brush size must be an integer from 1 to 16.');
  }

  let {x: x0, y: y0} = start;
  let {x: x1, y: y1} = end;
  // Resolve exact halfway cases consistently when the user reverses a stroke.
  if (x0 > x1 || (x0 === x1 && y0 > y1)) {
    [x0, x1] = [x1, x0];
    [y0, y1] = [y1, y0];
  }
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const half = Math.floor(size / 2);
  let error = dx - dy, changed = false;
  for (;;) {
    const left = Math.max(0, x0 - half), top = Math.max(0, y0 - half);
    const right = Math.min(width, x0 - half + size), bottom = Math.min(height, y0 - half + size);
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (replace(data, (y * width + x) * 4, rgba)) changed = true;
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const twiceError = 2 * error;
    if (twiceError > -dy) { error -= dy; x0 += sx; }
    if (twiceError < dx) { error += dx; y0 += sy; }
  }
  return changed;
}

/** Exact RGBA four-connected fill. Outside seeds are a harmless no-op. */
export function floodFill(data, width, height, x, y, color) {
  validateRaster(data, width, height);
  validateCoordinate(x);
  validateCoordinate(y);
  const rgba = validatedColor(color);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const first = y * width + x;
  const target = Array.from(data.subarray(first * 4, first * 4 + 4));
  if (target.every((value, channel) => value === rgba[channel])) return false;

  // Allocate before mutating. Mark on push so each pixel enters the queue once.
  const pending = new Uint32Array(width * height);
  let count = 1;
  pending[0] = first;
  replace(data, first * 4, rgba);
  while (count > 0) {
    const pixel = pending[--count], column = pixel % width;
    const visit = next => {
      if (equals(data, next * 4, target)) {
        replace(data, next * 4, rgba);
        pending[count++] = next;
      }
    };
    if (column > 0) visit(pixel - 1);
    if (column + 1 < width) visit(pixel + 1);
    if (pixel >= width) visit(pixel - width);
    if (pixel + width < width * height) visit(pixel + width);
  }
  return true;
}

/** Return a fresh RGBA array, or null outside the image. Never mutates pixels. */
export function samplePixel(data, width, height, x, y) {
  validateRaster(data, width, height);
  validateCoordinate(x);
  validateCoordinate(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
}

/** Most frequent exact RGBA colors; equal counts retain first-pixel order. */
export function sourceColors(data, max = 32) {
  validatePixels(data);
  if (!Number.isInteger(max) || max < 1 || max > 256) {
    throw new RangeError('Palette size must be an integer from 1 to 256.');
  }
  const colors = new Map();
  for (let offset = 0; offset < data.length; offset += 4) {
    const key = (data[offset] << 24) | (data[offset + 1] << 16) |
      (data[offset + 2] << 8) | data[offset + 3];
    const found = colors.get(key);
    if (found) found.count++;
    else colors.set(key, {color: Array.from(data.subarray(offset, offset + 4)), count: 1});
  }
  return [...colors.values()].sort((a, b) => b.count - a.count).slice(0, max);
}
