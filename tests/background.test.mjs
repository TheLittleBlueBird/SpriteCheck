import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKGROUND_KEY,DEFAULT_BACKGROUND,normalizeBackground,loadBackground,saveBackground} from '../background.mjs';
test('Background preferences accept only checker/solid and strict RGB hex',()=>{
 assert.deepEqual(normalizeBackground({mode:'solid',color:'#AB23EF',pixels:'discard'}),{mode:'solid',color:'#ab23ef'});
 for(const value of [undefined,null,[],{},false,7,'red',{mode:'url(a)',color:'red'},{mode:'checker',color:'#fff'},{color:'#123456ff'},{color:'#123456;display:none'}])assert.deepEqual(normalizeBackground(value),DEFAULT_BACKGROUND);
});
test('Background storage survives close/open with no sprite or session state',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 assert.equal(saveBackground(storage,{mode:'solid',color:'#C0FFEE'}),true);
 assert.deepEqual([...values.keys()],[BACKGROUND_KEY]);
 assert.deepEqual(loadBackground(storage),{mode:'solid',color:'#c0ffee'});
 saveBackground(storage,{mode:'checker',color:'#c0ffee'});
 assert.deepEqual(loadBackground(storage),{mode:'checker',color:'#c0ffee'});
});
test('Corrupt, missing or denied preferences preserve a usable default view',()=>{
 for(const storage of [null,{getItem(){throw Error('denied');}},{getItem:()=>'{bad'},{getItem:()=>null}])assert.deepEqual(loadBackground(storage),DEFAULT_BACKGROUND);
 assert.equal(saveBackground({setItem(){throw Error('full');}},{mode:'solid',color:'#ffffff'}),false);
 assert.deepEqual(DEFAULT_BACKGROUND,{mode:'checker',color:'#242b3b'});
});
