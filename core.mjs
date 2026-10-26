export const ROW_NAMES=['Idle FL','Idle BL','Walk FL','Walk BL','Hit FL','Hit BL','Die FL','Die BL','ATK01 FL','ATK01 BL','ATK02 FL','ATK02 BL'];
export const clone=value=>structuredClone(value);
export const HISTORY_LIMIT=50;
function remember(stack,state){stack.push(clone(state));if(stack.length>HISTORY_LIMIT)stack.shift();}
const equal=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
function hash(data){let h=2166136261;for(const b of data)h=Math.imul(h^b,16777619);return h>>>0;}
export function sliceSheet(image,grid){
 const {cellWidth:w,cellHeight:h,offsetX=0,offsetY=0,gapX=0,gapY=0}=grid;
 for(const [name,v] of Object.entries({cellWidth:w,cellHeight:h,offsetX,offsetY,gapX,gapY}))if(!Number.isInteger(v)||v<(name.startsWith('cell')?1:0))throw new Error('Grid values must be valid whole pixels.');
 const columns=Math.floor((image.width-offsetX+gapX)/(w+gapX)),rows=Math.floor((image.height-offsetY+gapY)/(h+gapY));
 if(!columns||!rows)throw new Error('The cell is larger than the sprite sheet.');if(columns*rows>4096)throw new Error('Please use a grid with at most 4,096 cells.');
 const frames=[],animations=[],cells=[];
 for(let row=0;row<rows;row++){const animation={id:(ROW_NAMES[row]||`Row ${row+1}`).toLowerCase().replaceAll(' ','_'),name:ROW_NAMES[row]||`Row ${row+1}`,row,fps:row<4?10:12,loop:true,keys:[]};for(let column=0;column<columns;column++){const x=offsetX+column*(w+gapX),y=offsetY+row*(h+gapY),data=new Uint8ClampedArray(w*h*4);let occupied=false;
 for(let py=0;py<h;py++){const begin=((y+py)*image.width+x)*4;data.set(image.data.subarray(begin,begin+w*4),py*w*4);}for(let i=3;i<data.length;i+=4)if(data[i]){occupied=true;break;}
 const cell={row,column,x,y,occupied,frameId:null};cells.push(cell);if(!occupied)continue;const frame={id:frames.length,row,column,x,y,data};frames.push(frame);cell.frameId=frame.id;animation.keys.push({sourceId:frame.id,ticks:1});}animations.push(animation);}
 return {image,grid:{cellWidth:w,cellHeight:h,offsetX,offsetY,gapX,gapY,columns,rows},frames,cells,original:animations};
}
export function detectDuplicates(sheet){const buckets=new Map(),groups=[],frameGroup=new Map();for(const frame of sheet.frames){const k=hash(frame.data);const bucket=buckets.get(k)||[];let group=bucket.find(g=>equal(sheet.frames[g.members[0]].data,frame.data));if(!group){group={id:groups.length,members:[]};groups.push(group);bucket.push(group);buckets.set(k,bucket);}group.members.push(frame.id);frameGroup.set(frame.id,group.id);}const duplicates=groups.filter(g=>g.members.length>1);return {groups,duplicates,frameGroup,unique:groups.length,redundant:sheet.frames.length-groups.length};}
export function ticks(animation){return animation.keys.reduce((sum,key)=>sum+key.ticks,0);}
export function keyAt(animation,tick){let end=0;for(let i=0;i<animation.keys.length;i++){end+=animation.keys[i].ticks;if(tick<end)return {key:animation.keys[i],index:i,start:end-animation.keys[i].ticks};}return animation.keys.length?{key:animation.keys.at(-1),index:animation.keys.length-1,start:Math.max(0,ticks(animation)-animation.keys.at(-1).ticks)}:null;}
export function frameAtSeconds(animation,seconds,forceLoop=animation.loop){const total=ticks(animation);if(!total)return null;let tick=Math.max(0,Math.floor(seconds*animation.fps+1e-7));tick=forceLoop?tick%total:Math.min(total-1,tick);return keyAt(animation,tick);}
export function validateAnimations(sheet,animations){if(animations.length!==sheet.original.length)throw new Error('Animation row count changed.');for(const [r,a] of animations.entries()){if(!Number.isFinite(a.fps)||a.fps<1||a.fps>120)throw new Error('FPS must be 1–120.');if(a.row!==r)throw new Error('Animation rows must retain their order.');for(const k of a.keys){if(!Number.isInteger(k.sourceId)||!sheet.frames[k.sourceId]||sheet.frames[k.sourceId].row!==r)throw new Error('Keys must reference a source frame in their own row.');if(!Number.isInteger(k.ticks)||k.ticks<1||k.ticks>999)throw new Error('Frame duration must be 1–999 ticks.');}}}
export function mergeSheet(sheet,animations,scope='row',base='sprite'){
 validateAnimations(sheet,animations);if(!['row','sheet'].includes(scope))throw new Error('Invalid merge scope.');const detector=detectDuplicates(sheet),frames=[],sourceToFrame=new Map(),uniqueByKey=new Map(),counts=Array(sheet.grid.rows).fill(0);
 for(const animation of animations)for(const key of animation.keys){if(sourceToFrame.has(key.sourceId))continue;const source=sheet.frames[key.sourceId],identity=(scope==='row'?`${source.row}:`:'')+detector.frameGroup.get(source.id);let target=uniqueByKey.get(identity);if(!target){target={id:frames.length,row:source.row,column:counts[source.row]++,sourceId:source.id};frames.push(target);uniqueByKey.set(identity,target);}sourceToFrame.set(source.id,target.id);}
 const columns=Math.max(1,...counts),width=columns*sheet.grid.cellWidth,height=sheet.grid.rows*sheet.grid.cellHeight;if(width*height>16777216)throw new Error('Merged sheet exceeds 16 megapixels.');const data=new Uint8ClampedArray(width*height*4);
 const manifest={format:'sprite-check',version:1,image:`${base}-merged.png`,coordinateOrigin:'top-left',cellWidth:sheet.grid.cellWidth,cellHeight:sheet.grid.cellHeight,width,height,columns,rows:sheet.grid.rows,pixelsPerUnit:64,pivot:{x:0.5,y:0.08},mergeScope:scope,frames:[],animations:[]};
 for(const frame of frames){const source=sheet.frames[frame.sourceId],x=frame.column*sheet.grid.cellWidth,y=frame.row*sheet.grid.cellHeight;frame.x=x;frame.y=y;for(let py=0;py<sheet.grid.cellHeight;py++)data.set(source.data.subarray(py*sheet.grid.cellWidth*4,(py+1)*sheet.grid.cellWidth*4),((y+py)*width+x)*4);manifest.frames.push({id:frame.id,x,y,width:sheet.grid.cellWidth,height:sheet.grid.cellHeight,row:frame.row,sourceColumn:source.column});}
 for(const animation of animations){const timeline=[];for(const key of animation.keys){const frame=sourceToFrame.get(key.sourceId),last=timeline.at(-1);if(last&&last.frame===frame)last.ticks+=key.ticks;else timeline.push({frame,ticks:key.ticks});}manifest.animations.push({id:animation.id,name:animation.name,row:animation.row,fps:animation.fps,loop:animation.loop,totalTicks:ticks(animation),timeline});}
 return {width,height,data,frames,manifest,sourceToFrame,counts,scope};
}
export class Project{
 constructor(sheet){this.sheet=sheet;this.draft=clone(sheet.original);this.confirmed=null;this.merged=null;this.detection=null;this.dirty=false;this.undoStack=[];this.redoStack=[];}
 change(mutator){const next=clone(this.draft);mutator(next);validateAnimations(this.sheet,next);if(JSON.stringify(next)===JSON.stringify(this.draft))return false;remember(this.undoStack,this.draft);this.redoStack=[];this.draft=next;this.dirty=true;this.merged=null;return true;}
 undo(){if(!this.undoStack.length)return false;remember(this.redoStack,this.draft);this.draft=this.undoStack.pop();this.dirty=true;this.merged=null;return true;}
 redo(){if(!this.redoStack.length)return false;remember(this.undoStack,this.draft);this.draft=this.redoStack.pop();this.dirty=true;this.merged=null;return true;}
 detect(){return this.detection=detectDuplicates(this.sheet);}
 confirm(){validateAnimations(this.sheet,this.draft);this.confirmed=clone(this.draft);this.dirty=false;this.merged=null;}
 merge(scope,base){if(!this.confirmed||this.dirty)throw new Error('Confirm your current timeline before merging.');this.merged=mergeSheet(this.sheet,this.confirmed,scope,base);return this.merged;}
}
