import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Project,sliceSheet,ticks} from '../core.mjs';
import {decodePNG} from '../png.mjs';
import {encodeProject,decodeProject} from '../project-file.mjs';
const png=new Uint8Array(await readFile(new URL('../assets/test-sheet.png',import.meta.url)));
const image=await decodePNG(png),grid={cellWidth:105,cellHeight:115,offsetX:0,offsetY:0,gapX:0,gapY:0};
function fresh(){return new Project(sliceSheet(image,grid));}
const save=(project,view={})=>encodeProject({project,pngBytes:png,sourceName:'SkeletonSword-demo.png',view});
test('DAT contains original encoded PNG and all source pixels byte-exact',async()=>{
 const p=fresh(),data=await save(p),r=await decodeProject(data);
 assert.deepEqual(r.pngBytes,png);assert.deepEqual(r.image.data,image.data);assert.deepEqual(r.project.draft,p.draft);assert.equal(r.project.sheet.frames.length,116);assert.equal(r.project.confirmed,null);
});
test('DAT restores unconfirmed edits, FPS, loop, row and selection',async()=>{
 const p=fresh();p.change(a=>{a[0].keys[0].ticks=5;a[0].keys.splice(2,1);a[0].fps=17;a[0].loop=false;});
 const r=await decodeProject(await save(p,{row:0,selectedKey:3,seconds:.2,mode:'edited',exportName:'my-project'}));
 assert.deepEqual(r.project.draft,p.draft);assert.equal(r.project.dirty,true);assert.equal(r.project.confirmed,null);assert.equal(r.view.selectedKey,3);assert.equal(r.view.seconds,.2);assert.equal(r.view.exportName,'my-project');
});
test('DAT reconstructs merged pixels, detection and every confirmed timeline tick',async()=>{
 for(const scope of ['row','sheet']){const p=fresh();p.detect();p.change(a=>{a[0].keys[0].ticks=5;a[7].keys.reverse();});p.confirm();const merged=p.merge(scope,'example');
 const r=await decodeProject(await save(p,{scope,mode:'merged',sheetMode:'merged',tab:'compare'}));
 assert.equal(r.project.dirty,false);assert.deepEqual(r.project.confirmed,p.confirmed);assert.deepEqual(r.project.merged.data,merged.data);assert.deepEqual(r.project.merged.manifest.animations,merged.manifest.animations);assert.equal(r.project.detection.unique,96);assert.equal(r.view.tab,'compare');assert.equal(ticks(r.project.draft[0]),ticks(p.draft[0]));}
});
test('DAT retains previous confirmation separately from later dirty edits',async()=>{
 const p=fresh();p.confirm();const before=structuredClone(p.confirmed);p.change(a=>a[0].keys[0].ticks=8);
 const r=await decodeProject(await save(p));assert.deepEqual(r.project.confirmed,before);assert.deepEqual(r.project.draft,p.draft);assert.equal(r.project.merged,null);assert.equal(r.project.dirty,true);
});
test('DAT rejects truncated, corrupted, renamed PNG and unsupported versions',async()=>{
 const good=await save(fresh());for(const data of [good.slice(0,10),good.slice(0,-1),png])await assert.rejects(decodeProject(data));
 const corrupt=good.slice();corrupt[corrupt.length-15]^=1;await assert.rejects(decodeProject(corrupt),/checksum/);
 const future=good.slice();new DataView(future.buffer).setUint32(16,2,true);await assert.rejects(decodeProject(future),/version/);
});
test('DAT validates references even with a recomputed checksum',async()=>{
 const original=await save(fresh()),oldLength=new DataView(original.buffer).getUint32(20,true),meta=JSON.parse(new TextDecoder().decode(original.slice(64,64+oldLength)));
 meta.draft[0].keys[0].sourceId=99999;const json=new TextEncoder().encode(JSON.stringify(meta)),bad=new Uint8Array(64+json.length+png.length);bad.set(original.subarray(0,64));new DataView(bad.buffer).setUint32(20,json.length,true);bad.set(json,64);bad.set(png,64+json.length);bad.set(new Uint8Array(await crypto.subtle.digest('SHA-256',bad.subarray(64))),32);await assert.rejects(decodeProject(bad),/source frame/);
});
test('DAT input validation does not mutate the existing project',async()=>{
 const p=fresh();p.change(a=>a[0].keys[0].ticks=7);const before=structuredClone(p.draft);await assert.rejects(decodeProject(new Uint8Array(100)));assert.deepEqual(p.draft,before);
});
