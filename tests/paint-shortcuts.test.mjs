import test from 'node:test';
import assert from 'node:assert/strict';
import {PaintEditor} from '../paint-editor.mjs';
function pointerHarness({tool='pencil',space=false,original=false,button=0,altKey=true,x=0}={}){
 const previous=globalThis.document;globalThis.document={body:{classList:{contains:()=>false}}};
 const editor=Object.create(PaintEditor.prototype),data=new Uint8ClampedArray([1,2,3,4]),baseline=new Uint8ClampedArray([5,6,7,8]),calls=[];
 Object.assign(editor,{root:{hidden:false},project:{sheet:{frames:[{data}],grid:{cellWidth:1,cellHeight:1}},originalSheet:{frames:[{data:baseline}]}},sourceId:0,tool,space,stroke:null,drag:null,canvas:{focus(){},style:{}},stage:{clientWidth:40,clientHeight:40},zoom:1,pan:{x:0,y:0},size:1,color:[99,88,77,66],onBegin(){},position:()=>({x,y:0}),capture:()=>calls.push('capture'),draw(){},$:()=>({checked:original}),onMessage:()=>calls.push('readonly')});
 editor.down({button,altKey,pointerId:3,clientX:10,clientY:10,preventDefault(){}});
 return {editor,calls,data,restore(){if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}};
}
test('Alt+left samples exact RGBA without modifying pixels/history or active tool',()=>{
 for(const tool of ['pencil','eraser','fill','line','hand','eyedropper'])for(const space of [false,true]){
  const h=pointerHarness({tool,space});try{assert.deepEqual(h.editor.color,[1,2,3,4]);assert.deepEqual([...h.data],[1,2,3,4]);assert.equal(h.editor.tool,tool);assert.equal(h.editor.stroke,null);assert.equal(h.editor.drag,null);assert.deepEqual(h.calls,[]);}finally{h.restore();}
 }
});
test('Alt picker reads Original RGBA and ignores clicks outside a frame',()=>{
 const h=pointerHarness({original:true});try{assert.deepEqual(h.editor.color,[5,6,7,8]);assert.deepEqual(h.calls,[]);}finally{h.restore();}
 const outside=pointerHarness({x:2});try{assert.deepEqual(outside.editor.color,[99,88,77,66]);assert.equal(outside.editor.stroke,null);}finally{outside.restore();}
});
test('Alt+right still erases; middle button and Space still pan with picker selected',()=>{
 const h=pointerHarness({button:2});try{assert.deepEqual(h.editor.color,[99,88,77,66]);assert.deepEqual([...h.editor.stroke.buffer],[0,0,0,0]);}finally{h.restore();}
 for(const options of [{button:1},{button:0,tool:'eyedropper',space:true,altKey:false}]){const p=pointerHarness(options);try{assert.ok(p.editor.drag);assert.equal(p.editor.stroke,null);assert.deepEqual(p.editor.color,[99,88,77,66]);}finally{p.restore();}}
});
