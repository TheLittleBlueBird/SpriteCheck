import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Project,sliceSheet,ticks,frameAtSeconds,clone,mergeSheet} from '../core.mjs';
import {encodePNG} from '../png.mjs';
import {encodeProject,decodeProject} from '../project-file.mjs';
import {shortcutAction} from '../shortcuts.mjs';

const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
const image={width:3,height:2,data:new Uint8ClampedArray([
  255,0,0,255, 0,255,0,255, 255,0,0,255,
  255,0,0,255, 0,0,255,255, 255,0,0,255
])};
const grid={cellWidth:1,cellHeight:1,offsetX:0,offsetY:0,gapX:0,gapY:0};
const png=await encodePNG(image);
const fresh=()=>new Project(sliceSheet(image,grid));
async function withViewField(dat,selectedSource){
  const header=new DataView(dat.buffer,dat.byteOffset,dat.byteLength),length=header.getUint32(20,true);
  const meta=JSON.parse(new TextDecoder().decode(dat.subarray(64,64+length)));
  meta.view.selectedSource=selectedSource;
  const json=new TextEncoder().encode(JSON.stringify(meta)),png=dat.subarray(64+length);
  const out=new Uint8Array(64+json.length+png.length);out.set(dat.subarray(0,64));
  new DataView(out.buffer).setUint32(20,json.length,true);out.set(json,64);out.set(png,64+json.length);
  out.set(new Uint8Array(await crypto.subtle.digest('SHA-256',out.subarray(64))),32);return out;
}
function line(name){return source.match(new RegExp(`^function ${name}\\(.*$`,'m'))[0];}
function block(start,end){return source.slice(source.indexOf(start),source.indexOf(end));}
function harness(project){
  const controls=new Map();
  const context={project,row:0,selectedKey:0,selectedSource:0,mode:'edited',sheetMode:'original',tab:'sheet',seconds:0,
    playing:false,zoom:null,pngExport:null,sourceName:'dewey.png',sourcePNG:png,sourceBytes:png.length,
    rawImage:image,grid,loadToken:0,frameCanvases:new Map(),mergedCanvases:new Map(),
    clone,ticks,frameAtSeconds,encodePNG,decodeProject,render(){},toast(){},
    busy:task=>task(),safeName:()=> 'dewey',
    compareView:{settings:{},restore(){}},
    $:id=>{if(!controls.has(id))controls.set(id,{value:id==='mergeScope'?'row':'',checked:true});return controls.get(id);}
  };
  vm.createContext(context);
  vm.runInContext([
    line('activeAnimation'),
    block('function selectSource(', 'function revealSelected('),
    block('async function loadDAT(', 'function projectView('),
    line('projectView')
  ].join('\n'),context);
  return context;
}

test('Dewey DAT preserves removed-source inspection so Add Key restores the same source',async()=>{
  const p=fresh();p.change(a=>a[0].keys.splice(1,1));
  const h=harness(p);h.selectSource(1);
  assert.equal(h.selectedKey,-1);assert.equal(h.selectedSource,1);assert.equal(h.mode,'original');
  const dat=await encodeProject({project:p,pngBytes:png,sourceName:'dewey.png',view:h.projectView()});
  await h.loadDAT(dat);
  const restoredSource=h.selectedSource;
  // Execute the exact Add Key callback's target/source mutation after loading.
  const target=h.selectedKey<0?h.project.draft[h.row].keys.length:h.selectedKey+1;
  h.project.change(rows=>rows[h.row].keys.splice(target,0,{sourceId:h.selectedSource,ticks:1}));
  const appended=h.project.draft[0].keys.at(-1).sourceId;
  assert.equal(restoredSource,1,`restored source=${restoredSource}; Add Key source=${appended}; expected=1`);
  assert.equal(appended,1);
});

test('Dewey alias merge preserves exact pixels and ticks for arbitrary reordered holds in both scopes',()=>{
  for(const scope of ['row','sheet'])for(let n=1;n<=20;n++){
    const p=fresh();p.change(a=>a.forEach((r,i)=>{r.fps=1+(n*7+i)%120;r.loop=!!(n%2);r.keys.reverse();r.keys[0].ticks=n;r.keys[1].ticks=999;}));
    const m=mergeSheet(p.sheet,p.draft,scope);
    for(const [r,a] of p.draft.entries()){
      const packed={...a,keys:m.manifest.animations[r].timeline.map(k=>({sourceId:k.frame,ticks:k.ticks}))};
      assert.equal(ticks(packed),ticks(a));
      for(let t=0;t<ticks(a);t++){
        const original=frameAtSeconds(a,t/a.fps,false).key.sourceId;
        const actual=frameAtSeconds(packed,t/a.fps,false).key.sourceId;
        const f=m.frames[actual],pixel=m.data.slice((f.y*m.width+f.x)*4,(f.y*m.width+f.x)*4+4);
        assert.deepEqual(pixel,p.sheet.frames[original].data);
      }
      assert.equal(frameAtSeconds(a,ticks(a)/a.fps,true).index,0);
      assert.equal(frameAtSeconds(a,ticks(a)/a.fps,false).index,a.keys.length-1);
    }
  }
});

test('Dewey no-op and invalid changes preserve redo and merge in neighboring workflows',()=>{
  const p=fresh();p.change(a=>a[0].fps=23);p.undo();
  assert.equal(p.change(a=>a[0].fps=10),false);assert.equal(p.redoStack.length,1);
  assert.throws(()=>p.change(a=>a[0].keys[0].ticks=0));assert.equal(p.redoStack.length,1);
  p.redo();p.confirm();const merged=p.merge('sheet');
  assert.equal(p.change(a=>a[0].fps=23),false);assert.equal(p.merged,merged);assert.equal(p.dirty,false);
});

test('Dewey modified shortcuts stay scoped to actual focus and app state',()=>{
  for(const target of [{tagName:'INPUT',type:'text'},{tagName:'INPUT',type:'search'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true}])
    for(const code of ['Space','KeyZ','KeyY','Delete','ArrowRight'])assert.equal(shortcutAction({target,code,ctrlKey:code.startsWith('Key')},{hasProject:true}),null);
  for(const state of [{hasProject:false},{hasProject:true,modalOpen:true},{hasProject:true,busy:true}])
    assert.equal(shortcutAction({code:'Delete',target:{tagName:'BUTTON'}},state),null);
});

test('Dewey legacy DAT and invalid/cross-row source selection normalize to a source in the active row',async()=>{
  const p=fresh(),dat=await encodeProject({project:p,pngBytes:png,sourceName:'dewey.png',view:{row:0,selectedKey:-1}});
  for(const value of [undefined,-1,99999,1.5,'1',null,3,4,5]){
    const h=harness(p);await h.loadDAT(await withViewField(dat,value));
    assert.equal(h.project.sheet.frames[h.selectedSource]?.row,0,`bad source=${value}; restored=${h.selectedSource}`);
  }
});

test('Dewey DAT selected key wins over stale selectedSource when the key still exists',async()=>{
  const p=fresh(),dat=await encodeProject({project:p,pngBytes:png,sourceName:'dewey.png',view:{row:0,selectedKey:0,selectedSource:1}});
  const h=harness(p);await h.loadDAT(dat);assert.equal(h.selectedSource,0);
});

test('Dewey DAT roundtrip keeps empty edited rows, old confirmation, exact PNG and starts new history',async()=>{
  const p=fresh();p.confirm();const confirmed=clone(p.confirmed);p.change(a=>a[0].keys=[]);
  const data=await encodeProject({project:p,pngBytes:png,sourceName:'dewey.png'}),r=await decodeProject(data);
  assert.deepEqual(r.pngBytes,png);assert.deepEqual(r.project.draft[0].keys,[]);
  assert.deepEqual(r.project.confirmed,confirmed);assert.equal(r.project.dirty,true);
  assert.equal(r.project.undoStack.length,0);assert.equal(r.project.redoStack.length,0);
  assert.equal(p.sheet.original[0].keys.length,3);
});
