import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {assertImageSize,MAX_IMAGE_SIDE,MAX_IMAGE_PIXELS,fitImportGrid} from '../image-limits.mjs';
import {encodePNG,decodePNG} from '../png.mjs';
import {sliceSheet,mergeSheet} from '../core.mjs';
import {PaintEditor} from '../paint-editor.mjs';
import {detectUniformGrid} from '../grid-detect.mjs';
test('8192 dimensions are inclusive on both axes, with clear validation before allocation',async()=>{
 assert.equal(MAX_IMAGE_SIDE,8192);assert.equal(MAX_IMAGE_PIXELS,67108864);
 for(const [w,h] of [[1,1],[8192,1],[1,8192],[8192,8192],[8192,4096]])assert.doesNotThrow(()=>assertImageSize(w,h));
 for(const [w,h] of [[8193,1],[1,8193],[0,4],[-1,4],[1.5,4],[NaN,4],[Infinity,4]]){assert.throws(()=>assertImageSize(w,h),/8192/);await assert.rejects(encodePNG({width:w,height:h,data:[]}),/8192/);assert.throws(()=>sliceSheet({width:w,height:h},{cellWidth:1,cellHeight:1}),/8192/);}
});
test('Large imports suggest a usable grid while valid custom grids/margins remain unchanged',()=>{
 const image={width:8192,height:8192},old={cellWidth:105,cellHeight:115,offsetX:0,offsetY:0,gapX:0,gapY:0};
 const grid=fitImportGrid(image,old);assert.deepEqual(grid,{...old,cellWidth:210,cellHeight:230});assert.ok(Math.floor(8192/grid.cellWidth)*Math.floor(8192/grid.cellHeight)<=4096);assert.equal(old.cellWidth,105);
 const custom={cellWidth:128,cellHeight:128,offsetX:0,offsetY:0,gapX:0,gapY:0};assert.deepEqual(fitImportGrid(image,custom),custom);
 const margins={cellWidth:256,cellHeight:256,offsetX:20,offsetY:10,gapX:4,gapY:6};assert.deepEqual(fitImportGrid(image,margins),margins);
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>fitImportGrid(image,{...old,cellWidth:value}),/Grid/);
 assert.deepEqual(fitImportGrid({width:2,height:2},old),{...old,cellWidth:2,cellHeight:2});
});
// A tiny independently encoded header exercises rejection before decompression.
function chunk(type,data){const name=Buffer.from(type),bytes=Buffer.concat([name,data]);let crc=0xffffffff;for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const n=Buffer.alloc(4),tail=Buffer.alloc(4);n.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([n,bytes,tail]);}
function headerPNG(w,h){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr.set([8,6],8);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.alloc(5))),chunk('IEND',Buffer.alloc(0))]);}
test('Oversized PNG headers are rejected without allocating their declared raster',async()=>{for(const [w,h] of [[8193,1],[1,8193],[65535,65535]])await assert.rejects(decodePNG(headerPNG(w,h)),/8192/);});
test('Paint Fit can show an 8192px frame and Zoom Out continues to shrink it',()=>{
 const editor=Object.create(PaintEditor.prototype);Object.assign(editor,{project:{sheet:{frames:[{}],grid:{cellWidth:8192,cellHeight:8192}}},sourceId:0,stage:{clientWidth:600,clientHeight:240},pan:{x:0,y:0},zoom:1,draw(){}});
 editor.fit();const fit=editor.zoom;assert.ok(fit<.125&&fit*8192<=208);editor.scale(.8);assert.ok(editor.zoom<fit&&editor.zoom*8192<=208);
});
test('A real 8192x8192 PNG roundtrip preserves all 268435456 RGBA bytes',{timeout:180000},async()=>{
 const width=8192,height=8192,data=new Uint8ClampedArray(width*height*4);
 for(const [x,y,color] of [[0,0,[12,34,56,0]],[8191,0,[1,2,3,1]],[8191,8191,[220,90,15,127]],[0,8191,[80,90,100,255]],[4096,4096,[7,8,9,255]]])data.set(color,(y*width+x)*4);
 const digest=b=>createHash('sha256').update(b).digest('hex'),expected=digest(data);
 const encoded=await encodePNG({width,height,data}),decoded=await decodePNG(encoded);
 assert.equal(decoded.width,width);assert.equal(decoded.height,height);assert.equal(digest(decoded.data),expected);
 const detected=detectUniformGrid(decoded,{cellWidth:105,cellHeight:115});assert.ok(detected.candidates.every(c=>c.columns*c.rows<=4096));assert.equal(digest(decoded.data),expected);
});
test('Merge can produce a full 8192x8192 sheet with exact corner frames',{timeout:180000},()=>{
 const frames=Array.from({length:4},(_,id)=>{const data=new Uint8ClampedArray(4096*4096*4);data.set([10+id,30,40,255]);return {id,row:Math.floor(id/2),column:id%2,data};});
 const original=[0,1].map(row=>({id:'row'+row,name:'Row '+row,row,fps:10,loop:true,keys:[0,1].map(col=>({sourceId:row*2+col,ticks:col+1}))}));
 const sheet={frames,original,grid:{rows:2,columns:2,cellWidth:4096,cellHeight:4096}},merged=mergeSheet(sheet,original,'row','large');
 assert.deepEqual([merged.width,merged.height,merged.frames.length],[8192,8192,4]);
 for(let i=0;i<4;i++){const f=merged.frames[i];assert.deepEqual(Array.from(merged.data.subarray((f.y*8192+f.x)*4,(f.y*8192+f.x)*4+4)),[10+i,30,40,255]);}assert.equal(merged.manifest.animations[0].totalTicks,3);
});
