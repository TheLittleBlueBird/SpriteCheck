export const MAX_ROW_KEYS=16384,MAX_TOTAL_KEYS=65536;
export function validIndices(indices,count){return [...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&i<count).sort((a,b)=>a-b);}
export class KeySelection{
 constructor(){this.row=-1;this.indices=[];this.anchor=-1;this.primary=-1;}
 set(row,indices,primary=indices.at(-1)??-1,anchor=indices[0]??-1){this.row=row;this.indices=[...new Set(indices)].sort((a,b)=>a-b);this.primary=this.indices.includes(primary)?primary:this.indices.at(-1)??-1;this.anchor=anchor;return this;}
 single(row,index){return this.set(row,index>=0?[index]:[],index,index);}
 ensure(row,count,primary){if(this.row!==row||!this.indices.includes(primary))return this.single(row,primary);const indices=validIndices(this.indices,count);return this.set(row,indices,primary,this.anchor);}
 click(row,index,count,{shiftKey=false,ctrlKey=false,metaKey=false}={}){
  if(index<0||index>=count)return this;
  if(this.row!==row)this.single(row,index);
  if(shiftKey&&this.anchor>=0){const low=Math.min(this.anchor,index),high=Math.max(this.anchor,index);return this.set(row,Array.from({length:high-low+1},(_,i)=>low+i),index,this.anchor);}
  if(ctrlKey||metaKey){const indices=new Set(this.indices);indices.has(index)?indices.delete(index):indices.add(index);return this.set(row,[...indices],indices.has(index)?index:[...indices].at(-1)??-1,index);}
  return this.single(row,index);
 }
}
export function duplicateKeys(keys,indices,slot){
 const selected=validIndices(indices,keys.length);
 if(!selected.length)throw Error('Select at least one keyframe.');
 if(!Number.isInteger(slot)||slot<0||slot>keys.length)throw Error('Choose a valid insertion position.');
 if(keys.length+selected.length>MAX_ROW_KEYS)throw Error('A row supports at most 16,384 keys.');
 const copies=selected.map(i=>({...keys[i]}));keys.splice(slot,0,...copies);return copies.map((_,i)=>slot+i);
}
export function moveKeys(keys,indices,slot){
 const selected=validIndices(indices,keys.length);if(!selected.length||!Number.isInteger(slot)||slot<0||slot>keys.length)return {changed:false,indices:selected};
 const set=new Set(selected),moving=selected.map(i=>keys[i]),remaining=keys.filter((_,i)=>!set.has(i)),target=slot-selected.filter(i=>i<slot).length;
 remaining.splice(target,0,...moving);const changed=remaining.some((key,i)=>key!==keys[i]);if(changed)keys.splice(0,keys.length,...remaining);
 return {changed,indices:moving.map((_,i)=>target+i)};
}
