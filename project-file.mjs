import {Project,sliceSheet,clone,validateAnimations} from './core.mjs';
import {decodePNG} from './png.mjs';
import {compareSettings} from './compare-model.mjs';

// Versioned local project container. PNG bytes are stored verbatim, never resampled.
const MAGIC=new TextEncoder().encode('SPRITECHECK-DAT\0');
const HEADER=64,MAX_PNG=64*1024*1024,MAX_META=4*1024*1024;
const encoder=new TextEncoder();
function bytes(value){return value instanceof Uint8Array?value:new Uint8Array(value);}
function fail(){throw new Error('Invalid or damaged Sprite Check .dat project.');}
function animations(sheet,value){
 if(!Array.isArray(value)||value.length!==sheet.original.length)fail();
 let total=0;
 const result=value.map((a,r)=>{
  if(!a||a.id!==sheet.original[r].id||a.name!==sheet.original[r].name||a.row!==r||typeof a.loop!=='boolean'||!Array.isArray(a.keys)||a.keys.length>16384)fail();
  total+=a.keys.length;if(total>65536)fail();
  return {id:a.id,name:a.name,row:r,fps:a.fps,loop:a.loop,keys:a.keys.map(k=>{if(!k||typeof k!=='object')fail();return {sourceId:k.sourceId,ticks:k.ticks};})};
 });
 validateAnimations(sheet,result);return result;
}
function viewState(view={}){
 return {row:Number.isInteger(view.row)&&view.row>=0?view.row:0,selectedKey:Number.isInteger(view.selectedKey)?view.selectedKey:0,selectedSource:Number.isInteger(view.selectedSource)&&view.selectedSource>=0?view.selectedSource:null,
  mode:['original','edited','merged'].includes(view.mode)?view.mode:'edited',sheetMode:view.sheetMode==='merged'?'merged':'original',tab:view.tab==='compare'?'compare':'sheet',
  seconds:Number.isFinite(view.seconds)&&view.seconds>=0?Math.min(view.seconds,1e9):0,showGrid:view.showGrid!==false,
  exportName:typeof view.exportName==='string'?view.exportName.slice(0,80):'sprite',scope:view.scope==='sheet'?'sheet':'row',compare:compareSettings(view.compare)};
}
export async function encodeProject({project,pngBytes,sourceName,view={}}){
 const png=bytes(pngBytes);if(!png.length||png.length>MAX_PNG)throw new Error('Source PNG must be at most 64 MiB.');
 const draft=animations(project.sheet,project.draft),confirmed=project.confirmed?animations(project.sheet,project.confirmed):null;
 const metadata={format:'sprite-check-project',version:1,appVersion:'1.6.2',sourceName:String(sourceName||'sprite.png').slice(0,255),
  grid:Object.fromEntries(['cellWidth','cellHeight','offsetX','offsetY','gapX','gapY'].map(k=>[k,project.sheet.grid[k]])),
  draft,confirmed,dirty:!!project.dirty,detected:!!project.detection,merged:!!project.merged,view:viewState(view)};
 const meta=encoder.encode(JSON.stringify(metadata));if(meta.length>MAX_META)throw new Error('Project timeline exceeds the .dat size limit.');
 const out=new Uint8Array(HEADER+meta.length+png.length),header=new DataView(out.buffer);out.set(MAGIC);header.setUint32(16,1,true);header.setUint32(20,meta.length,true);header.setUint32(24,png.length,true);
 out.set(meta,HEADER);out.set(png,HEADER+meta.length);out.set(new Uint8Array(await crypto.subtle.digest('SHA-256',out.subarray(HEADER))),32);return out;
}
export async function decodeProject(input){
 const data=bytes(input);if(data.length<HEADER||data.length>HEADER+MAX_PNG+MAX_META||!MAGIC.every((v,i)=>data[i]===v))fail();
 const header=new DataView(data.buffer,data.byteOffset,data.byteLength);if(header.getUint32(16,true)!==1)throw new Error('Unsupported .dat version. Open this project in a newer Sprite Check.');
 const metaLength=header.getUint32(20,true),pngLength=header.getUint32(24,true);
 if(!metaLength||metaLength>MAX_META||!pngLength||pngLength>MAX_PNG||data.length!==HEADER+metaLength+pngLength||header.getUint32(28,true)!==0)fail();
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',data.subarray(HEADER)));if(!digest.every((v,i)=>v===data[32+i]))throw new Error('The .dat checksum does not match. The file may be incomplete or damaged.');
 let meta;try{meta=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(HEADER,HEADER+metaLength)));}catch{fail();}
 if(meta?.format!=='sprite-check-project'||meta.version!==1||typeof meta.sourceName!=='string'||!meta.grid||typeof meta.dirty!=='boolean'||typeof meta.detected!=='boolean'||typeof meta.merged!=='boolean')fail();
 const pngBytes=data.slice(HEADER+metaLength),image=await decodePNG(pngBytes),sheet=sliceSheet(image,meta.grid);if(!sheet.frames.length)fail();
 const project=new Project(sheet);project.draft=animations(sheet,meta.draft);project.confirmed=meta.confirmed===null?null:animations(sheet,meta.confirmed);project.dirty=meta.dirty;
 if(project.confirmed&&!project.dirty&&JSON.stringify(project.draft)!==JSON.stringify(project.confirmed))fail();
 const view=viewState(meta.view);view.row=Math.min(view.row,sheet.original.length-1);view.selectedKey=Math.max(-1,Math.min(view.selectedKey,project.draft[view.row].keys.length-1));
 const selected=sheet.frames[view.selectedSource];view.selectedSource=project.draft[view.row].keys[view.selectedKey]?.sourceId??(selected?.row===view.row?selected.id:sheet.original[view.row].keys[0]?.sourceId??null);
 if(meta.detected)project.detect();
 if(meta.merged){if(!project.confirmed||project.dirty)fail();project.merge(view.scope,view.exportName);}
 if(!project.merged){if(view.mode==='merged')view.mode='edited';view.sheetMode='original';}
 return {project,image,pngBytes,sourceName:meta.sourceName.slice(0,255),grid:clone(meta.grid),view};
}
