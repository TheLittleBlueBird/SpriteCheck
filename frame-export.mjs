import {encodePNG} from './png.mjs';

export const MAX_EXPORT_BYTES=64*1024*1024,MAX_EXPORT_FILES=65535;
export function exportName(value,fallback='Monster'){
 let name=String(value??'').normalize('NFKC').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^[_-]+|[_-]+$/g,'').slice(0,70)||fallback;
 if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name))name='_'+name;
 return name;
}
export function frameFileName(base,animation,index){return `${exportName(base)}_${exportName(animation,'Animation')}_${String(index+1).padStart(3,'0')}.png`;}
export async function frameEntries(sheet,animations,base,{signal,onProgress=()=>{}}={}){
 const count=animations.reduce((n,a)=>n+a.keys.length,0);if(count>MAX_EXPORT_FILES)throw Error('Too many frame files for one export.');
 const cache=new Map(),files=[],mapping=[];let bytes=0;
 for(const animation of animations){const entries=[];for(const [index,key] of animation.keys.entries()){
  signal?.throwIfAborted();const source=sheet.frames[key.sourceId];if(!source)throw Error('A key references a missing source frame.');
  if(!cache.has(source.id))cache.set(source.id,await encodePNG({width:sheet.grid.cellWidth,height:sheet.grid.cellHeight,data:source.data}));
  const data=cache.get(source.id),name=frameFileName(base,animation.name,index);bytes+=data.length;if(bytes>MAX_EXPORT_BYTES)throw Error('Selected frame PNGs exceed 64 MiB. Export fewer rows or files.');
  files.push({name,data});entries.push({file:name,sourceId:key.sourceId,ticks:key.ticks});onProgress(files.length,count);
 }mapping.push({id:animation.id,name:animation.name,row:animation.row,fps:animation.fps,loop:animation.loop,keys:entries});}
 return {files,animations:mapping};
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{let v=i;for(let j=0;j<8;j++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function zipFiles(files){
 if(!files.length)throw Error('Choose at least one export item.');if(files.length>MAX_EXPORT_FILES)throw Error('Too many export files.');
 const encoder=new TextEncoder(),names=new Set(),entries=[];let size=22,offset=0;
 for(const file of files){if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,179}$/.test(file.name)||names.has(file.name.toLowerCase())||!(file.data instanceof Uint8Array))throw Error('Invalid or repeated export filename.');names.add(file.name.toLowerCase());const name=encoder.encode(file.name),crc=crc32(file.data);size+=76+2*name.length+file.data.length;if(size>MAX_EXPORT_BYTES)throw Error('Selected export exceeds 64 MiB. Export items separately.');entries.push({...file,nameBytes:name,crc,offset});offset+=30+name.length+file.data.length;}
 const out=new Uint8Array(size),view=new DataView(out.buffer);let at=0;
 for(const f of entries){const n=f.nameBytes.length;view.setUint32(at,0x04034b50,true);view.setUint16(at+4,20,true);view.setUint16(at+6,0x800,true);view.setUint16(at+12,33,true);view.setUint32(at+14,f.crc,true);view.setUint32(at+18,f.data.length,true);view.setUint32(at+22,f.data.length,true);view.setUint16(at+26,n,true);out.set(f.nameBytes,at+30);out.set(f.data,at+30+n);at+=30+n+f.data.length;}
 const central=at;
 for(const f of entries){const n=f.nameBytes.length;view.setUint32(at,0x02014b50,true);view.setUint16(at+4,20,true);view.setUint16(at+6,20,true);view.setUint16(at+8,0x800,true);view.setUint16(at+14,33,true);view.setUint32(at+16,f.crc,true);view.setUint32(at+20,f.data.length,true);view.setUint32(at+24,f.data.length,true);view.setUint16(at+28,n,true);view.setUint32(at+42,f.offset,true);out.set(f.nameBytes,at+46);at+=46+n;}
 view.setUint32(at,0x06054b50,true);view.setUint16(at+8,files.length,true);view.setUint16(at+10,files.length,true);view.setUint32(at+12,at-central,true);view.setUint32(at+16,central,true);return out;
}
