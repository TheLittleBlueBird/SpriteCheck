import test from 'node:test';
import assert from 'node:assert/strict';
import { filesFromDrop, isFileDrag, firstPNG, bindFileDrop } from '../file-drop.mjs';

const png = { name: 'sprite.PNG', type: '', arrayBuffer() {} };
function event(type, dataTransfer) {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(e, 'dataTransfer', { value: dataTransfer });
  return e;
}
test('file drags are recognized from types, files, or file items', () => {
  assert.ok(isFileDrag({ types: ['Files'] }));
  assert.ok(isFileDrag({ files: [png] }));
  assert.ok(isFileDrag({ items: [{ kind: 'file' }] }));
  assert.equal(isFileDrag({ types: ['text/plain'], items: [{ kind: 'string' }] }), false);
});
test('native file list and item-only host payloads open the first PNG', () => {
  const jpeg = { name: 'wrong.jpg', type: 'image/jpeg' };
  assert.equal(firstPNG([jpeg, png]), png);
  assert.equal(firstPNG([jpeg]), null);
  assert.deepEqual(filesFromDrop({ files: [png] }), [png]);
  assert.deepEqual(filesFromDrop({ files: [], items: [{ kind: 'file', getAsFile: () => png }] }), [png]);
});
test('nested enter/leave balances even when the host clears types on leave', () => {
  const target = new EventTarget(), states = [];
  bindFileDrop(target, { onFiles() {}, onActive: active => states.push(active) });
  target.dispatchEvent(event('dragenter', { types: ['Files'] }));
  target.dispatchEvent(event('dragenter', { types: ['Files'] }));
  target.dispatchEvent(event('dragleave', { types: [] }));
  assert.deepEqual(states, [true]);
  target.dispatchEvent(event('dragleave', { types: [] }));
  assert.deepEqual(states, [true, false]);
});
test('drop prevents browser navigation, clears hover and opens exactly once', async () => {
  const target = new EventTarget(), states = [], opened = [];
  bindFileDrop(target, { onFiles: files => opened.push(files), onActive: active => states.push(active) });
  const transfer = { types: ['Files'], files: [png] };
  target.dispatchEvent(event('dragenter', transfer));
  const drop = event('drop', transfer);
  target.dispatchEvent(drop);
  await Promise.resolve();
  assert.ok(drop.defaultPrevented);
  assert.equal(transfer.dropEffect, 'copy');
  assert.deepEqual(states, [true, false]);
  assert.deepEqual(opened, [[png]]);
});
test('internal keyframe drags pass through; resetting clears a cancelled file drag', () => {
  const target = new EventTarget(), states = [];
  const binding = bindFileDrop(target, { onFiles() { throw new Error('Should not open'); }, onActive: active => states.push(active) });
  const internal = event('dragover', { types: ['text/plain'] });
  target.dispatchEvent(internal);
  assert.equal(internal.defaultPrevented, false);
  target.dispatchEvent(event('dragover', { types: ['Files'] }));
  binding.reset();
  assert.deepEqual(states, [true, false]);
});
