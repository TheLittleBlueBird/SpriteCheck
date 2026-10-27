import test from 'node:test';
import assert from 'node:assert/strict';
import {paintLine, floodFill, samplePixel, sourceColors} from '../pixel-tools.mjs';

const ink = [205, 31, 77, 255];
const pixels = (width, height, color = [0, 0, 0, 0]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset);
  return data;
};
const occupied = (data, width) => {
  const points = [];
  for (let i = 0; i < data.length / 4; i++) if (data[i * 4 + 3]) points.push([i % width, Math.floor(i / width)]);
  return points;
};

test('pencil replaces one exact RGBA pixel; sample is isolated and no-op returns false', () => {
  const data = pixels(4, 3);
  assert.equal(paintLine(data, 4, 3, {x: 2, y: 1}, {x: 2, y: 1}, ink), true);
  assert.deepEqual(occupied(data, 4), [[2, 1]]);
  const sampled = samplePixel(data, 4, 3, 2, 1);
  assert.deepEqual(sampled, ink);
  sampled[0] = 0;
  assert.deepEqual(samplePixel(data, 4, 3, 2, 1), ink);
  assert.equal(paintLine(data, 4, 3, {x: 2, y: 1}, {x: 2, y: 1}, ink), false);
});

test('inclusive horizontal, vertical and diagonal fast strokes leave no gaps', () => {
  for (const [start, end, expected] of [
    [{x: 0, y: 2}, {x: 5, y: 2}, [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]]],
    [{x: 3, y: 0}, {x: 3, y: 5}, [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5]]],
    [{x: 0, y: 0}, {x: 5, y: 5}, [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]],
    [{x: 0, y: 5}, {x: 5, y: 0}, [[5, 0], [4, 1], [3, 2], [2, 3], [1, 4], [0, 5]]]
  ]) {
    const data = pixels(6, 6);
    assert.equal(paintLine(data, 6, 6, start, end, ink), true);
    assert.deepEqual(occupied(data, 6), expected);
  }
});

test('all line octants preserve both endpoints, continuous neighbors and reversal pixels', () => {
  const center = {x: 8, y: 8};
  for (const end of [{x: 16, y: 12}, {x: 12, y: 16}, {x: 4, y: 16}, {x: 0, y: 12},
    {x: 0, y: 4}, {x: 4, y: 0}, {x: 12, y: 0}, {x: 16, y: 4}]) {
    const forward = pixels(17, 17), reverse = pixels(17, 17);
    paintLine(forward, 17, 17, center, end, ink);
    paintLine(reverse, 17, 17, end, center, ink);
    assert.deepEqual(forward, reverse);
    assert.deepEqual(samplePixel(forward, 17, 17, center.x, center.y), ink);
    assert.deepEqual(samplePixel(forward, 17, 17, end.x, end.y), ink);
    const points = occupied(forward, 17);
    assert.equal(points.length, 9);
    // With no repeated major-axis coordinate, adjacent sorted pixels are neighbors.
    points.sort((a, b) => Math.abs(end.x - center.x) >= Math.abs(end.y - center.y) ? a[0] - b[0] : a[1] - b[1]);
    for (let i = 1; i < points.length; i++) {
      assert.equal(Math.max(Math.abs(points[i][0] - points[i - 1][0]), Math.abs(points[i][1] - points[i - 1][1])), 1);
    }
  }
});

test('square brushes clip every edge without wrapping rows and define even-size centering', () => {
  const data = pixels(5, 4);
  paintLine(data, 5, 4, {x: 0, y: 0}, {x: 0, y: 0}, ink, 3);
  assert.deepEqual(occupied(data, 5), [[0, 0], [1, 0], [0, 1], [1, 1]]);
  const even = pixels(5, 4);
  paintLine(even, 5, 4, {x: 2, y: 2}, {x: 2, y: 2}, ink, 2);
  assert.deepEqual(occupied(even, 5), [[1, 1], [2, 1], [1, 2], [2, 2]]);
  const large = pixels(5, 4);
  paintLine(large, 5, 4, {x: 4, y: 3}, {x: 4, y: 3}, ink, 16);
  assert.equal(occupied(large, 5).length, 20);
});

test('outside endpoints clip a crossing stroke, a wholly outside stroke changes nothing', () => {
  const data = pixels(6, 3);
  assert.equal(paintLine(data, 6, 3, {x: -8192, y: 1}, {x: 8192, y: 1}, ink), true);
  assert.deepEqual(occupied(data, 6), [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
  const before = data.slice();
  assert.equal(paintLine(data, 6, 3, {x: -10, y: -2}, {x: 10, y: -2}, ink), false);
  assert.deepEqual(data, before);
  for (const [x, y] of [[-1, 0], [6, 0], [0, -1], [0, 3]]) assert.equal(samplePixel(data, 6, 3, x, y), null);
});

test('semi-transparent paint replaces instead of blending and eraser clears hidden RGB', () => {
  const data = pixels(2, 1, [230, 90, 12, 255]);
  paintLine(data, 2, 1, {x: 0, y: 0}, {x: 0, y: 0}, [5, 7, 9, 64]);
  assert.deepEqual(samplePixel(data, 2, 1, 0, 0), [5, 7, 9, 64]);
  assert.equal(paintLine(data, 2, 1, {x: 0, y: 0}, {x: 0, y: 0}, [0, 0, 0, 0]), true);
  assert.deepEqual(samplePixel(data, 2, 1, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(samplePixel(data, 2, 1, 1, 0), [230, 90, 12, 255]);
});

test('four-connected flood fill respects barriers and does not cross diagonal contacts', () => {
  const background = [10, 20, 30, 255], wall = [70, 80, 90, 255];
  const data = pixels(5, 5, background);
  paintLine(data, 5, 5, {x: 2, y: 0}, {x: 2, y: 4}, wall);
  assert.equal(floodFill(data, 5, 5, 0, 0, ink), true);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    assert.deepEqual(samplePixel(data, 5, 5, x, y), x < 2 ? ink : x === 2 ? wall : background);
  }
  const diagonal = pixels(2, 2, wall);
  diagonal.set(background, 0);
  diagonal.set(background, 12);
  floodFill(diagonal, 2, 2, 0, 0, ink);
  assert.deepEqual(samplePixel(diagonal, 2, 2, 1, 1), background);
});

test('flood fill matches alpha and hidden RGB exactly, with no-op and outside guards', () => {
  const data = new Uint8ClampedArray([5, 7, 9, 0, 5, 7, 9, 1, 5, 7, 9, 0, 0, 0, 0, 0]);
  assert.equal(floodFill(data, 4, 1, 0, 0, [5, 7, 9, 0]), false);
  assert.equal(floodFill(data, 4, 1, 0, 0, ink), true);
  assert.deepEqual(Array.from(data), [...ink, 5, 7, 9, 1, 5, 7, 9, 0, 0, 0, 0, 0]);
  assert.equal(floodFill(data, 4, 1, -1, 0, ink), false);
  assert.equal(floodFill(data, 4, 1, 4, 0, ink), false);
  assert.equal(floodFill(data, 4, 1, 2, 0, [0, 0, 0, 0]), true);
  assert.deepEqual(samplePixel(data, 4, 1, 2, 0), [0, 0, 0, 0]);
});

test('iterative flood fill completes a million-pixel region without recursion overflow', () => {
  const data = pixels(1024, 1024);
  assert.equal(floodFill(data, 1024, 1024, 500, 500, [3, 6, 9, 12]), true);
  assert.deepEqual(sourceColors(data), [{color: [3, 6, 9, 12], count: 1024 * 1024}]);
  assert.equal(floodFill(data, 1024, 1024, 0, 0, [3, 6, 9, 12]), false);
});

test('invalid paint arguments reject atomically, including late endpoint/color/size validation', () => {
  const data = pixels(3, 2, [2, 4, 6, 8]), before = data.slice();
  const base = [data, 3, 2, {x: 0, y: 0}, {x: 2, y: 1}, ink, 1];
  for (const [index, bad] of [[0, new Uint8Array(data)], [1, 0], [1, 2.5], [2, 3],
    [3, null], [3, {x: NaN, y: 0}], [4, {x: 8193, y: 0}], [4, {x: 2, y: Infinity}],
    [4, {x: 2, y: .5}], [5, [1, 2, 3]], [5, [1, 2, 3, 256]], [5, [1, 2, 3, .5]],
    [5, [1, 2, 3, '4']], [6, 0], [6, 17], [6, 1.5]]) {
    const args = [...base]; args[index] = bad;
    assert.throws(() => paintLine(...args));
    assert.deepEqual(data, before);
  }
});

test('invalid fill and sample input reject before changing the raster', () => {
  const data = pixels(3, 2, ink), before = data.slice();
  for (const call of [
    () => floodFill(data, 3, 3, 0, 0, [0, 0, 0, 0]),
    () => floodFill(data, 3, 2, .5, 0, [0, 0, 0, 0]),
    () => floodFill(data, 3, 2, 0, 0, [0, 0, 0, -1]),
    () => floodFill(data, 3, 2, -1, 0, [0, 0, 0, -1]),
    () => samplePixel(data, 2, 2, 0, 0),
    () => samplePixel(data, 3, 2, Infinity, 0)
  ]) {
    assert.throws(call);
    assert.deepEqual(data, before);
  }
});

test('source palette counts exact RGBA, preserves tied order and applies its limit', () => {
  const data = new Uint8ClampedArray([255, 0, 0, 0, ...ink, 255, 0, 0, 0, 255, 0, 0, 1, ...ink]);
  assert.deepEqual(sourceColors(data), [
    {color: [255, 0, 0, 0], count: 2}, {color: ink, count: 2}, {color: [255, 0, 0, 1], count: 1}
  ]);
  assert.deepEqual(sourceColors(data, 1), [{color: [255, 0, 0, 0], count: 2}]);
  assert.deepEqual(sourceColors(new Uint8ClampedArray()), []);
  assert.throws(() => sourceColors(data, 0));
  assert.throws(() => sourceColors(data, 257));
  assert.throws(() => sourceColors(new Uint8ClampedArray(3)));
});
