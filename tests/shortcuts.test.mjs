import test from 'node:test';
import assert from 'node:assert/strict';
import {Project,sliceSheet,HISTORY_LIMIT} from '../core.mjs';
import {shortcutAction} from '../shortcuts.mjs';
const fresh=()=>new Project(sliceSheet({width:1,height:2,data:new Uint8ClampedArray([20,40,60,255,80,90,100,255])},{cellWidth:1,cellHeight:1}));
const key=(code,extra={})=>({code,key:code==='Space'?' ':code.replace('Key','').toLowerCase(),target:{tagName:'BUTTON'},...extra});
const action=(event,state={})=>shortcutAction(event,{hasProject:true,...state});
test('55 edits retain exactly 50 undo/redo steps and stop at both boundaries',()=>{
 const p=fresh();for(let i=1;i<=55;i++)p.change(a=>a[0].keys[0].ticks=i+1);
 assert.equal(HISTORY_LIMIT,50);assert.equal(p.undoStack.length,50);
 for(let i=0;i<50;i++)assert.equal(p.undo(),true);
 assert.equal(p.draft[0].keys[0].ticks,6);assert.equal(p.undo(),false);assert.equal(p.redoStack.length,50);
 for(let i=0;i<50;i++)assert.equal(p.redo(),true);
 assert.equal(p.draft[0].keys[0].ticks,56);assert.equal(p.redo(),false);assert.equal(p.undoStack.length,50);
});
test('new edit after undo discards redo branch, retaining edits on other rows',()=>{
 const p=fresh();p.change(a=>a[1].fps=20);p.change(a=>a[0].keys[0].ticks=4);p.change(a=>a[0].keys[0].ticks=8);p.undo();p.change(a=>a[0].keys[0].ticks=6);
 assert.equal(p.redo(),false);assert.equal(p.redoStack.length,0);assert.equal(p.draft[1].fps,20);p.undo();assert.equal(p.draft[0].keys[0].ticks,4);p.undo();assert.equal(p.draft[0].keys[0].ticks,1);p.undo();assert.equal(p.draft[1].fps,10);
});
test('rejected edit does not erase redo history or mutate an earlier snapshot',()=>{
 const p=fresh();p.change(a=>a[0].keys[0].ticks=5);p.undo();assert.throws(()=>p.change(a=>a[0].keys[0].ticks=0));assert.equal(p.redoStack.length,1);p.redo();assert.equal(p.draft[0].keys[0].ticks,5);assert.equal(p.sheet.original[0].keys[0].ticks,1);
});
test('Space resolves to play for buttons, numbers, checkbox, range and selector focus',()=>{
 for(const target of [{tagName:'BUTTON'},{tagName:'INPUT',type:'number'},{tagName:'INPUT',type:'checkbox'},{tagName:'INPUT',type:'range'},{tagName:'SELECT'}])assert.equal(action(key('Space',{target})),'play');
 assert.equal(action({key:'Spacebar'}),'play');assert.equal(action({key:' '}),'play');
});
test('Ctrl+Z / Ctrl+Y and Ctrl+Shift+Z support English and physical Thai-layout codes',()=>{
 assert.equal(action(key('KeyZ',{ctrlKey:true})),'undo');assert.equal(action(key('KeyY',{ctrlKey:true})),'redo');assert.equal(action(key('KeyZ',{ctrlKey:true,shiftKey:true})),'redo');
 assert.equal(action(key('KeyZ',{ctrlKey:true,key:'ผ'})),'undo');assert.equal(action(key('KeyY',{ctrlKey:true,key:'ั'})),'redo');assert.equal(action(key('KeyY',{metaKey:true})),'redo');
});
test('text editing, modal dialogs, composing input and handled keys retain their own behavior',()=>{
 for(const target of [{tagName:'INPUT',type:'text'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true}])assert.equal(action(key('KeyZ',{ctrlKey:true,target})),null);
 assert.equal(action(key('Space'),{modalOpen:true}),null);assert.equal(action(key('Space',{isComposing:true})),null);assert.equal(action(key('Space',{defaultPrevented:true})),null);
});
test('empty or busy projects and modified Space do not invoke playback',()=>{
 assert.equal(action(key('Space'),{hasProject:false}),null);assert.equal(action(key('Space'),{busy:true}),null);
 for(const modifier of ['ctrlKey','metaKey','altKey','shiftKey'])assert.equal(action(key('Space',{[modifier]:true})),null);
});

test('Arrow keys navigate only outside form controls; Delete preserves numeric editing',()=>{
 assert.equal(action(key('ArrowLeft')),'previous');assert.equal(action(key('ArrowRight')),'next');assert.equal(action(key('Delete')),'delete');
 for(const target of [{tagName:'INPUT',type:'number'},{tagName:'INPUT',type:'range'},{tagName:'SELECT'}]){
  assert.equal(action(key('ArrowRight',{target})),null);assert.equal(action(key('Delete',{target})),null);
 }
});
