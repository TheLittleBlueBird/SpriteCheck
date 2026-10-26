import test from 'node:test';
import assert from 'node:assert/strict';
import {shortcutAction} from '../shortcuts.mjs';
test('open File menu owns Space, arrows, Delete and project Undo/Redo',()=>{
 for(const code of ['Space','ArrowLeft','ArrowRight','Delete','KeyZ','KeyY'])assert.equal(shortcutAction({code,key:code,target:{tagName:'BUTTON'},ctrlKey:code.startsWith('Key')},{hasProject:true,menuOpen:true}),null);
});
test('File trigger retains native keyboard activation even when menu is closed',()=>{
 const target={tagName:'BUTTON',closest:selector=>selector==='[data-file-menu]'?{}:null};
 assert.equal(shortcutAction({code:'Space',key:' ',target},{hasProject:true}),null);
 assert.equal(shortcutAction({code:'ArrowRight',key:'ArrowRight',target},{hasProject:true}),null);
});
