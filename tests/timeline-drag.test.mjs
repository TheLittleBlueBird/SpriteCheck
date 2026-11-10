import test from 'node:test';
import assert from 'node:assert/strict';
import {TimelineDrag,dropSlot,keyMoveIndex,moveKeyToSlot} from '../timeline-drag.mjs';
import {Project,sliceSheet,ticks,frameAtSeconds} from '../core.mjs';
import {encodePNG} from '../png.mjs';
import {encodeProject,decodeProject} from '../project-file.mjs';

const image={width:5,height:2,data:Uint8ClampedArray.from({length:40},(_,i)=>i%4===3?255:i+10)};
const fresh=()=>new Project(sliceSheet(image,{cellWidth:1,cellHeight:1}));
const sources=a=>a.keys.map(k=>k.sourceId);

test('Drop boundaries use card centers and include the blank start/end areas',()=>{
 const rects=[{left:20,width:60},{left:85,width:100},{left:190,width:60}];
 assert.deepEqual([-30,49,50,100,135,220,600].map(x=>dropSlot(rects,x)),[0,0,1,1,2,3,3]);
 assert.equal(dropSlot([],100),0);
});
test('Moving forward, backward, first and last preserves exact key objects and holds',()=>{
 const keys=[{sourceId:0,ticks:1},{sourceId:0,ticks:7},{sourceId:2,ticks:3},{sourceId:3,ticks:2}],held=keys[1];
 assert.equal(moveKeyToSlot(keys,1,4),true);assert.equal(keys[3],held);
 assert.deepEqual(keys.map(k=>k.ticks),[1,3,2,7]);
 assert.equal(moveKeyToSlot(keys,3,0),true);assert.equal(keys[0],held);
 assert.deepEqual(keys.map(k=>k.sourceId),[0,0,2,3]);
 assert.equal(moveKeyToSlot(keys,0,2),true);assert.equal(keys[1],held);
 assert.equal(keyMoveIndex(4,1,4),3);
});
test('Both adjacent slots and invalid indices are no-ops, including empty/single-key rows',()=>{
 for(const [from,slot] of [[1,1],[1,2],[-1,0],[4,0],[0,-1],[0,5],[0,1.5]]){
  const keys=[1,2,3,4],before=[...keys];assert.equal(moveKeyToSlot(keys,from,slot),false);assert.deepEqual(keys,before);
 }
 assert.equal(moveKeyToSlot([],0,0),false);assert.equal(moveKeyToSlot([1],0,1),false);
});
test('Reorder changes only its row and uses one shared history entry; 50 Undo/Redo steps remain exact',()=>{
 const p=fresh(),pixels=p.sheet.image.data.slice(),original=structuredClone(p.sheet.original),other=structuredClone(p.draft[1]);
 p.change(a=>{a[0].keys[1].ticks=7;a[0].fps=17;a[0].loop=false;});
 const snapshots=[structuredClone(p.draft)];
 for(let i=0;i<55;i++){p.change(a=>moveKeyToSlot(a[0].keys,0,5));snapshots.push(structuredClone(p.draft));}
 assert.equal(p.undoStack.length,50);assert.deepEqual(p.draft[1],other);assert.equal(p.draft[0].fps,17);assert.equal(p.draft[0].loop,false);assert.equal(ticks(p.draft[0]),11);
 for(let i=0;i<50;i++)assert.equal(p.undo(),true);assert.deepEqual(p.draft,snapshots[5]);assert.equal(p.undo(),false);
 for(let i=0;i<50;i++)assert.equal(p.redo(),true);assert.deepEqual(p.draft,snapshots[55]);assert.equal(p.redo(),false);
 assert.deepEqual(p.sheet.image.data,pixels);assert.deepEqual(p.sheet.original,original);
});
test('No-op drops preserve redo and an already merged result',()=>{
 const p=fresh();p.change(a=>moveKeyToSlot(a[0].keys,0,5));p.undo();
 assert.equal(p.change(a=>moveKeyToSlot(a[0].keys,1,2)),false);assert.equal(p.redoStack.length,1);
 p.redo();p.confirm();const merged=p.merge('row');
 assert.equal(p.change(a=>moveKeyToSlot(a[0].keys,1,1)),false);assert.equal(p.merged,merged);assert.equal(p.dirty,false);
});
test('Reordered DAT v1/v2 and Merge retain duplicate occurrences, holds, pixels, FPS and Loop',async()=>{
 for(const paint of [false,true]){
  const p=fresh(),png=await encodePNG(image);
  if(paint){const pixels=p.sheet.frames[1].data.slice();pixels[0]=222;p.paintFrame(1,pixels);}
  p.change(a=>{a[0].keys.splice(2,0,{sourceId:1,ticks:6});a[0].fps=19;a[0].loop=false;moveKeyToSlot(a[0].keys,2,6);});
  const decoded=await decodeProject(await encodeProject({project:p,pngBytes:png,sourceName:'keys.png'}));
  assert.deepEqual(decoded.project.draft,p.draft);assert.deepEqual(decoded.pngBytes,png);
  p.confirm();for(const scope of ['row','sheet']){
   const merged=p.merge(scope),a=p.draft[0],manifest=merged.manifest.animations[0];
   assert.equal(manifest.fps,19);assert.equal(manifest.loop,false);assert.equal(manifest.totalTicks,ticks(a));
   const packed={...a,keys:manifest.timeline.map(k=>({sourceId:k.frame,ticks:k.ticks}))};
   for(let tick=0;tick<ticks(a);tick++){
    const expected=p.sheet.frames[frameAtSeconds(a,tick/a.fps,false).key.sourceId].data;
    const actual=merged.frames[frameAtSeconds(packed,tick/a.fps,false).key.sourceId],offset=(actual.y*merged.width+actual.x)*4;
    assert.deepEqual(merged.data.subarray(offset,offset+4),expected);
   }
  }
 }
});

function harness(){
 const frames=new Map(),listeners=new Map();let next=0;
 const classes=()=>{const set=new Set();return {add:v=>set.add(v),remove:v=>set.delete(v),contains:v=>set.has(v)};};
 const win={requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),addEventListener:(n,f)=>listeners.set(n,f)};
 const doc={defaultView:win,addEventListener:(n,f)=>listeners.set(n,f),createElement:()=>({style:{},classList:classes(),setAttribute(){},remove(){root.marker=null;}})};
 const root={ownerDocument:doc,scrollLeft:0,scrollWidth:500,clientWidth:250,classList:classes(),addEventListener:(n,f)=>listeners.set(n,f),contains:el=>cards.includes(el),querySelectorAll:()=>cards,
  getBoundingClientRect:()=>({left:10,right:260,top:20,bottom:100,width:250}),append:m=>root.marker=m,hasPointerCapture:()=>false,setPointerCapture(){}};
 const cards=Array.from({length:5},(_,i)=>({dataset:{index:String(i)},classList:classes(),closest(){return this;},getBoundingClientRect:()=>({left:10+i*100-root.scrollLeft,right:110+i*100-root.scrollLeft,width:100})}));
 const state={enabled:true,owner:{},row:0,keys:[0,1,2,3,4]},moves=[];let starts=0;
 const drag=new TimelineDrag(root,{getState:()=>state,onMove:(from,slot)=>{moves.push([from,slot]);moveKeyToSlot(state.keys,from,slot);},onStart:()=>starts++});
 const event=(x=40,y=50,extra={})=>({button:0,buttons:1,isPrimary:true,pointerId:3,clientX:x,clientY:y,target:cards[0],preventDefault(){this.prevented=true;},...extra});
 const begin=()=>{drag.down(event());drag.move(event(50));};
 const tick=t=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn(t);};
 return {drag,state,root,cards,moves,frames,event,begin,tick,listeners,get starts(){return starts;}};
}
test('Pointer drag commits once on release, including blank space at the end after edge scrolling',()=>{
 const h=harness();h.begin();assert.equal(h.starts,1);assert.deepEqual(h.moves,[]);assert.ok(h.root.marker);
 h.drag.move(h.event(255));for(let t=16;t<=800;t+=16)h.tick(t);
 assert.equal(h.root.scrollLeft,250);h.drag.up(h.event(255));
 assert.deepEqual(h.moves,[[0,5]]);assert.deepEqual(h.state.keys,[1,2,3,4,0]);assert.equal(h.frames.size,0);assert.equal(h.root.marker,null);
});
test('Click jitter never edits, right/secondary pointers do not start a gesture',()=>{
 const h=harness();h.drag.down(h.event());h.drag.move(h.event(42));h.drag.up(h.event(42));assert.equal(h.starts,0);assert.deepEqual(h.moves,[]);
 for(const extra of [{button:2},{isPrimary:false}]){h.drag.down(h.event(40,50,extra));assert.equal(h.drag.gesture,null);}
});
test('Escape, outside release, lost button, pointer cancellation and blur cancel without changing data',()=>{
 for(const cancel of [h=>h.listeners.get('keydown')({...h.event(),key:'Escape',stopImmediatePropagation(){}}),h=>h.drag.up(h.event(400,200)),h=>h.drag.move(h.event(100,50,{buttons:0})),h=>h.listeners.get('pointercancel')(h.event()),h=>h.listeners.get('blur')()]){
  const h=harness();h.begin();cancel(h);assert.equal(h.drag.gesture,null);assert.equal(h.frames.size,0);assert.deepEqual(h.state.keys,[0,1,2,3,4]);assert.deepEqual(h.moves,[]);
 }
});
test('Project/row/timeline replacement and busy/read-only states reject stale or unwanted drops',()=>{
 for(const update of [s=>s.owner={},s=>s.row=1,s=>s.keys=[0,1,2,3,4],s=>s.enabled=false]){
  const h=harness();h.begin();update(h.state);h.drag.up(h.event(220));assert.deepEqual(h.moves,[]);assert.equal(h.frames.size,0);
 }
 const h=harness();h.state.enabled=false;h.drag.down(h.event());assert.equal(h.drag.gesture,null);
});
