import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLayout,constrainLayout,DEFAULT_LAYOUT} from '../layout.mjs';
import {shortcutAction} from '../shortcuts.mjs';
test('invalid stored layout uses safe defaults without accepting string or infinite sizes',()=>{
 assert.deepEqual(normalizeLayout({sidebar:NaN,inspector:'900',timeline:Infinity,preview:null}),DEFAULT_LAYOUT);
 assert.deepEqual(normalizeLayout(null),DEFAULT_LAYOUT);
});
test('wide and narrow desktop layouts keep the viewport usable at extreme preferences',()=>{
 for(const width of [957,1076,1256,1600,2400]){
  const result=constrainLayout({sidebar:1600,inspector:1600,timeline:1600,preview:1600},{width,height:462,previewSpace:190});
  assert.ok(width-result.sizes.sidebar-result.sizes.inspector-24>=300);
  assert.equal(result.sizes.timeline,260);assert.equal(result.sizes.preview,72);
  for(const [key,size] of Object.entries(result.sizes))assert.ok(size>=result.limits[key][0]&&size<=result.limits[key][1]);
 }
});
test('window constraints do not destroy preferences and expanding restores requested panel sizes',()=>{
 const preferences={sidebar:310,inspector:580,timeline:380,preview:350},saved=structuredClone(preferences);
 const small=constrainLayout(preferences,{width:957,height:462,previewSpace:190});
 assert.ok(small.sizes.inspector<580&&small.sizes.timeline<380&&small.sizes.preview<350);
 const large=constrainLayout(preferences,{width:1900,height:1000,previewSpace:700});
 assert.deepEqual(large.sizes,preferences);assert.deepEqual(preferences,saved);
});
test('separator arrows, Space and Undo never invoke animation shortcuts',()=>{
 for(const code of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyZ','KeyY','Delete']){
  const target={tagName:'DIV',closest:selector=>selector==='[role="separator"]'?{}:null};
  assert.equal(shortcutAction({code,key:code,ctrlKey:code.startsWith('Key'),target},{hasProject:true}),null);
 }
});
