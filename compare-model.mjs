import {ticks} from './core.mjs';
const clamp=(v,min,max,fallback)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
export function compareSettings(value={}){
 const panel=p=>({mode:p?.mode==='sheet'?'sheet':'animation',zoom:clamp(p?.zoom,.125,64,1),x:clamp(p?.x,-100000,100000,0),y:clamp(p?.y,-100000,100000,0)});
 return {left:panel(value?.left),right:panel(value?.right),linked:value?.linked!==false,split:clamp(value?.split,25,75,50),log:value?.log!==false};
}
export function comparisonMetrics(project,sourceBytes,packedBytes=null,jsonBytes=null){
 const s=project.sheet,m=project.merged;
 const original={width:s.image.width,height:s.image.height,pngBytes:sourceBytes,storedImages:s.frames.length,rows:s.grid.rows,playbackTicks:s.original.reduce((n,a)=>n+ticks(a),0),rgbaBytes:s.image.width*s.image.height*4};
 const merged=m?{width:m.width,height:m.height,pngBytes:packedBytes,jsonBytes,totalBytes:packedBytes==null||jsonBytes==null?null:packedBytes+jsonBytes,storedImages:m.frames.length,rows:m.manifest.rows,playbackTicks:m.manifest.animations.reduce((n,a)=>n+a.totalTicks,0),rgbaBytes:m.width*m.height*4}:null;
 return {original,merged,editedTicks:project.draft.reduce((n,a)=>n+ticks(a),0),areaReduction:merged?100*(1-merged.width*merged.height/(original.width*original.height)):null,
  fileReduction:merged?.totalBytes!=null&&sourceBytes>0?100*(1-merged.totalBytes/sourceBytes):null};
}
export function byteSize(n){return n==null?'—':n<1024?`${n} B`:`${(n/1024).toFixed(2)} KiB`;}
