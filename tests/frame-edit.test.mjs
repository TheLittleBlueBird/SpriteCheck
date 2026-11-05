import test from 'node:test';
import assert from 'node:assert/strict';
import {Project,sliceSheet,mergeSheet} from '../core.mjs';
import {usedSourceIds,excludedSources,timelineImage} from '../frame-edit.mjs';
import {encodePNG} from '../png.mjs';
import {encodeProject,decodeProject} from '../project-file.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const grid={cellWidth:2,cellHeight:2};
function image(){const data=new Uint8ClampedArray(12*4*4);for(let row=0;row<2;row++)for(let col=0;col<6;col++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)data.set([col+20,row+40,80,255],(((row*2+y)*12)+col*2+x)*4);return {width:12,height:4,data};}
const fresh=()=>new Project(sliceSheet(image(),grid));
test('Deleting one row key hides only its unreferenced source cell without modifying source pixels',()=>{
 const p=fresh(),before=p.sheet.image.data.slice(),original=p.originalSheet.image.data.slice();p.change(a=>a[0].keys.splice(2,1));
 assert.equal(p.draft[0].keys.length,5);assert.equal(p.sheet.frames.length,12);assert.deepEqual(excludedSources(p.sheet,p.draft).map(f=>f.id),[2]);
 const edited=timelineImage(p.sheet,p.draft);for(let y=0;y<4;y++)for(let x=0;x<12;x++){const at=(y*12+x)*4;assert.deepEqual(edited.data.subarray(at,at+4),y<2&&x>=4&&x<6?new Uint8ClampedArray(4):before.subarray(at,at+4));}
 assert.deepEqual(p.sheet.image.data,before);assert.deepEqual(p.originalSheet.image.data,original);assert.equal(p.hasPixelEdits,false);
});
test('Repeated source stays visible until its last key is removed; duplicate images in other cells stay separate',()=>{
 const p=fresh();p.change(a=>a[0].keys.splice(1,0,{sourceId:0,ticks:3}));p.change(a=>a[0].keys.splice(0,1));assert.ok(usedSourceIds(p.draft).has(0));assert.equal(excludedSources(p.sheet,p.draft).length,0);
 p.change(a=>a[0].keys.splice(0,1));assert.deepEqual(excludedSources(p.sheet,p.draft).map(f=>f.id),[0]);assert.ok(usedSourceIds(p.draft).has(6));
});
test('Undo/Redo restores exact timeline and derived pixels; removing every key retains all source IDs and rows',()=>{
 const p=fresh(),before=timelineImage(p.sheet,p.draft).data,keys=structuredClone(p.draft);p.change(a=>a[0].keys=[]);assert.equal(p.draft[0].keys.length,0);assert.equal(p.sheet.original.length,2);assert.equal(p.sheet.frames.length,12);assert.equal(excludedSources(p.sheet,p.draft).length,6);
 const removed=timelineImage(p.sheet,p.draft).data;p.undo();assert.deepEqual(p.draft,keys);assert.deepEqual(timelineImage(p.sheet,p.draft).data,before);p.redo();assert.deepEqual(timelineImage(p.sheet,p.draft).data,removed);
 p.confirm();const m=p.merge('row','empty-row');assert.equal(m.manifest.animations[0].totalTicks,0);assert.equal(m.manifest.animations[1].totalTicks,6);assert.ok(m.frames.every(f=>f.row===1));
});
test('DAT v1/v2 retain deleted keys, original PNG and source pixels for later restoration',async()=>{
 for(const paint of [false,true]){const p=fresh(),png=await encodePNG(image());if(paint){const data=p.sheet.frames[0].data.slice();data[0]=220;p.paintFrame(0,data);}p.change(a=>a[0].keys.splice(0,1));const expected=timelineImage(p.sheet,p.draft).data;
 const restored=await decodeProject(await encodeProject({project:p,pngBytes:png,sourceName:'frames.png'}));assert.deepEqual(restored.pngBytes,png);assert.equal(restored.project.sheet.frames.length,12);assert.deepEqual(restored.project.draft,p.draft);assert.deepEqual(timelineImage(restored.project.sheet,restored.project.draft).data,expected);
 restored.project.change(a=>a[0].keys.unshift({sourceId:0,ticks:1}));assert.equal(timelineImage(restored.project.sheet,restored.project.draft).data[0],paint?220:20);}
});
test('Merge excludes deleted images and preserves remaining order, holds, FPS and Loop',()=>{
 const p=fresh();p.change(a=>{a[0].keys.splice(2,1);a[0].keys[0].ticks=4;a[0].keys.reverse();a[0].fps=17;a[0].loop=false;});
 for(const scope of ['row','sheet']){const m=mergeSheet(p.sheet,p.draft,scope,'deleted');assert.ok(!m.sourceToFrame.has(2));const row=m.manifest.animations[0];assert.equal(row.fps,17);assert.equal(row.loop,false);assert.equal(row.totalTicks,8);assert.deepEqual(row.timeline.map(k=>m.frames[k.frame].sourceId),p.draft[0].keys.map(k=>k.sourceId));assert.deepEqual(row.timeline.map(k=>k.ticks),p.draft[0].keys.map(k=>k.ticks));}
});
test('Undo of the final removed key restores a selected, editable frame',async()=>{
 const p=fresh();p.change(a=>a[0].keys=[]);const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8'),fn=source.match(/^function applyHistory\(.*$/m)[0];
 const state={project:p,row:0,selectedKey:-1,selectedSource:0,mode:'edited',playing:false,seconds:0,paintEditor:{painting:false},clearPixelViews(){},invalidate(){},selectedKeyTime:()=>0,render(){}};
 vm.runInNewContext(fn+";applyHistory('undo');",state);assert.equal(state.selectedKey,0);assert.equal(state.selectedSource,0);assert.equal(p.draft[0].keys.length,6);
});
