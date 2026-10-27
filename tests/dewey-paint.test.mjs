import test from 'node:test';
import assert from 'node:assert/strict';
import {PaintEditor} from '../paint-editor.mjs';

function harness({inside=true,hidden=false,modal=false,menu=false}={}){
 const oldDocument=globalThis.document;
 globalThis.document={querySelector:selector=>selector==='dialog[open]'?modal:menu};
 const changes=[],canvas={closest:()=>null},input={closest(){return this;}};
 const editor=Object.create(PaintEditor.prototype);
 Object.assign(editor,{root:{hidden,contains:target=>inside&&target===input},canvas,stroke:null,drag:null,space:false,onHistory:value=>changes.push(value),setTool:value=>changes.push(value),cancel:()=>{editor.stroke=null;editor.drag=null;changes.push('cancel');}});
 const event=(code,target=input,extra={})=>({code,key:code==='Space'?' ':code==='Escape'?'Escape':code,ctrlKey:false,metaKey:false,shiftKey:false,target,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra});
 return {editor,input,canvas,event,changes,restore:()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}};
}

test('Dewey SC-017 Paint input Space is consumed before animation shortcuts',()=>{
 const h=harness();try{const e=h.event('Space');assert.equal(h.editor.handleKey(e),true);assert.ok(e.prevented&&e.stopped);assert.deepEqual(h.changes,[]);assert.equal(h.editor.space,false);}finally{h.restore();}
});
test('Dewey Paint input guard does not alter external FPS or Hold Space routing',()=>{
 const h=harness({inside:false});try{const e=h.event('Space');assert.equal(h.editor.handleKey(e),false);assert.equal(e.prevented,false);}finally{h.restore();}
});
test('Dewey Paint text controls retain ordinary tool letters and text Undo',()=>{
 const h=harness();try{for(const code of ['KeyB','KeyE','KeyG','KeyI','KeyL','KeyH','KeyZ']){const e=h.event(code,h.input,{ctrlKey:code==='KeyZ'});assert.equal(h.editor.handleKey(e),false);assert.equal(e.prevented,false);}assert.deepEqual(h.changes,[]);}finally{h.restore();}
});
test('Dewey Canvas Space arms Pan while Delete and arrow keys stay in editor',()=>{
 const h=harness();try{const space=h.event('Space',h.canvas);assert.equal(h.editor.handleKey(space),true);assert.equal(h.editor.space,true);for(const code of ['Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){const e=h.event(code,h.canvas);assert.equal(h.editor.handleKey(e),true);assert.ok(e.prevented&&e.stopped);}assert.deepEqual(h.changes,[]);}finally{h.restore();}
});
test('Dewey Paint Escape cancels preview before any history operation',()=>{
 const h=harness();try{h.editor.stroke={pointer:5};const e=h.event('Escape',h.canvas);assert.equal(h.editor.handleKey(e),true);assert.equal(h.editor.painting,false);assert.deepEqual(h.changes,['cancel']);}finally{h.restore();}
});
test('Dewey hidden Paint and open menus/dialogs do not intercept controls',()=>{
 for(const config of [{hidden:true},{modal:true},{menu:true}]){const h=harness(config);try{const e=h.event('Space');assert.equal(h.editor.handleKey(e),false);assert.equal(e.prevented,false);assert.deepEqual(h.changes,[]);}finally{h.restore();}}
});
