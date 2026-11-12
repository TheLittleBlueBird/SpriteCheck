import test from 'node:test';
import assert from 'node:assert/strict';
import {Project,sliceSheet,frameAtSeconds,ticks} from '../core.mjs';
import {packMerged,autoPackColumns,packingBounds} from '../packing.mjs';
import {KeySelection,duplicateKeys,moveKeys} from '../timeline-selection.mjs';
import {frameEntries,frameFileName,exportName,zipFiles} from '../frame-export.mjs';
import {visibleSimilarity,findSimilarFrames,replaceSourceKeys,similarityLabel,visibleDifference} from '../similarity.mjs';
import {encodePNG,decodePNG} from '../png.mjs';
import {encodeProject,decodeProject} from '../project-file.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

function fixture(){const image={width:16,height:4,data:new Uint8ClampedArray(16*4*4)};for(let row=0;row<2;row++)for(let col=0;col<(row?8:4);col++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)image.data.set([row*80+col*7+10,x*70+20,y*90+30,255],((row*2+y)*16+col*2+x)*4);return image;}
const fresh=()=>new Project(sliceSheet(fixture(),{cellWidth:2,cellHeight:2}));
function cell(result,frame){const b=new Uint8ClampedArray(16);for(let y=0;y<2;y++)b.set(result.data.subarray(((frame.y+y)*result.width+frame.x)*4,((frame.y+y)*result.width+frame.x+2)*4),y*8);return b;}

test('Shift selects09–12 inclusively; Ctrl toggles individual keys without changing the anchor range',()=>{
 const s=new KeySelection();s.click(0,8,20).click(0,11,20,{shiftKey:true});assert.deepEqual(s.indices,[8,9,10,11]);assert.equal(s.primary,11);
 s.click(0,9,20,{ctrlKey:true});assert.deepEqual(s.indices,[8,10,11]);s.click(0,4,20);assert.deepEqual(s.indices,[4]);s.click(1,2,10,{shiftKey:true});assert.deepEqual(s.indices,[2]);
});
test('Reverse Shift range and Ctrl deselect-all remain valid',()=>{
 const s=new KeySelection();s.click(0,11,20).click(0,8,20,{shiftKey:true});assert.deepEqual(s.indices,[8,9,10,11]);assert.equal(s.anchor,11);assert.equal(s.primary,8);
 s.single(0,3).click(0,3,10,{ctrlKey:true});assert.deepEqual(s.indices,[]);assert.equal(s.primary,-1);
});
for(const slot of [0,1,3,4])test(`Duplicate a selected block at slot${slot} retains order and Hold`,()=>{
 const keys=[{sourceId:0,ticks:4},{sourceId:1,ticks:2},{sourceId:2,ticks:5},{sourceId:3,ticks:1}],before=structuredClone(keys),copies=duplicateKeys(keys,[1,2],slot);
 assert.deepEqual(copies,[slot,slot+1]);assert.deepEqual(keys.slice(slot,slot+2),before.slice(1,3));assert.notEqual(keys[slot],before[1]);assert.deepEqual(keys.filter((_,i)=>i<slot||i>=slot+2),before);
});
test('Bulk duplicate is one history step and exact Undo/Redo; invalid placement preserves redo',()=>{
 const p=fresh(),before=structuredClone(p.draft);p.change(a=>duplicateKeys(a[1].keys,[1,3,4],2));const after=structuredClone(p.draft);assert.equal(p.undoStack.length,1);p.undo();assert.deepEqual(p.draft,before);assert.throws(()=>p.change(a=>duplicateKeys(a[1].keys,[0],99)));assert.equal(p.redoStack.length,1);p.redo();assert.deepEqual(p.draft,after);
});
test('Moving contiguous or noncontiguous selected keys respects insertion boundaries and exact identity',()=>{
 const keys=Array.from({length:8},(_,sourceId)=>({sourceId,ticks:sourceId+1})),moving=[keys[1],keys[3],keys[4]];
 const result=moveKeys(keys,[1,3,4],8);assert.ok(result.changed);assert.deepEqual(result.indices,[5,6,7]);assert.deepEqual(keys.slice(-3),moving);
 assert.equal(moveKeys(keys,[5,6,7],8).changed,false);moveKeys(keys,[5,6,7],0);assert.deepEqual(keys.slice(0,3),moving);
});
test('Duplicate limits reject huge rows before modifying key arrays',()=>{
 const keys=Array.from({length:16384},()=>({sourceId:0,ticks:1}));assert.throws(()=>duplicateKeys(keys,[0],0),/16,384/);assert.equal(keys.length,16384);
});
test('Pack4Idle+8Walk into6×2 cells crosses row boundaries while retaining all logical rows and timing',()=>{
 const p=fresh();p.change(a=>{a[0].keys[1].ticks=4;a[1].fps=17;a[1].loop=false;});p.confirm();const merged=p.merge('row'),originalData=merged.data.slice(),manifest=structuredClone(merged.manifest.animations),packed=p.pack(6);
 assert.equal(packed.width,12);assert.equal(packed.height,4);assert.equal(packed.manifest.rows,2);assert.equal(packed.manifest.animationRows,2);assert.deepEqual(packed.manifest.animations,manifest);assert.equal(packed.frames[4].sheetRow,0);assert.equal(packed.frames[4].sheetColumn,4);
 for(const frame of packed.frames)assert.deepEqual(cell(packed,frame),p.sheet.frames[frame.sourceId].data);
 assert.deepEqual(merged.data,originalData);assert.equal(merged.manifest.layout,undefined);
});
test('Auto Pack globally minimizes occupied cell area within dimension bounds',()=>{
 const p=fresh();p.confirm();const m=p.merge('row'),cols=autoPackColumns(m),{min,max}=packingBounds(m),area=cols*Math.ceil(m.frames.length/cols);
 for(let candidate=min;candidate<=max;candidate++)assert.ok(area<=candidate*Math.ceil(m.frames.length/candidate));
 assert.equal(area,12);assert.throws(()=>packMerged(m,0));assert.throws(()=>packMerged(m,4097));
});
test('Repacking keeps image IDs, aliases and each exported tick pixel-exact',()=>{
 const p=fresh();p.change(a=>a[0].keys.push({sourceId:0,ticks:5}));p.confirm();p.merge('sheet');p.pack(6);const packed=p.pack(4);
 for(const [r,a] of p.confirmed.entries())for(let t=0;t<ticks(a);t++){const expected=frameAtSeconds(a,t/a.fps,false).key.sourceId,manifest=packed.manifest.animations[r],animation={...a,keys:manifest.timeline.map(k=>({sourceId:k.frame,ticks:k.ticks}))},id=frameAtSeconds(animation,t/a.fps,false).key.sourceId;assert.deepEqual(cell(packed,packed.frames[id]),p.sheet.frames[expected].data);}
});
test('DAT v1/v2 persist packed layout and timelines; edit/Undo invalidate Pack',async()=>{
 for(const paint of [false,true]){const p=fresh(),png=await encodePNG(fixture());if(paint){const b=p.sheet.frames[0].data.slice();b[0]=240;p.paintFrame(0,b);}p.confirm();p.merge('row');p.pack(6);const encoded=await encodeProject({project:p,pngBytes:png,sourceName:'Monster.png',view:{scope:'row'}}),decoded=await decodeProject(encoded);assert.equal(decoded.project.packColumns,6);assert.deepEqual(decoded.project.merged.data,p.merged.data);assert.deepEqual(decoded.pngBytes,png);assert.deepEqual(decoded.project.draft,p.draft);p.change(a=>a[0].keys.reverse());assert.equal(p.packColumns,null);assert.equal(p.merged,null);p.undo();assert.equal(p.packColumns,null);}
});
test('Separate PNGs follow logical key order with row-specific names, padding and exact RGBA',async()=>{
 const p=fresh();p.change(a=>{a[0].keys=[{sourceId:2,ticks:5},{sourceId:0,ticks:1},{sourceId:2,ticks:2}];});const before=p.sheet.image.data.slice(),entries=await frameEntries(p.sheet,p.draft,'Monstername');
 assert.equal(entries.files.length,11);assert.deepEqual(entries.files.slice(0,3).map(f=>f.name),['Monstername_Idle_FL_001.png','Monstername_Idle_FL_002.png','Monstername_Idle_FL_003.png']);assert.equal(entries.files[3].name,'Monstername_Idle_BL_001.png');
 for(const [r,a] of entries.animations.entries())for(const [i,k] of a.keys.entries()){const png=entries.files.find(f=>f.name===k.file),decoded=await decodePNG(png.data);assert.equal(decoded.width,2);assert.equal(decoded.height,2);assert.deepEqual(decoded.data,p.sheet.frames[p.draft[r].keys[i].sourceId].data);assert.equal(k.ticks,p.draft[r].keys[i].ticks);}
 assert.deepEqual(p.sheet.image.data,before);assert.equal(entries.files[0].data,entries.files[2].data);
});
test('Export names are stable, zero padded and protect Windows reserved names',()=>{
 assert.equal(frameFileName('Slime','ATK01 FL',8),'Slime_ATK01_FL_009.png');assert.equal(frameFileName('Slime','Idle FL',1000),'Slime_Idle_FL_1001.png');assert.equal(exportName('../Monster<>'),'Monster');assert.equal(exportName('CON'),'_CON');
});
test('ZIP bundles are flat, contain all files and reject invalid names or duplicate paths',async()=>{
 const frames=await frameEntries(fresh().sheet,fresh().draft,'Monster'),zip=zipFiles(frames.files),view=new DataView(zip.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(zip.length-22,true),0x06054b50);assert.equal(view.getUint16(zip.length-12,true),12);assert.throws(()=>zipFiles([]));assert.throws(()=>zipFiles([{name:'../bad.png',data:new Uint8Array()}]));assert.throws(()=>zipFiles([{name:'a.png',data:new Uint8Array()},{name:'a.png',data:new Uint8Array()}]));
});
test('Visible similarity ignores transparent padding and hidden RGB, retaining position and alpha differences',()=>{
 const a=new Uint8ClampedArray(100*4),b=a.slice();a.set([255,0,0,255],0);b.set([0,255,0,255],0);assert.equal(visibleSimilarity(a,b),0);assert.equal(visibleSimilarity(a,b,{threshold:95}),null);
 b.set([255,0,0,255],0);b.set([12,34,56,0],8);assert.equal(visibleSimilarity(a,b),100);b[3]=127;assert.ok(visibleSimilarity(a,b)<60);
});
test('Near-match labels do not round a differing image to an exact100%',()=>{
 assert.equal(similarityLabel(100),'100%');assert.equal(similarityLabel(99.999),'>99.99%');assert.equal(similarityLabel(95.123),'95.12%');
 const a=new Uint8ClampedArray([100,50,0,255,0,0,0,0]),b=new Uint8ClampedArray([101,50,0,255,10,20,30,0]);assert.deepEqual(visibleDifference(a,b),{changed:1,visible:1});
});
test('New workflow dialog IDs never collide with existing application controls',async()=>{
 const sources=await Promise.all(['../index.html','../app.mjs','../workflow-ui.mjs'].map(name=>readFile(new URL(name,import.meta.url),'utf8'))),ids=sources.flatMap(text=>[...text.matchAll(/\bid="([A-Za-z][A-Za-z0-9_-]*)"/g)].map(m=>m[1]));
 assert.equal(new Set(ids).size,ids.length,ids.filter((id,i)=>ids.indexOf(id)!==i).join(','));
});
test('Detect finds small visible differences, same-row only, without editing pixels/timing',async()=>{
 const p=fresh();const near=p.sheet.frames[0].data.slice();near[0]++;p.paintFrame(1,near);const before=p.sheet.image.data.slice(),draft=structuredClone(p.draft),result=await findSimilarFrames(p.sheet,p.draft,{threshold:99,yieldTask:async()=>{}});
 assert.ok(result.pairs.some(pair=>pair.a===0&&pair.b===1));assert.ok(result.pairs.every(pair=>p.sheet.frames[pair.a].row===p.sheet.frames[pair.b].row));assert.deepEqual(p.draft,draft);assert.deepEqual(p.sheet.image.data,before);
});
test('Similarity bounds do not hide a valid high-scoring match; cancelled/limited scans report their boundary',async()=>{
 const p=fresh(),wanted=[];for(const a of p.draft)for(let i=0;i<a.keys.length;i++)for(let j=i+1;j<a.keys.length;j++){const x=a.keys[i].sourceId,y=a.keys[j].sourceId;if(visibleSimilarity(p.sheet.frames[x].data,p.sheet.frames[y].data,{threshold:50})!=null)wanted.push(`${x}:${y}`);}
 const found=await findSimilarFrames(p.sheet,p.draft,{threshold:50,yieldTask:async()=>{}});assert.deepEqual(found.pairs.map(p=>`${p.a}:${p.b}`).sort(),wanted.sort());
 const aborted=new AbortController();aborted.abort();await assert.rejects(findSimilarFrames(p.sheet,p.draft,{signal:aborted.signal}),/abort/i);const limited=await findSimilarFrames(p.sheet,p.draft,{threshold:50,maxComparisons:0,yieldTask:async()=>{}});assert.equal(limited.limited,true);
});
test('User-approved near replacement preserves every Hold/FPS/Loop and is exactly undoable',()=>{
 const p=fresh(),before=structuredClone(p.draft),pixels=p.sheet.image.data.slice();p.change(a=>replaceSourceKeys(a,p.sheet,1,0));assert.equal(p.draft[0].keys[1].sourceId,0);assert.deepEqual(p.draft[0].keys.map(k=>k.ticks),before[0].keys.map(k=>k.ticks));assert.equal(p.draft[0].fps,before[0].fps);assert.deepEqual(p.sheet.image.data,pixels);p.undo();assert.deepEqual(p.draft,before);assert.throws(()=>p.change(a=>replaceSourceKeys(a,p.sheet,0,4)),/same animation row/);
});
test('Overlapping asynchronous jobs keep the busy state until every job has settled',async()=>{
 const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8'),fn=source.match(/^async function busy\(.*$/m)[0],classes=new Set();
 const state={busyCount:0,document:{body:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)}}},setTimeout:fn=>fn(),updateWorkflow(){},toast(){},console};
 vm.createContext(state);vm.runInContext(fn,state);let releaseA,releaseB;const a=new Promise(r=>releaseA=r),b=new Promise(r=>releaseB=r),first=state.busy(()=>a),second=state.busy(()=>b);
 await Promise.resolve();releaseA();await first;assert.ok(classes.has('busy'));assert.equal(state.busyCount,1);releaseB();await second;assert.equal(classes.has('busy'),false);assert.equal(state.busyCount,0);
});
