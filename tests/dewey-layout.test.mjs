import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceLayout,constrainLayout,DEFAULT_LAYOUT} from '../layout.mjs';

class Element{
 constructor(name='',orientation='vertical'){this.dataset={resize:name};this.attrs=new Map([['aria-orientation',orientation]]);this.events={};this.captured=new Set();this.style={data:new Map(),getPropertyValue(name){return this.data.get(name);},setProperty(name,value){this.data.set(name,value);}};this.classList={data:new Set(),add(...x){x.forEach(y=>this.data.add(y));},remove(...x){x.forEach(y=>this.data.delete(y));}};}
 addEventListener(name,handler){(this.events[name]??=[]).push(handler);}
 fire(name,extra={}){const event={button:0,pointerId:7,clientX:100,clientY:100,preventDefault(){},stopPropagation(){},...extra};for(const handler of this.events[name]??[])handler(event);}
 getAttribute(name){return this.attrs.get(name);}setAttribute(name,value){this.attrs.set(name,String(value));}
 setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}
 releasePointerCapture(id){this.captured.delete(id);this.fire('lostpointercapture',{pointerId:id});}focus(){}
}
function root(storage={getItem:()=>null,setItem(){}}){
 const app=new Element(),workspace=new Element(),reset=new Element(),body=new Element();app.clientHeight=940;workspace.clientWidth=1416;workspace.clientHeight=400;
 const heights={'.topbar':62,'.overview':64,'.workflow-guide':42,'.app-footer':30};app.querySelector=s=>({getBoundingClientRect:()=>({height:heights[s]})});
 const handles=['sidebar','inspector','preview','timeline'].map(name=>new Element(name,['preview','timeline'].includes(name)?'horizontal':'vertical'));
 const events={},frames=new Map();let frameId=0;
 const window={innerWidth:1440,localStorage:storage,ResizeObserver:class{constructor(callback){this.callback=callback;}observe(){}},addEventListener:(name,fn)=>{events[name]=fn;},requestAnimationFrame(callback){const id=++frameId;frames.set(id,callback);return id;},cancelAnimationFrame(id){frames.delete(id);}};
 return {defaultView:window,body,querySelector:s=>s==='.app'?app:workspace,querySelectorAll:()=>handles,getElementById:()=>reset,handles,events,frames,flushFrames(){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());}};
}
test('Dewey pointer cancellation, Escape and blur roll back unsaved drag with pointer capture cleanup',()=>{
 for(const cancel of ['pointercancel','Escape','blur','lostpointercapture']){
  let writes=0;const dom=root({getItem:()=>null,setItem(){writes++;}}),layout=new WorkspaceLayout(dom),h=dom.handles[0],before=layout.state.preferences;
  h.fire('pointerdown');h.fire('pointermove',{clientX:175});assert.equal(layout.state.preferences.sidebar,before.sidebar+75);
  if(cancel==='Escape')h.fire('keydown',{key:'Escape'});else if(cancel==='blur')dom.events.blur();else h.fire(cancel);
  assert.deepEqual(layout.state.preferences,before,cancel);assert.equal(layout.drag,null);assert.equal(h.hasPointerCapture(7),false);assert.equal(writes,0);assert.equal(dom.body.classList.data.size,0);
 }
});
test('Dewey mismatched pointer and secondary button cannot commit another active drag',()=>{
 let writes=0;const dom=root({getItem:()=>null,setItem(){writes++;}}),layout=new WorkspaceLayout(dom),h=dom.handles[0];
 h.fire('pointerdown',{button:2});assert.equal(layout.drag,null);h.fire('pointerdown');h.fire('pointermove',{pointerId:8,clientX:300});h.fire('pointerup',{pointerId:8});assert.equal(layout.current.sidebar,246);assert.ok(layout.drag);
 h.fire('pointermove',{clientX:150});h.fire('pointerup');assert.equal(layout.current.sidebar,296);assert.equal(writes,1);h.fire('pointerup');assert.equal(writes,1);
});
test('Dewey denied storage still permits resizing, keyboard and reset without throwing',()=>{
 const dom=root({getItem(){throw Error('denied');},setItem(){throw Error('quota');}}),layout=new WorkspaceLayout(dom),h=dom.handles[0];
 assert.deepEqual(layout.preferences,DEFAULT_LAYOUT);h.fire('keydown',{key:'ArrowRight',shiftKey:true});assert.equal(layout.preferences.sidebar,286);
 h.fire('pointerdown');h.fire('pointermove',{clientX:180});h.fire('pointerup');assert.equal(layout.preferences.sidebar,366);layout.reset();assert.deepEqual(layout.preferences,DEFAULT_LAYOUT);
});
test('Dewey random desktop constraints preserve preferences and a >=300px center',()=>{
 let seed=771;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let i=0;i<3000;i++){
  const prefs={sidebar:next()*2000,inspector:next()*2000,timeline:next()*2000,preview:next()*2000},saved=structuredClone(prefs),width=957+next()*2000;
  const result=constrainLayout(prefs,{width,height:350+next()*1000,previewSpace:180+next()*1000});
  assert.ok(width-result.sizes.sidebar-result.sizes.inspector-24>=299.5);assert.deepEqual(prefs,saved);
  for(const [name,size] of Object.entries(result.sizes))assert.ok(size>=result.limits[name][0]&&size<=Math.ceil(result.limits[name][1]));
 }
});
test('Dewey observer defers dimension writes and batches notifications into one animation frame',()=>{
 const dom=root(),layout=new WorkspaceLayout(dom);let applies=0;const original=layout.apply.bind(layout);layout.apply=()=>{applies++;return original();};
 layout.observer.callback();layout.observer.callback();layout.observer.callback();
 assert.equal(applies,0,'observer performed inline dimension mutation');assert.equal(dom.frames.size,1,'observer notifications not coalesced');
 dom.flushFrames();assert.equal(applies,1);assert.equal(dom.frames.size,0);
 layout.observer.callback();assert.equal(dom.frames.size,1);dom.flushFrames();assert.equal(applies,2);
});
