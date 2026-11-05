// A frame is omitted only after its last timeline reference is removed.
// Keep source IDs and pixels intact for Undo, DAT recovery and restoring a key.
export function usedSourceIds(animations){return new Set(animations.flatMap(a=>a.keys.map(k=>k.sourceId)));}
export function excludedSources(sheet,animations){const used=usedSourceIds(animations);return sheet.frames.filter(f=>!used.has(f.id));}
export function timelineImage(sheet,animations){
 const image={width:sheet.image.width,height:sheet.image.height,data:sheet.image.data.slice()},w=sheet.grid.cellWidth,h=sheet.grid.cellHeight;
 for(const f of excludedSources(sheet,animations))for(let y=0;y<h;y++){const start=((f.y+y)*image.width+f.x)*4;image.data.fill(0,start,start+w*4);}
 return image;
}
