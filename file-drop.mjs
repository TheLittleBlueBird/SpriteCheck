// Handle native file drags without interfering with timeline keyframe drags.
export function filesFromDrop(transfer) {
  if (!transfer) return [];
  const files = Array.from(transfer.files || []);
  if (files.length) return files;
  return Array.from(transfer.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile?.())
    .filter(Boolean);
}

export function isFileDrag(transfer) {
  return Boolean(transfer && (
    transfer.files?.length ||
    Array.from(transfer.types || []).includes('Files') ||
    Array.from(transfer.items || []).some(item => item.kind === 'file')
  ));
}

export function firstPNG(files) {
  return files.find(file => file.type === 'image/png' || /\.png$/i.test(file.name || '')) || null;
}

export function bindFileDrop(target, { onFiles, onActive = () => {}, onError = console.error }) {
  let depth = 0;
  let active = false;
  function mark(next) {
    if (next === active) return;
    active = next;
    onActive(next);
  }
  function accept(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }
  function enter(event) {
    if (!isFileDrag(event.dataTransfer)) return;
    accept(event);
    depth += 1;
    mark(true);
  }
  function over(event) {
    if (!isFileDrag(event.dataTransfer)) return;
    accept(event);
    mark(true);
  }
  function leave(event) {
    if (!active && !depth) return;
    event.stopPropagation();
    // Some hosts clear DataTransfer.types on dragleave; still balance the depth.
    depth = Math.max(0, depth - 1);
    if (!depth) mark(false);
  }
  function reset() { depth = 0; mark(false); }
  function drop(event) {
    if (!isFileDrag(event.dataTransfer)) return;
    accept(event);
    const files = filesFromDrop(event.dataTransfer);
    reset();
    try { Promise.resolve(onFiles(files)).catch(onError); }
    catch (error) { onError(error); }
  }
  const handlers = { dragenter: enter, dragover: over, dragleave: leave, drop };
  for (const [name, handler] of Object.entries(handlers)) target.addEventListener(name, handler);
  return {
    reset,
    dispose() {
      for (const [name, handler] of Object.entries(handlers)) target.removeEventListener(name, handler);
      reset();
    }
  };
}
