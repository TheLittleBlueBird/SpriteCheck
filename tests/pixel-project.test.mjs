import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Project,sliceSheet,HISTORY_LIMIT,ticks,frameAtSeconds} from '../core.mjs';
import {encodePNG,decodePNG} from '../png.mjs';
import {encodeProject,decodeProject} from '../project-file.mjs';

const grid={cellWidth:2,cellHeight:1,offsetX:1,offsetY:1,gapX:1,gapY:1};
function fixture(){
 const image={width:8,height:5,data:new Uint8ClampedArray(8*5*4)};
 // Deliberate hidden RGB in margins and gaps must survive every operation.
 for(let i=0;i<image.data.length;i+=4)image.data.set([19,31,47,0],i);
 const frames=[[255,0,0,255,5,6,7,0],[255,0,0,255,5,6,7,0],[0,255,0,127,9,8,7,1],[0,0,255,255,3,2,1,0]];
 for(let r=0;r<2;r++)for(let c=0;c<2;c++)image.data.set(frames[r*2+c],((1+r*2)*8+1+c*3)*4);
 return image;
}
const fresh=()=>new Project(sliceSheet(fixture(),grid));
const replacement=new Uint8ClampedArray([12,34,56,0,210,87,49,127]);
const save=async(p,view={})=>encodeProject({project:p,pngBytes:await encodePNG(p.originalSheet.image),sourceName:'pixel-source.png',view});
function header(data){return new DataView(data.buffer,data.byteOffset,data.byteLength);}
async function rewrite(dat,{metadata,workingPNG,version}={}){
 const h=header(dat),length=h.getUint32(20,true),pngLength=h.getUint32(24,true),old=JSON.parse(new TextDecoder().decode(dat.subarray(64,64+length)));
 const meta=new TextEncoder().encode(JSON.stringify(metadata?metadata(old):old));
 const original=dat.subarray(64+length,64+length+pngLength),working=workingPNG??dat.subarray(64+length+pngLength);
 const out=new Uint8Array(64+meta.length+original.length+working.length);out.set(dat.subarray(0,64));const oh=header(out);
 if(version!==undefined)oh.setUint32(16,version,true);oh.setUint32(20,meta.length,true);oh.setUint32(28,working.length,true);
 out.set(meta,64);out.set(original,64+meta.length);out.set(working,64+meta.length+original.length);
 out.set(new Uint8Array(await crypto.subtle.digest('SHA-256',out.subarray(64))),32);return out;
}
function assertOutsideUnchanged(p){
 const inside=new Set();for(const f of p.originalSheet.frames)for(let y=0;y<p.sheet.grid.cellHeight;y++)for(let x=0;x<p.sheet.grid.cellWidth;x++)inside.add((f.y+y)*p.sheet.image.width+f.x+x);
 for(let i=0;i<p.sheet.image.width*p.sheet.image.height;i++)if(!inside.has(i))assert.deepEqual(p.sheet.image.data.slice(i*4,i*4+4),p.originalSheet.image.data.slice(i*4,i*4+4),`outside pixel ${i}`);
}

test('Pixel baseline owns its original bytes/topology and working image is independent',()=>{
 const source=sliceSheet(fixture(),grid),p=new Project(source),baseline=p.originalSheet.image.data.slice();
 assert.notEqual(p.sheet.image.data,p.originalSheet.image.data);assert.notEqual(p.originalSheet.image.data,source.image.data);
 assert.equal(p.sheet.frames[0].data,p.originalSheet.frames[0].data);assert.equal(p.hasPixelEdits,false);
 source.image.data.fill(77);source.frames[0].data.fill(33);source.original[0].keys.length=0;
 assert.deepEqual(p.originalSheet.image.data,baseline);assert.equal(p.originalSheet.original[0].keys.length,2);
 assert.throws(()=>p.originalSheet={});assert.throws(()=>p.originalSheet.frames[0].row=55);
 p.paintFrame(0,replacement);assert.deepEqual(p.originalSheet.image.data,baseline);assert.notEqual(p.sheet.frames[0].data,p.originalSheet.frames[0].data);assertOutsideUnchanged(p);
});
test('Fully erasing the first source retains every ID, cell, row, key and source reference',()=>{
 const p=fresh(),topology=JSON.stringify({cells:p.sheet.cells,keys:p.draft,frames:p.sheet.frames.map(({data,...f})=>f)});
 p.paintFrame(0,new Uint8ClampedArray(8));assert.equal(p.sheet.frames[0].data.some(Boolean),false);
 assert.equal(JSON.stringify({cells:p.sheet.cells,keys:p.draft,frames:p.sheet.frames.map(({data,...f})=>f)}),topology);
 p.confirm();const merged=p.merge('row','erased');assert.ok(merged.sourceToFrame.has(0));assert.equal(merged.manifest.animations[0].totalTicks,2);assert.equal(p.hasPixelEdits,true);
 p.undo();assert.equal(p.hasPixelEdits,false);assert.deepEqual(p.sheet.frames[0].data,p.originalSheet.frames[0].data);
 p.redo();assert.equal(p.sheet.frames[0].data.some(Boolean),false);assertOutsideUnchanged(p);
});
test('Painting duplicate source cells changes only the selected source and fresh detection/merge',()=>{
 const p=fresh();assert.equal(p.detect().redundant,1);p.confirm();p.merge('row','before');
 const duplicate=p.sheet.frames[1].data.slice();p.paintFrame(0,replacement);
 assert.equal(p.detection,null);assert.equal(p.merged,null);assert.equal(p.dirty,true);assert.throws(()=>p.merge('row'),/Confirm/);
 assert.deepEqual(p.sheet.frames[1].data,duplicate);assert.equal(p.detect().redundant,0);p.confirm();assert.equal(p.merge('row').frames.length,4);
 p.undo();assert.equal(p.detection,null);assert.equal(p.merged,null);assert.equal(p.dirty,true);assert.equal(p.detect().redundant,1);
});
test('RGBA paint copies caller data losslessly including hidden RGB and partial alpha',()=>{
 const p=fresh(),input=replacement.slice();p.paintFrame(0,input);input.fill(255);
 assert.deepEqual(p.sheet.frames[0].data,replacement);assert.equal(p.sheet.frames[0].data[3],0);assert.equal(p.sheet.frames[0].data[7],127);
 p.paintFrame(0,new Uint8Array(p.originalSheet.frames[0].data));assert.equal(p.hasPixelEdits,false);p.undo();assert.equal(p.hasPixelEdits,true);p.redo();assert.equal(p.hasPixelEdits,false);
});
test('Paint no-op/rejection is atomic and preserves confirmation, merge, detection and redo',()=>{
 const p=fresh();p.paintFrame(0,replacement);p.undo();p.detect();p.confirm();const merged=p.merge('row'),detection=p.detection;
 const before=p.sheet.image.data.slice(),undo=p.undoStack.length,redo=p.redoStack.length;
 assert.equal(p.paintFrame(0,p.sheet.frames[0].data),false);
 for(const [id,data] of [[-1,replacement],[9,replacement],[.5,replacement],[0,new Uint8Array(4)],[0,[...replacement]],[0,new Float32Array(8)]])assert.throws(()=>p.paintFrame(id,data));
 assert.deepEqual(p.sheet.image.data,before);assert.equal(p.undoStack.length,undo);assert.equal(p.redoStack.length,redo);assert.equal(p.merged,merged);assert.equal(p.detection,detection);assert.equal(p.dirty,false);
 p.redo();assert.deepEqual(p.sheet.frames[0].data,replacement);assert.equal(p.detection,null);assert.equal(p.merged,null);
});
test('Timeline and paint share one 50-step undo/redo history and a new paint discards redo',()=>{
 const p=fresh(),states=[];
 const snapshot=()=>({draft:structuredClone(p.draft),pixels:p.sheet.image.data.slice(),edited:p.hasPixelEdits});
 states.push(snapshot());for(let i=1;i<=60;i++){if(i%2)p.change(a=>a[0].fps=10+i);else {const rgba=p.sheet.frames[0].data.slice();rgba[0]=i;p.paintFrame(0,rgba);}states.push(snapshot());}
 assert.equal(p.undoStack.length,HISTORY_LIMIT);for(let i=59;i>=10;i--){assert.equal(p.undo(),true);assert.deepEqual(snapshot(),states[i]);}assert.equal(p.undo(),false);assert.equal(p.redoStack.length,50);
 for(let i=11;i<=60;i++){assert.equal(p.redo(),true);assert.deepEqual(snapshot(),states[i]);}assert.equal(p.redo(),false);
 p.undo();p.paintFrame(0,replacement);assert.equal(p.redoStack.length,0);assert.equal(p.redo(),false);assert.equal(p.undoStack.length,50);
 // No pixel transaction embeds an image-sized snapshot.
 for(const entry of p.undoStack.filter(e=>e.kind==='pixels')){assert.equal(entry.before.length,8);assert.equal(entry.after.length,8);assert.ok(!('image' in entry));}
});
test('DAT v1 remains the unpainted format and paint reverted to baseline returns to v1',async()=>{
 const p=fresh(),plain=await save(p);assert.equal(header(plain).getUint32(16,true),1);assert.equal(header(plain).getUint32(28,true),0);
 const restored=await decodeProject(plain);assert.equal(restored.project.hasPixelEdits,false);assert.deepEqual(restored.image.data,p.originalSheet.image.data);assert.deepEqual(restored.project.sheet.image.data,p.sheet.image.data);
 p.paintFrame(0,replacement);p.undo();const reverted=await save(p);assert.equal(header(reverted).getUint32(16,true),1);assert.equal(header(reverted).getUint32(28,true),0);
});
test('DAT v2 roundtrip retains immutable original PNG, erased first source, RGBA, dirty old confirmation and view',async()=>{
 const p=fresh();p.confirm();const confirmed=structuredClone(p.confirmed);p.paintFrame(0,new Uint8ClampedArray(8));p.paintFrame(1,replacement);p.change(a=>{a[0].keys[0].ticks=7;a[0].fps=17;a[0].loop=false;});
 const view={row:0,selectedKey:-1,selectedSource:0,mode:'original',sheetMode:'original',tab:'compare',seconds:.321,scope:'sheet',exportName:'pixel-repaired',compare:{sync:false,left:{zoom:4,panX:7,panY:9},right:{zoom:3,panX:5,panY:1},logVisible:true}};
 const dat=await save(p,view),h=header(dat);assert.equal(h.getUint32(16,true),2);assert.ok(h.getUint32(28,true)>0);
 const meta=JSON.parse(new TextDecoder().decode(dat.subarray(64,64+h.getUint32(20,true))));assert.equal(meta.version,2);
 const r=await decodeProject(dat);assert.deepEqual(r.pngBytes,await encodePNG(p.originalSheet.image));assert.deepEqual(r.image.data,p.originalSheet.image.data);assert.deepEqual(r.project.originalSheet.image.data,p.originalSheet.image.data);assert.deepEqual(r.project.sheet.image.data,p.sheet.image.data);
 assert.deepEqual(r.project.draft,p.draft);assert.deepEqual(r.project.confirmed,confirmed);assert.equal(r.project.hasPixelEdits,true);assert.equal(r.project.dirty,true);assert.equal(r.project.detection,null);assert.equal(r.project.merged,null);assert.equal(r.project.undoStack.length,0);assert.equal(r.project.redoStack.length,0);assert.equal(r.project.sheet.frames.length,4);assert.equal(r.view.selectedSource,0);assert.equal(r.view.selectedKey,-1);assert.equal(r.view.seconds,.321);assert.equal(r.view.tab,'compare');assertOutsideUnchanged(r.project);
});
test('DAT v2 rebuilds requested detection and merged result from painted data with timing intact',async()=>{
 for(const scope of ['row','sheet']){const p=fresh();p.paintFrame(0,replacement);p.detect();p.change(a=>a.forEach((r,i)=>{r.keys.reverse();r.keys[0].ticks=3+i;r.fps=17+i;r.loop=false;}));p.confirm();const merged=p.merge(scope,'painted'),r=await decodeProject(await save(p,{mode:'merged',sheetMode:'merged',scope,exportName:'painted'}));
 assert.equal(r.project.detection.unique,4);assert.deepEqual(r.project.merged.data,merged.data);assert.deepEqual(r.project.merged.manifest,merged.manifest);assert.equal(r.project.dirty,false);assert.equal(r.view.mode,'merged');assert.equal(r.view.sheetMode,'merged');assert.equal(r.project.undo(),false);}
});
test('DAT v2 rejects corruption, unsupported version/schema, missing working bytes and dimension mismatch',async()=>{
 const p=fresh();p.paintFrame(0,replacement);const good=await save(p);
 const corrupt=good.slice();corrupt[corrupt.length-16]^=1;await assert.rejects(decodeProject(corrupt),/checksum/);await assert.rejects(decodeProject(good.slice(0,-1)));
 await assert.rejects(decodeProject(await rewrite(good,{version:3})),/version/);
 await assert.rejects(decodeProject(await rewrite(good,{metadata:m=>({...m,version:1})})));await assert.rejects(decodeProject(await rewrite(good,{metadata:m=>({...m,version:99})})));
 await assert.rejects(decodeProject(await rewrite(good,{workingPNG:new Uint8Array()})),/version/);
 const other=await encodePNG({width:1,height:1,data:new Uint8ClampedArray([1,2,3,255])});await assert.rejects(decodeProject(await rewrite(good,{workingPNG:other})),/dimensions/);
});
test('DAT v2 rejects edits outside original source cells, and mismatched dimensions do not mutate a source project',async()=>{
 const p=fresh();p.paintFrame(0,replacement);const good=await save(p),outside={...p.sheet.image,data:p.sheet.image.data.slice()};outside.data[0]^=1;
 const before=p.sheet.image.data.slice();await assert.rejects(decodeProject(await rewrite(good,{workingPNG:await encodePNG(outside)})),/outside/);assert.deepEqual(p.sheet.image.data,before);
 assert.throws(()=>new Project(sliceSheet(fixture(),grid),{width:1,height:1,data:new Uint8ClampedArray(4)}),/dimensions/);
});
test('DAT v2 enforces combined original + working PNG limit before allocating an oversized container',async()=>{
 const p=fresh();p.paintFrame(0,replacement);await assert.rejects(encodeProject({project:p,pngBytes:new Uint8Array(64*1024*1024),sourceName:'large.png'}),/together.*64 MiB/);
 const good=await save(p),bad=good.slice();header(bad).setUint32(24,64*1024*1024,true);header(bad).setUint32(28,1,true);await assert.rejects(decodeProject(bad));
});
test('Old v1-only reader rejects a painted DAT rather than silently losing pixel edits',async()=>{
 // This is the exact v1 reader gate in shipped 1.6.3 (header version must be 1).
 const oldVersionGate=dat=>{if(header(dat).getUint32(16,true)!==1)throw new Error('Unsupported .dat version. Open this project in a newer Sprite Check.');};
 const p=fresh();oldVersionGate(await save(p));p.paintFrame(0,replacement);const painted=await save(p);assert.throws(()=>oldVersionGate(painted),/version/);
});
test('Painted twelve-row sheet preserves all logical ticks and pixels through both merge scopes and DAT',async()=>{
 const png=new Uint8Array(await readFile(new URL('../assets/test-sheet.png',import.meta.url))),image=await decodePNG(png),p=new Project(sliceSheet(image,{cellWidth:105,cellHeight:115}));
 for(const row of p.draft){const first=row.keys[0].sourceId,rgba=p.sheet.frames[first].data.slice();rgba.set([row.row+1,99,201,row.row%2?127:0],0);p.paintFrame(first,rgba);}
 p.change(rows=>rows.forEach((a,i)=>{a.keys.reverse();a.keys[0].ticks=2+i;a.fps=7+i;a.loop=!!(i%2);}));p.confirm();
 for(const scope of ['row','sheet']){const m=p.merge(scope,'repaired'),r=await decodeProject(await encodeProject({project:p,pngBytes:png,sourceName:'twelve-rows.png',view:{scope,mode:'merged',exportName:'repaired'}}));assert.deepEqual(r.project.merged.data,m.data);assert.equal(m.manifest.animations.length,12);
 for(const a of p.draft){const packed={...a,keys:m.manifest.animations[a.row].timeline.map(k=>({sourceId:k.frame,ticks:k.ticks}))};assert.equal(ticks(a),ticks(packed));assert.equal(m.manifest.animations[a.row].fps,a.fps);assert.equal(m.manifest.animations[a.row].loop,a.loop);
 for(let tick=0;tick<ticks(a);tick++){const sid=frameAtSeconds(a,tick/a.fps,false).key.sourceId,f=m.frames[frameAtSeconds(packed,tick/a.fps,false).key.sourceId],actual=new Uint8ClampedArray(105*115*4);for(let y=0;y<115;y++)actual.set(m.data.subarray(((f.y+y)*m.width+f.x)*4,((f.y+y)*m.width+f.x+105)*4),y*105*4);assert.deepEqual(actual,p.sheet.frames[sid].data);}}
 }
});
