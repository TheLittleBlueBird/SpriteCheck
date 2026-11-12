import {assertImageSize,MAX_IMAGE_SIDE} from './image-limits.mjs';

export function packingBounds(result){
 const w=result.manifest.cellWidth,h=result.manifest.cellHeight,max=Math.floor(MAX_IMAGE_SIDE/w),rows=Math.floor(MAX_IMAGE_SIDE/h);
 return {min:Math.max(1,Math.ceil(result.frames.length/rows)),max};
}
export function defaultPackColumns(result,preferred=6){const {min,max}=packingBounds(result);return Math.max(min,Math.min(max,preferred));}
export function autoPackColumns(result){
 const {min,max}=packingBounds(result),n=result.frames.length,w=result.manifest.cellWidth,h=result.manifest.cellHeight;
 let best=min,score=[Infinity,Infinity];
 for(let cols=min;cols<=max;cols++){const rows=Math.max(1,Math.ceil(n/cols)),candidate=[cols*rows,Math.abs(Math.log(cols*w/(rows*h)))];if(candidate[0]<score[0]||candidate[0]===score[0]&&candidate[1]<score[1]){score=candidate;best=cols;}}
 return best;
}
export function packMerged(result,columns){
 if(!result?.frames.length)throw Error('No merged images to pack.');
 const bounds=packingBounds(result);
 if(!Number.isInteger(columns)||columns<bounds.min||columns>bounds.max)throw Error(`Columns must be ${bounds.min}–${bounds.max} to stay within 8192 pixels.`);
 const {cellWidth:w,cellHeight:h}=result.manifest,rows=Math.ceil(result.frames.length/columns),width=columns*w,height=rows*h;assertImageSize(width,height);
 const data=new Uint8ClampedArray(width*height*4),frames=result.frames.map((frame,index)=>({...frame,column:index%columns,sheetColumn:index%columns,sheetRow:Math.floor(index/columns),x:(index%columns)*w,y:Math.floor(index/columns)*h}));
 for(let i=0;i<frames.length;i++){const source=result.frames[i],target=frames[i];for(let y=0;y<h;y++){const start=((source.y+y)*result.width+source.x)*4;data.set(result.data.subarray(start,start+w*4),((target.y+y)*width+target.x)*4);}}
 const manifest=structuredClone(result.manifest);manifest.width=width;manifest.height=height;manifest.columns=columns;manifest.rows=rows;manifest.animationRows=manifest.animations.length;manifest.layout='packed';manifest.packing={columns,rows,storedImages:frames.length,emptyCells:columns*rows-frames.length};
 manifest.frames=manifest.frames.map((frame,i)=>({...frame,x:frames[i].x,y:frames[i].y,sheetColumn:frames[i].sheetColumn,sheetRow:frames[i].sheetRow}));
 return {...result,width,height,data,frames,manifest,sourceToFrame:new Map(result.sourceToFrame),packColumns:columns};
}
