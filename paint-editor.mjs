import {paintLine,floodFill,samplePixel,sourceColors} from './pixel-tools.mjs';

const toolNames={pencil:'PENCIL',eraser:'ERASER',eyedropper:'PICK COLOR',fill:'FILL',line:'LINE',hand:'PAN'};
const shortcuts={KeyB:'pencil',KeyE:'eraser',KeyG:'fill',KeyL:'line',KeyH:'hand'};
const toolIcons={
 pencil:'<path d="m4 15 11-11 5 5L9 20H4v-5Zm9-9 5 5M4 15l5 5"/>',
 eraser:'<path d="m3 14 10-11 8 8-9 10H9l-6-6v-1Zm5-5 8 8M12 21h9"/>',
 eyedropper:'<path d="m14 4 2-2 6 6-2 2-2-2-9 9-5 1 1-5 9-9Zm-2 2 6 6M4 18l-2 2"/>',
 fill:'<path d="m9 3 10 10-8 8L1 11l8-8Zm-7 8h15M7 1l6 6M20 14s-3 4-3 5a3 3 0 0 0 6 0c0-1-3-5-3-5Z"/>',
 line:'<path d="M5 19 19 5"/><rect x="2" y="16" width="5" height="5"/><rect x="17" y="2" width="5" height="5"/>',
 hand:'<path d="M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9l-3 7H8l-6-8a2 2 0 0 1 3-2l3 3v-3Z"/>'
};
const hex=color=>'#'+color.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// One pointer gesture is previewed in a private frame buffer, then committed once.
export class PaintEditor {
 constructor(root,{onSelect,onCommit,onBegin,onExport,onMessage,onHistory}){
  this.root=root;Object.assign(this,{onSelect,onCommit,onBegin,onExport,onMessage,onHistory});
  this.project=null;this.sourceId=null;this.tool='pencil';this.color=[165,241,208,255];this.size=1;
  this.zoom=1;this.pan={x:0,y:0};this.stroke=null;this.drag=null;this.hover=null;this.space=false;this.paletteSource=null;
  root.innerHTML=`<div class="paint-toolbar" role="toolbar" aria-label="Pixel painting tools">
   <div class="paint-tools">${[['pencil','B'],['eraser','E'],['eyedropper','Alt + left click'],['fill','G'],['line','L'],['hand','H']].map(([id,key])=>`<button id="paintTool-${id}" data-tool="${id}" aria-label="${toolNames[id]}" title="${toolNames[id]} · ${key}" aria-pressed="${id==='pencil'}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${toolIcons[id]}</svg>${id==='eyedropper'?'':`<kbd>${key}</kbd>`}</button>`).join('')}</div>
   <label>SIZE <input id="paintSize" type="number" min="1" max="16" value="1" aria-label="Square brush size in pixels"></label>
   <label class="paint-color-field">COLOR <input id="paintColor" type="color" value="#a5f1d0" aria-label="Paint color"></label>
   <label>A <input id="paintAlpha" type="number" min="0" max="255" value="255" aria-label="Paint color alpha"></label>
   <input id="paintHex" value="#A5F1D0FF" maxlength="9" aria-label="RGBA hexadecimal color" title="สี #RRGGBB หรือ #RRGGBBAA · ดินสอเขียนค่า RGBA ที่เลือกตรง ๆ">
  </div>
  <div class="paint-framebar"><button id="paintPrevious" aria-label="Previous source frame">‹</button><select id="paintFrameSelect" aria-label="Frame to paint"></select><button id="paintNext" aria-label="Next source frame">›</button>
   <div class="paint-zoom-tools"><button id="paintZoomOut" aria-label="Zoom paint out">−</button><span id="paintZoomLabel">100%</span><button id="paintZoomIn" aria-label="Zoom paint in">＋</button><button id="paintFit">FIT</button><button id="paintActual">1:1</button></div>
  </div>
  <div class="paint-main"><div id="paintStage" class="paint-stage checker"><canvas id="paintCanvas" tabindex="0" aria-label="Pixel editor canvas: drag to paint; right click erases; Alt and left click picks color; Space and drag pans"></canvas></div>
   <aside class="paint-sidebar"><strong id="paintFrameTitle">SELECT A FRAME</strong><span id="paintFrameInfo">Open a PNG to start.</span>
    <button id="paintExport" class="action primary" title="ส่งออกภาพทั้ง Sheet ที่แก้แล้ว โดยไม่ต้อง Merge">SAVE EDITED PNG ↓</button>
    <label><input id="paintGrid" type="checkbox" checked> PIXEL GRID</label><label><input id="paintOriginal" type="checkbox"> ORIGINAL · READ ONLY</label>
    <span class="field-label">FRAME PALETTE</span><div id="paintPalette" class="paint-palette" aria-label="Colors in selected frame"></div>
    <button id="paintResetFrame" title="คืนพิกเซลของเฟรมนี้เป็นต้นฉบับ · Undo ได้">RESET FRAME</button><button id="paintUndo">↶ UNDO</button><button id="paintRedo">↷ REDO</button>
    <p>แก้เฉพาะภาพเฟรมที่เลือก ทุกคีย์ที่อ้างภาพนี้จะเปลี่ยนตาม<br>ภาพซ้ำคนละช่องยังแยกกัน</p>
   </aside></div>
  <div class="paint-status"><span id="paintCoordinate">—</span><span id="paintHint">B Pencil · E Eraser · Alt + left click Pick · G Fill · L Line · H Pan</span></div>`;
  const $=id=>root.querySelector('#'+id);this.$=$;this.canvas=$('paintCanvas');this.stage=$('paintStage');
  for(const b of root.querySelectorAll('[data-tool]'))b.onclick=()=>this.setTool(b.dataset.tool);
  $('paintSize').onchange=()=>{const n=$('paintSize').valueAsNumber;if(Number.isInteger(n)&&n>=1&&n<=16)this.size=n;$('paintSize').value=this.size;this.draw();};
  $('paintColor').oninput=()=>this.setColor([...$('paintColor').value.slice(1).match(/../g).map(x=>parseInt(x,16)),this.color[3]]);
  $('paintAlpha').onchange=()=>{const n=$('paintAlpha').valueAsNumber;this.setColor([...this.color.slice(0,3),Number.isInteger(n)?clamp(n,0,255):this.color[3]]);};
  $('paintHex').onchange=()=>{const v=$('paintHex').value.trim();if(/^#[\da-f]{6}([\da-f]{2})?$/i.test(v))this.setColor((v.length===7?v+'FF':v).slice(1).match(/../g).map(x=>parseInt(x,16)));else{this.syncColor();onMessage('ใช้สีแบบ #RRGGBB หรือ #RRGGBBAA',true);}};
  $('paintFrameSelect').onchange=()=>onSelect(Number($('paintFrameSelect').value));
  $('paintPrevious').onclick=()=>this.step(-1);$('paintNext').onclick=()=>this.step(1);
  $('paintZoomOut').onclick=()=>this.scale(.8);$('paintZoomIn').onclick=()=>this.scale(1.25);$('paintFit').onclick=()=>this.fit();$('paintActual').onclick=()=>{this.zoom=1;this.pan={x:0,y:0};this.draw();};
  $('paintGrid').onchange=()=>this.draw();$('paintOriginal').onchange=()=>{this.cancel();this.draw();};
  $('paintResetFrame').onclick=()=>{if(this.frame)this.onCommit(this.sourceId,this.project.originalSheet.frames[this.sourceId].data);};
  $('paintUndo').onclick=()=>onHistory('undo');$('paintRedo').onclick=()=>onHistory('redo');$('paintExport').onclick=onExport;
  this.canvas.oncontextmenu=e=>e.preventDefault();
  this.canvas.onpointerdown=e=>this.down(e);this.canvas.onpointermove=e=>this.move(e);this.canvas.onpointerup=e=>this.up(e);
  this.canvas.onpointercancel=e=>{if(this.owns(e))this.cancel();};this.canvas.onlostpointercapture=e=>{if(this.owns(e))this.cancel();};
  this.canvas.onpointerleave=()=>{if(!this.stroke&&!this.drag){this.hover=null;this.draw();}};
  this.stage.addEventListener('wheel',e=>{if(!this.project)return;e.preventDefault();if(this.stroke)return;const r=this.canvas.getBoundingClientRect();this.scale(e.deltaY<0?1.25:.8,{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
  window.addEventListener('keyup',e=>{if(e.code==='Space')this.space=false;});window.addEventListener('blur',()=>{this.space=false;this.cancel();});
  this.observer=new ResizeObserver(()=>{if(!this.root.hidden)this.draw();});this.observer.observe(this.stage);this.syncColor();
 }
 get frame(){return this.project?.sheet.frames[this.sourceId]??null;}
 get active(){return !this.root.hidden;}
 get painting(){return !!this.stroke;}
 get geometry(){const f=this.frame;if(!f)return null;const {cellWidth:w,cellHeight:h}=this.project.sheet.grid;return {width:w,height:h,scale:this.zoom,x:(this.stage.clientWidth-w*this.zoom)/2+this.pan.x,y:(this.stage.clientHeight-h*this.zoom)/2+this.pan.y};}
 setContext(project,sourceId){
  const fresh=this.project!==project,changed=fresh||this.sourceId!==sourceId;
  if(changed)this.cancel();this.project=project;this.sourceId=sourceId;
  const f=this.frame,select=this.$('paintFrameSelect');
  if(fresh){select.replaceChildren();for(const frame of project?.sheet.frames??[]){const option=document.createElement('option');option.value=frame.id;option.textContent=`${project.sheet.original[frame.row].name} · R${frame.row+1} C${frame.column+1}`;select.append(option);}this.$('paintOriginal').checked=false;}
  if(f){select.value=String(sourceId);this.$('paintFrameTitle').textContent=project.sheet.original[f.row].name;this.$('paintFrameInfo').textContent=`FRAME ${f.id+1} · R${f.row+1} C${f.column+1} · ${project.sheet.grid.cellWidth} × ${project.sheet.grid.cellHeight} px`;}
  else{this.$('paintFrameTitle').textContent='SELECT A FRAME';this.$('paintFrameInfo').textContent='Open a PNG to start.';}
  const index=project?.sheet.frames.findIndex(x=>x.id===sourceId)??-1;
  this.$('paintPrevious').disabled=!f||index===0;this.$('paintNext').disabled=!f||index===project.sheet.frames.length-1;
  for(const id of ['paintSize','paintColor','paintAlpha','paintHex','paintFrameSelect','paintExport','paintGrid','paintOriginal','paintFit','paintActual','paintZoomIn','paintZoomOut'])this.$(id).disabled=!f;
  for(const b of this.root.querySelectorAll('[data-tool]'))b.disabled=!f;
  this.$('paintUndo').disabled=!project?.undoStack.length;this.$('paintRedo').disabled=!project?.redoStack.length;
  this.$('paintResetFrame').disabled=!f||f.data.every((v,i)=>v===project.originalSheet.frames[sourceId].data[i]);
  if(changed&&f){this.hover=null;this.pan={x:0,y:0};if(fresh||!this.zoom)this.fit();}
  this.palette();this.draw();
 }
 setTool(tool){if(!toolNames[tool])return;this.cancel();this.tool=tool;for(const b of this.root.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));this.canvas.style.cursor=tool==='hand'?'grab':'crosshair';this.draw();}
 setColor(color){this.color=color.slice();this.syncColor();}
 syncColor(){this.$('paintColor').value=hex(this.color).slice(0,7);this.$('paintAlpha').value=this.color[3];this.$('paintHex').value=hex(this.color);}
 step(delta){if(!this.frame)return;const frames=this.project.sheet.frames,index=frames.findIndex(f=>f.id===this.sourceId),next=frames[index+delta];if(next)this.onSelect(next.id);}
 palette(){const data=this.frame?.data;if(this.paletteSource===data)return;this.paletteSource=data;const root=this.$('paintPalette');root.replaceChildren();if(!data)return;for(const {color,count} of sourceColors(data,32)){const b=document.createElement('button');b.type='button';b.className='paint-swatch';b.title=`${hex(color)} · ${count} px`;b.setAttribute('aria-label',hex(color));b.style.backgroundColor=`rgba(${color.slice(0,3).join(',')},${color[3]/255})`;b.onclick=()=>this.setColor(color);root.append(b);}}
 fit(){if(!this.frame)return;const {cellWidth:w,cellHeight:h}=this.project.sheet.grid,n=Math.min((this.stage.clientWidth-32)/w,(this.stage.clientHeight-32)/h);if(n<=0)return;this.zoom=clamp(n>=1?Math.floor(n):n,.125,64);this.pan={x:0,y:0};this.draw();}
 scale(factor,point){if(!this.frame||this.stroke)return;const g=this.geometry,old=this.zoom,n=clamp(old*factor,.125,64);point??={x:this.stage.clientWidth/2,y:this.stage.clientHeight/2};const px=(point.x-g.x)/old,py=(point.y-g.y)/old;this.zoom=n;this.pan={x:point.x-(this.stage.clientWidth-g.width*n)/2-px*n,y:point.y-(this.stage.clientHeight-g.height*n)/2-py*n};this.draw();}
 position(e){const r=this.canvas.getBoundingClientRect(),g=this.geometry;if(!g)return null;return {x:clamp(Math.floor((e.clientX-r.left-g.x)/g.scale),-8192,8192),y:clamp(Math.floor((e.clientY-r.top-g.y)/g.scale),-8192,8192)};}
 owns(e){return this.stroke?.pointer===e.pointerId||this.drag?.pointer===e.pointerId;}
 capture(e){this.canvas.setPointerCapture(e.pointerId);}
 release(pointer){if(this.canvas.hasPointerCapture(pointer))this.canvas.releasePointerCapture(pointer);}
 down(e){
  if(!this.frame||![0,1,2].includes(e.button)||this.stroke||this.drag||document.body.classList.contains('busy'))return;
  e.preventDefault();this.canvas.focus({preventScroll:true});this.onBegin();const p=this.position(e),g=this.geometry;
  const readOnly=this.$('paintOriginal').checked;
  // Temporary picker takes priority over Hand/Space without changing the active tool.
  if(e.button===0&&(e.altKey||(this.tool==='eyedropper'&&!this.space))){const data=readOnly?this.project.originalSheet.frames[this.sourceId].data:this.frame.data,c=samplePixel(data,g.width,g.height,p.x,p.y);if(c)this.setColor(c);this.hover=p;this.draw();return;}
  if(e.button===1||this.tool==='hand'||this.space){this.drag={pointer:e.pointerId,x:e.clientX,y:e.clientY};this.capture(e);this.canvas.style.cursor='grabbing';return;}
  if(readOnly){this.onMessage('ปิด ORIGINAL · READ ONLY ก่อนวาด',false);return;}
  if(!samplePixel(this.frame.data,g.width,g.height,p.x,p.y))return;
  const color=e.button===2||this.tool==='eraser'?[0,0,0,0]:this.color.slice();
  this.stroke={pointer:e.pointerId,project:this.project,id:this.sourceId,before:this.frame.data,buffer:this.frame.data.slice(),start:p,last:p,color,tool:this.tool,size:this.size};this.capture(e);
  if(this.tool==='fill')floodFill(this.stroke.buffer,g.width,g.height,p.x,p.y,color);else paintLine(this.stroke.buffer,g.width,g.height,p,p,color,this.size);
  this.hover=p;this.draw();
 }
 move(e){
  if(!this.frame)return;if(this.drag?.pointer===e.pointerId){this.pan.x+=e.clientX-this.drag.x;this.pan.y+=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;this.draw();return;}
  const p=this.position(e);this.hover=p;const g=this.geometry,s=this.stroke;
  if(s?.pointer===e.pointerId&&s.tool!=='fill'){
   if(s.tool==='line'){s.buffer=s.before.slice();paintLine(s.buffer,g.width,g.height,s.start,p,s.color,s.size);}
   else paintLine(s.buffer,g.width,g.height,s.last,p,s.color,s.size);s.last=p;
  }
  this.draw();
 }
 up(e){
  if(!this.owns(e))return;const s=this.stroke;this.stroke=null;this.drag=null;this.release(e.pointerId);this.canvas.style.cursor=this.tool==='hand'?'grab':'crosshair';
  if(s&&s.project===this.project&&s.id===this.sourceId){try{this.onCommit(s.id,s.buffer);}catch(error){this.onMessage(error.message,true);}}this.draw();
 }
 cancel(){const pointer=this.stroke?.pointer??this.drag?.pointer;this.stroke=null;this.drag=null;if(pointer!=null)this.release(pointer);this.draw();}
 handleKey(e){
  if(!this.active||document.querySelector('dialog[open]')||document.querySelector('[data-file-menu] [aria-expanded="true"]'))return false;
  if(e.key==='Escape'&&(this.stroke||this.drag)){e.preventDefault();e.stopPropagation();this.cancel();return true;}
  const input=e.target?.closest?.('input,select,textarea,[contenteditable="true"]');
  if(input){if(this.root.contains(input)&&e.code==='Space'){e.preventDefault();e.stopPropagation();return true;}return false;}
  if(this.stroke||this.drag){e.preventDefault();e.stopPropagation();return true;}
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();e.stopPropagation();this.onHistory(e.shiftKey?'redo':'undo');return true;}
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();e.stopPropagation();this.onHistory('redo');return true;}
  if(e.ctrlKey||e.metaKey)return false;
  if(shortcuts[e.code]&&!e.shiftKey&&!e.altKey){e.preventDefault();e.stopPropagation();this.setTool(shortcuts[e.code]);return true;}
  if(e.target===this.canvas){
   if(e.code==='Space'){e.preventDefault();e.stopPropagation();this.space=true;return true;}
   if(e.code==='BracketLeft'||e.code==='BracketRight'){e.preventDefault();this.size=clamp(this.size+(e.code==='BracketLeft'?-1:1),1,16);this.$('paintSize').value=this.size;this.draw();return true;}
   if(['Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();e.stopPropagation();return true;}
  }
  return false;
 }
 draw(){
  if(this.root.hidden)return;const c=this.canvas,dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,this.stage.clientWidth),h=Math.max(1,this.stage.clientHeight);
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=false;
  if(!this.frame){ctx.fillStyle='#8c98b0';ctx.font='14px Consolas';ctx.textAlign='center';ctx.fillText('OPEN A PNG AND SELECT A FRAME',w/2,h/2);return;}
  const g=this.geometry,readOnly=this.$('paintOriginal').checked,data=readOnly?this.project.originalSheet.frames[this.sourceId].data:this.stroke?.buffer??this.frame.data;
  Object.assign(c.dataset,{paintX:String(g.x),paintY:String(g.y),paintScale:String(g.scale),frameWidth:String(g.width),frameHeight:String(g.height),sourceId:String(this.sourceId)});
  if(!this.bitmap||this.bitmap.width!==g.width||this.bitmap.height!==g.height){this.bitmap=document.createElement('canvas');this.bitmap.width=g.width;this.bitmap.height=g.height;this.bitmapData=null;}
  if(this.bitmapData!==data||this.stroke){this.bitmap.getContext('2d').putImageData(new ImageData(data,g.width,g.height),0,0);this.bitmapData=data;}
  ctx.drawImage(this.bitmap,g.x,g.y,g.width*g.scale,g.height*g.scale);
  ctx.strokeStyle=readOnly?'#ef83ad':'#a5f1d0';ctx.lineWidth=1;ctx.strokeRect(g.x-.5,g.y-.5,g.width*g.scale+1,g.height*g.scale+1);
  if(this.$('paintGrid').checked&&g.scale>=6){ctx.strokeStyle='#91a4c637';ctx.lineWidth=1;ctx.beginPath();const left=Math.max(0,Math.floor(-g.x/g.scale)),right=Math.min(g.width,Math.ceil((w-g.x)/g.scale)),top=Math.max(0,Math.floor(-g.y/g.scale)),bottom=Math.min(g.height,Math.ceil((h-g.y)/g.scale));for(let x=left;x<=right;x++){const sx=Math.round(g.x+x*g.scale)+.5;ctx.moveTo(sx,Math.max(0,g.y));ctx.lineTo(sx,Math.min(h,g.y+g.height*g.scale));}for(let y=top;y<=bottom;y++){const sy=Math.round(g.y+y*g.scale)+.5;ctx.moveTo(Math.max(0,g.x),sy);ctx.lineTo(Math.min(w,g.x+g.width*g.scale),sy);}ctx.stroke();}
  const p=this.hover,col=p?samplePixel(data,g.width,g.height,p.x,p.y):null;
  this.$('paintCoordinate').textContent=col?`X ${p.x} · Y ${p.y} · ${hex(col)}`:`${g.width} × ${g.height} px`;
  this.$('paintZoomLabel').textContent=`${Math.round(g.scale*100)}%`;
  this.$('paintHint').textContent=readOnly?'ORIGINAL · READ ONLY · Alt + left click: pick original color':`${toolNames[this.tool]} · Alt + left click: pick color · Right-click: erase · Space+drag: pan`;
  if(col&&this.tool!=='hand'&&!readOnly){ctx.strokeStyle='#ffffff';ctx.lineWidth=1;const n=['eyedropper','fill'].includes(this.tool)?1:this.size;ctx.strokeRect(g.x+(p.x-Math.floor(n/2))*g.scale+.5,g.y+(p.y-Math.floor(n/2))*g.scale+.5,n*g.scale-1,n*g.scale-1);}
 }
}
