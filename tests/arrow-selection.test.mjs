import {KeySelection} from '../timeline-selection.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Project,sliceSheet,frameAtSeconds,ticks} from '../core.mjs';
import {selectionAtTime,selectedTimelineIndex} from '../frame-edit.mjs';

const data=Uint8ClampedArray.from({length:32},(_,i)=>i%4===3?255:20+Math.floor(i/8)*40);
const fresh=()=>new Project(sliceSheet({width:4,height:2,data},{cellWidth:1,cellHeight:1}));
const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
const line=name=>source.match(new RegExp(`^function ${name}\\(.*$`,'m'))[0];

test('Tick navigation retains held keys until the next boundary, including repeated source occurrences',()=>{
 const p=fresh();p.change(a=>a[0].keys=[{sourceId:2,ticks:3},{sourceId:0,ticks:1},{sourceId:2,ticks:2}]);
 const expected=[0,0,0,1,2,2];
 for(let tick=0;tick<6;tick++)assert.deepEqual(selectionAtTime(p,0,'edited',tick/10,true),{keyIndex:expected[tick],sourceId:p.draft[0].keys[expected[tick]].sourceId,timelineIndex:expected[tick]});
});
test('Original selection uses its own timeline index and safely inspects removed source cells',()=>{
 const p=fresh();p.change(a=>a[0].keys=[{sourceId:1,ticks:2},{sourceId:0,ticks:1}]);
 assert.deepEqual(selectionAtTime(p,0,'original',.1,true),{keyIndex:0,sourceId:1,timelineIndex:1});
 assert.equal(selectedTimelineIndex(p,0,'original',0,1),1);
 assert.deepEqual(selectionAtTime(p,0,'original',.2,true),{keyIndex:-1,sourceId:2,timelineIndex:2});
 assert.equal(selectedTimelineIndex(p,0,'original',-1,2),2);
});
test('Merged playback maps time through logical source keys rather than compressed packed-key indices',()=>{
 const p=fresh();p.change(a=>a[0].keys=[{sourceId:0,ticks:1},{sourceId:1,ticks:2},{sourceId:2,ticks:1}]);p.confirm();p.merge('row');
 assert.equal(p.merged.manifest.animations[0].timeline.length,2);
 assert.deepEqual(selectionAtTime(p,0,'merged',.1,true),{keyIndex:1,sourceId:1,timelineIndex:1});
 assert.deepEqual(selectionAtTime(p,0,'merged',.3,true),{keyIndex:2,sourceId:2,timelineIndex:2});
});
test('Empty rows and missing selection do not select an unrelated key',()=>{
 const p=fresh();p.change(a=>a[0].keys=[]);
 assert.deepEqual(selectionAtTime(p,0,'edited',0,true),{keyIndex:-1,sourceId:null,timelineIndex:-1});
 assert.equal(selectedTimelineIndex(p,0,'edited',-1,null),-1);
 assert.equal(selectedTimelineIndex(p,1,'edited',0,0),-1);
 assert.deepEqual(selectionAtTime(p,1,'edited',.1,true),{keyIndex:1,sourceId:5,timelineIndex:1});
});
test('Loop and non-loop clocks, including long Compare clocks, resolve the correct source key',()=>{
 const p=fresh();
 assert.equal(selectionAtTime(p,0,'edited',1,true).keyIndex,2);
 assert.equal(selectionAtTime(p,0,'edited',1,false).keyIndex,3);
 assert.equal(selectionAtTime(p,0,'edited',-.1,false).keyIndex,0);
});

function harness(project=fresh(),mode='edited'){
 const controls=new Map(),cards=Array.from({length:project.sheet.original[0].keys.length},(_,i)=>({dataset:{index:String(i)},selected:i===0,classList:{remove(){},toggle(name,on){if(name==='selected')cards[i].selected=on;}},closest:()=>true,focus(){state.focused=i;}}));
 const root={querySelectorAll:()=>cards,querySelector:()=>cards.find(k=>k.selected)};
 controls.set('keyframes',root);controls.set('loop',{checked:true});
 const state={keySelection:new KeySelection(),selectionOwner:null,selectionKeys:null,project,row:0,selectedKey:0,selectedSource:0,mode,sheetMode:'original',seconds:0,playing:true,selectionAtTime,selectedTimelineIndex,
  document:{body:{classList:{contains:()=>false}},activeElement:cards[0]},timelineDrag:{cancel(){}},paintEditor:{setContext(p,id){state.paintSource=id;}},
  renderInspector(){state.inspectorSource=state.selectedSource;},updateFrameTools(){},drawSheet(){state.sheetSource=state.selectedSource;},drawDynamic(){state.previewSource=frameAtSeconds(state.activeAnimation(),state.seconds,true)?.key.sourceId;},revealSelected(){state.revealed=true;},revealTimelineKey(){},
  playbackDuration:()=>ticks(state.activeAnimation())/state.activeAnimation().fps,$:id=>{if(!controls.has(id))controls.set(id,{});return controls.get(id);}};
 const start=source.indexOf('function seekPlayback('),end=source.indexOf("$('scrubber').oninput",start),last=source.indexOf('\n',end);
 vm.createContext(state);vm.runInContext([line('activeAnimation'),source.slice(start,last)].join('\n'),state);
 return {state,controls,cards};
}
test('Actual next/previous/first/scrubber handlers synchronize source, timeline, inspector, preview and focus',()=>{
 const {state:s,controls,cards}=harness();
 controls.get('nextFrame').onclick();
 assert.equal(s.seconds,.1);assert.equal(s.playing,false);assert.equal(s.selectedKey,1);
 for(const name of ['selectedSource','sheetSource','previewSource','inspectorSource','paintSource'])assert.equal(s[name],1,name);
 assert.equal(cards[1].selected,true);assert.equal(cards[0].selected,false);assert.equal(s.focused,1);assert.ok(s.revealed);
 controls.get('prevFrame').onclick();assert.equal(s.selectedSource,0);
 controls.get('scrubber').oninput({target:{value:'3'}});assert.equal(s.selectedSource,3);
 controls.get('firstFrame').onclick();assert.equal(s.selectedSource,0);assert.equal(s.seconds,0);
});
test('Actual seeking preserves edits, redo, pixels, dirty status, confirmed data and merged results',()=>{
 const p=fresh();p.change(a=>a[0].keys[0].ticks=4);p.undo();
 const {state:s,controls}=harness(p),draft=p.draft,undo=p.undoStack,redo=p.redoStack,pixels=p.sheet.image.data.slice();
 for(let i=0;i<20;i++)controls.get('nextFrame').onclick();
 assert.equal(p.draft,draft);assert.equal(p.undoStack,undo);assert.equal(p.redoStack,redo);assert.deepEqual(p.sheet.image.data,pixels);
 p.redo();p.confirm();const merged=p.merge('row'),confirmed=p.confirmed;
 s.seekPlayback(.2);assert.equal(p.merged,merged);assert.equal(p.confirmed,confirmed);assert.equal(p.dirty,false);
});
test('Actual Original navigation highlights original indices while selecting the matching edited source for inspection',()=>{
 const p=fresh();p.change(a=>a[0].keys=[{sourceId:1,ticks:2},{sourceId:0,ticks:1}]);
 const {state:s,controls,cards}=harness(p,'original');controls.get('nextFrame').onclick();
 assert.equal(s.mode,'original');assert.equal(s.selectedKey,0);assert.equal(s.selectedSource,1);assert.ok(cards[1].selected);assert.equal(s.focused,1);
 controls.get('nextFrame').onclick();assert.equal(s.selectedKey,-1);assert.equal(s.selectedSource,2);assert.ok(cards[2].selected);
});
test('Merged-sheet selection resolves duplicate aliases to their shared packed cell',()=>{
 const p=fresh();p.confirm();p.merge('row');const state={project:p,sheetMode:'merged',selectedSource:1};
 vm.runInNewContext(line('selectedSheetFrame')+';result=selectedSheetFrame();',state);
 assert.equal(state.result,p.merged.frames[p.merged.sourceToFrame.get(1)]);assert.equal(state.result.sourceId,0);
});
test('Empty/busy projects and invalid time reject seeking without changing playback or selection',()=>{
 const {state:s}=harness();s.seekPlayback(NaN);assert.equal(s.playing,true);assert.equal(s.seconds,0);
 s.document.body.classList.contains=()=>true;s.seekPlayback(.1);assert.equal(s.selectedSource,0);
 s.project=null;s.seekPlayback(.1);assert.equal(s.selectedSource,0);
});
