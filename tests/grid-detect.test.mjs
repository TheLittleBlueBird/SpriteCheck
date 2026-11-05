import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodePNG} from '../png.mjs';
import {detectUniformGrid} from '../grid-detect.mjs';
function fixture({columns=5,rows=3,cellWidth=128,cellHeight=128,opaque=false}={}){const width=columns*cellWidth,height=rows*cellHeight,data=new Uint8ClampedArray(width*height*4);if(opaque)for(let i=3;i<data.length;i+=4)data[i]=255;
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)for(let y=Math.floor(cellHeight*.2);y<cellHeight*.8;y++)for(let x=Math.floor(cellWidth*.2);x<cellWidth*.8;x++)data.set([140+c,40+r,70,255],((r*cellHeight+y)*width+c*cellWidth+x)*4);return {width,height,data};}
test('Detect calculates equal cell size and counts from transparent sprite gutters',()=>{
 const image=fixture(),before=image.data.slice(),r=detectUniformGrid(image,{cellWidth:105,cellHeight:115});assert.equal(r.confidence,'high');assert.deepEqual([r.best.grid.cellWidth,r.best.grid.cellHeight,r.best.columns,r.best.rows],[128,128,5,3]);assert.equal(r.currentSafe,false);assert.deepEqual(image.data,before);
});
test('Detect supports unequal cell width/height and single-row or single-column strips',()=>{
 for(const params of [{columns:8,rows:4,cellWidth:96,cellHeight:80},{columns:6,rows:1,cellWidth:64,cellHeight:80},{columns:1,rows:5,cellWidth:96,cellHeight:64}]){const r=detectUniformGrid(fixture(params));assert.equal(r.best.grid.cellWidth,params.cellWidth);assert.equal(r.best.grid.cellHeight,params.cellHeight);assert.equal(r.best.columns,params.columns);assert.equal(r.best.rows,params.rows);}
});
test('Solid uniform corner backgrounds can be ignored without altering RGB pixels',()=>{
 const r=detectUniformGrid(fixture({opaque:true}));assert.equal(r.background,'uniform corner color');assert.equal(r.confidence,'high');assert.deepEqual([r.best.columns,r.best.rows],[5,3]);
});
test('Blank and continuously occupied images require review rather than false automatic slicing',()=>{
 const blank={width:64,height:64,data:new Uint8ClampedArray(64*64*4)};assert.equal(detectUniformGrid(blank).confidence,'review');
 const image=fixture({columns:1,rows:1,cellWidth:64,cellHeight:64});for(let i=0;i<image.data.length;i+=4)image.data.set([i%251,77,90,255],i);assert.equal(detectUniformGrid(image).confidence,'review');
});
test('Known synthetic sheet yields 13x12 grid and accepts the current grid as safe',async()=>{
 const image=await decodePNG(await readFile(new URL('../assets/test-sheet.png',import.meta.url))),r=detectUniformGrid(image,{cellWidth:105,cellHeight:115});assert.equal(r.currentSafe,true);assert.equal(r.confidence,'high');assert.deepEqual([r.best.columns,r.best.rows,r.best.grid.cellWidth,r.best.grid.cellHeight],[13,12,105,115]);
});
test('Detection never offers a grid beyond 4096 cells and reports denser evidence',()=>{
 const r=detectUniformGrid(fixture({columns:65,rows:65,cellWidth:8,cellHeight:8}));assert.equal(r.dense,true);assert.equal(r.confidence,'review');assert.ok(r.candidates.every(c=>c.columns*c.rows<=4096));
});
