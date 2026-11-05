import {MAX_GRID_CELLS,assertImageSize} from './image-limits.mjs';

function axisCandidates(projection){
 const length=projection.length,total=projection.reduce((a,b)=>a+b,0),active=projection.reduce((a,b)=>a+(b>0),0),mean=total/Math.max(1,active),prefix=new Float64Array(length+1);
 for(let i=0;i<length;i++)prefix[i+1]=prefix[i]+projection[i];
 const candidates=[];
 for(let cells=1;cells<=Math.min(length,MAX_GRID_CELLS);cells++){
  if(length%cells)continue;const size=length/cells;let used=0,cut=0;
  for(let i=0;i<cells;i++){if(prefix[(i+1)*size]>prefix[i*size])used++;if(i)cut+=(projection[i*size-1]+projection[i*size])/2;}
  const coverage=used/cells,cutRatio=cells>1?cut/((cells-1)*Math.max(1,mean)):.5,quality=Math.max(0,1-Math.max(0,cutRatio-.05)),score=(quality*.8+coverage*.2)*100+Math.min(12,Math.log2(cells))*.7;
  candidates.push({cells,size,coverage,cutRatio,score});
 }
 candidates.sort((a,b)=>b.score-a.score||b.cells-a.cells);
 return candidates;
}
function sameGrid(a,b){return a.cellWidth===b.cellWidth&&a.cellHeight===b.cellHeight&&['offsetX','offsetY','gapX','gapY'].every(k=>(a[k]??0)===(b[k]??0));}
export function detectUniformGrid(image,current={}){
 assertImageSize(image.width,image.height);
 const {width,height,data}=image;if(data?.length!==width*height*4)throw Error('Invalid image pixels for Grid detection.');
 const x=new Uint32Array(width),y=new Uint32Array(height);
 const corners=[0,(width-1)*4,(height-1)*width*4,(width*height-1)*4],bg=Array.from(data.subarray(0,4));
 const uniformCorners=bg[3]===255&&corners.every(i=>data[i+3]===255&&data[i]===bg[0]&&data[i+1]===bg[1]&&data[i+2]===bg[2]);
 let foreground=0;
 for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const i=(row*width+col)*4;if(!data[i+3]||(uniformCorners&&data[i]===bg[0]&&data[i+1]===bg[1]&&data[i+2]===bg[2]))continue;
  x[col]++;y[row]++;foreground++;
 }
 const xs=axisCandidates(x),ys=axisCandidates(y),candidates=[];
 for(const a of xs.slice(0,8))for(const b of ys.slice(0,8)){
  if(a.cells*b.cells>MAX_GRID_CELLS)continue;
  const grid={cellWidth:a.size,cellHeight:b.size,offsetX:0,offsetY:0,gapX:0,gapY:0};
  candidates.push({grid,columns:a.cells,rows:b.cells,score:(a.score+b.score)/2,cutRatio:Math.max(a.cells>1?a.cutRatio:0,b.cells>1?b.cutRatio:0),coverage:Math.min(a.coverage,b.coverage)});
 }
 candidates.sort((a,b)=>b.score-a.score||b.columns*b.rows-a.columns*a.rows);
 const best=candidates[0],alternatives=best?candidates.filter(c=>c!==best&&best.score-c.score<3&&!(c.grid.cellWidth%best.grid.cellWidth===0&&c.grid.cellHeight%best.grid.cellHeight===0)):[];
 const dense=xs[0].cells*ys[0].cells>MAX_GRID_CELLS;
 const confidence=foreground&&best&&best.columns*best.rows>1&&best.cutRatio<.08&&best.coverage>=.9&&!alternatives.length&&!dense?'high':'review';
 const a=xs.find(c=>c.size===current.cellWidth),b=ys.find(c=>c.size===current.cellHeight);
 const currentFits=!!a&&!!b&&['offsetX','offsetY','gapX','gapY'].every(k=>!(current[k]??0));
 const currentSafe=currentFits&&Math.max(a.cells>1?a.cutRatio:0,b.cells>1?b.cutRatio:0)<.08&&Math.min(a.coverage,b.coverage)>=.9&&a.cells*b.cells>1;
 return {candidates:candidates.slice(0,12),best,confidence,currentSafe,changed:!!best&&!sameGrid(best.grid,current),foreground,background:uniformCorners?'uniform corner color':'transparency',dense,message:!foreground?'ไม่พบพิกเซลเพียงพอสำหรับคำนวณ Grid':dense?'ช่องที่คำนวณได้เกิน 4,096 ช่อง เลือก Grid ใหญ่ขึ้นหรือแบ่งภาพ':confidence==='high'?'พบแนวแบ่งช่องเท่ากันชัดเจน':'ภาพนี้อาจแบ่งได้หลาย Grid โปรดตรวจเส้นแบ่งก่อน Apply'};
}

export class GridDetectView{
 constructor({onApply,onKeep}){
  this.onApply=onApply;this.onKeep=onKeep;
  const dialog=document.createElement('dialog');dialog.id='gridDetectDialog';dialog.setAttribute('aria-labelledby','gridDetectTitle');
  dialog.innerHTML=`<div class="dialog-heading"><h2 id="gridDetectTitle">DETECT EQUAL GRID</h2><button id="gridDetectClose" class="icon-button" aria-label="Close Grid detection">×</button></div><p id="gridDetectMessage"></p><label class="field-label" for="gridDetectCandidates">SUGGESTED GRIDS</label><select id="gridDetectCandidates"></select><div class="grid-detect-inputs"><label>Columns <input id="gridDetectColumns" type="number" min="1" max="4096" required></label><label>Rows <input id="gridDetectRows" type="number" min="1" max="4096" required></label><strong id="gridDetectCellSize"></strong></div><div class="grid-detect-preview checker"><canvas id="gridDetectCanvas" aria-label="Equal cell grid preview"></canvas></div><p id="gridDetectError" role="status"></p><p class="muted">เส้นแบ่งเท่ากันอาจตีความได้หลายแบบ · ภาพมีขอบหรือช่องว่างให้ตั้งเพิ่มใน GRID</p><div class="dialog-actions"><button id="gridDetectKeep">KEEP CURRENT &amp; DETECT</button><button id="gridDetectApply" class="action primary">APPLY GRID &amp; DETECT</button></div>`;
  document.body.append(dialog);this.dialog=dialog;this.$=id=>dialog.querySelector('#'+id);
  this.$('gridDetectClose').onclick=()=>dialog.close();this.$('gridDetectKeep').onclick=()=>{dialog.close();this.onKeep();};
  this.$('gridDetectCandidates').onchange=()=>{const c=this.result.candidates[Number(this.$('gridDetectCandidates').value)];if(c){this.$('gridDetectColumns').value=c.columns;this.$('gridDetectRows').value=c.rows;this.preview();}};
  for(const id of ['gridDetectColumns','gridDetectRows'])this.$(id).oninput=()=>this.preview();
  this.$('gridDetectApply').onclick=()=>{const grid=this.preview();if(!grid||this.locked)return;if(this.onApply(grid)!==false)dialog.close();};
 }
 open(image,result,locked=false){
  this.image=image;this.result=result;this.locked=locked;const select=this.$('gridDetectCandidates');select.replaceChildren();
  result.candidates.forEach((c,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${c.columns} × ${c.rows} cells · ${c.grid.cellWidth} × ${c.grid.cellHeight} px`;select.append(option);});
  this.$('gridDetectMessage').textContent=result.message+(locked?' · มีงานที่แก้ไว้ จึงคง Grid เดิมเพื่อรักษางาน เปิด PNG ใหม่เพื่อเปลี่ยน Grid':'');
  const best=result.best;this.$('gridDetectColumns').value=best?.columns??1;this.$('gridDetectRows').value=best?.rows??1;
  const canvas=this.$('gridDetectCanvas');canvas.width=image.width;canvas.height=image.height;this.preview();this.dialog.showModal();
 }
 clear(){this.dialog.close();this.image=null;this.result=null;this.locked=true;this.$('gridDetectCanvas').width=1;this.$('gridDetectCanvas').height=1;}
 preview(){
  if(!this.image)return null;const columns=Number(this.$('gridDetectColumns').value),rows=Number(this.$('gridDetectRows').value),{width,height,data}=this.image;
  const valid=Number.isInteger(columns)&&Number.isInteger(rows)&&columns>0&&rows>0&&columns*rows<=MAX_GRID_CELLS&&width%columns===0&&height%rows===0;
  this.$('gridDetectApply').disabled=!valid||this.locked;this.$('gridDetectError').textContent=valid?'':'จำนวนช่องต้องหารขนาดภาพลงตัว และรวมไม่เกิน 4,096 ช่อง';
  this.$('gridDetectCellSize').textContent=valid?`${width/columns} × ${height/rows} px per cell`:'—';
  const canvas=this.$('gridDetectCanvas'),ctx=canvas.getContext('2d');ctx.putImageData(new ImageData(data,width,height),0,0);
  if(!valid)return null;const w=width/columns,h=height/rows;ctx.strokeStyle='#a5f1d0';ctx.lineWidth=Math.max(1,width/700);ctx.beginPath();for(let c=1;c<columns;c++){ctx.moveTo(c*w,0);ctx.lineTo(c*w,height);}for(let r=1;r<rows;r++){ctx.moveTo(0,r*h);ctx.lineTo(width,r*h);}ctx.stroke();return {cellWidth:w,cellHeight:h,offsetX:0,offsetY:0,gapX:0,gapY:0};
 }
}
