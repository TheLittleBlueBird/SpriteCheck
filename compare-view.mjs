import {ticks,frameAtSeconds} from './core.mjs';
import {compareSettings,comparisonMetrics,byteSize} from './compare-model.mjs';

export class CompareView{
 constructor(){
  this.settings=compareSettings({log:false});this.project=null;this.cache=new WeakMap();this.states={};this.last={seconds:0,loop:true,row:0};
  this.panels=['left','right'].map((side,i)=>{
   const id=i?'Merged':'Original',panel={side,id,stage:document.getElementById(`compare${id}Stage`),canvas:document.getElementById(`compare${id}`),mode:document.getElementById(`compare${id}Mode`),zoom:document.getElementById(`compare${id}Zoom`)};
   panel.mode.onchange=()=>{this.settings[side]={mode:panel.mode.value,zoom:1,x:0,y:0};if(this.settings.linked)this.settings[i?'left':'right']={...this.settings[side]};this.sync();this.redraw();};
   for(const [action,factor] of [['Out',.8],['In',1.25]])document.getElementById(`compare${id}${action}`).onclick=()=>this.zoomBy(panel,factor);
   document.getElementById(`compare${id}Fit`).onclick=()=>this.reset(panel,false);
   document.getElementById(`compare${id}Actual`).onclick=()=>this.reset(panel,true);
   panel.stage.addEventListener('wheel',e=>{e.preventDefault();const r=panel.stage.getBoundingClientRect();this.zoomBy(panel,e.deltaY<0?1.15:1/1.15,{x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2});},{passive:false});
   let drag=null;
   panel.stage.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY};panel.stage.setPointerCapture(e.pointerId);panel.stage.classList.add('panning');};
   panel.stage.onpointermove=e=>{if(!drag)return;const s=this.settings[side];s.x+=e.clientX-drag.x;s.y+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};this.link(panel);this.redraw();};
   panel.stage.onpointerup=panel.stage.onpointercancel=()=>{drag=null;panel.stage.classList.remove('panning');};
   return panel;
  });
  document.getElementById('compareLink').onchange=e=>{this.settings.linked=e.target.checked;if(this.settings.linked)this.settings.right={...this.settings.left};this.sync();this.redraw();};
  document.getElementById('compareSplit').oninput=e=>{this.settings.split=Number(e.target.value);this.sync();};
  document.getElementById('compareLogToggle').onclick=()=>this.setLog(!this.settings.log);
  document.getElementById('compareLogClose').onclick=()=>this.setLog(false);
  this.observer=new ResizeObserver(()=>this.redraw());this.panels.forEach(p=>this.observer.observe(p.stage));this.sync();
 }
 restore(settings){this.settings=compareSettings(settings);this.sync();}
 setLog(visible){this.settings.log=!!visible;this.sync();this.redraw();}
 clear(){
  this.project=null;this.frameCanvas=null;this.cache=new WeakMap();this.states={};this.last={seconds:0,loop:true,row:0};this.restore({log:false});
  for(const p of this.panels){p.canvas.getContext('2d').clearRect(0,0,p.canvas.width,p.canvas.height);document.getElementById(`compare${p.id}Info`).textContent='';p.zoom.textContent='FIT';}
  document.getElementById('compareLogRows').replaceChildren();document.getElementById('compareFileBytes').textContent='';document.getElementById('compareLogState').textContent='MERGE PENDING';document.getElementById('compareResultColumn').textContent='AFTER MERGE';
  document.getElementById('compareRightTitle').textContent='● EDITED PREVIEW';document.getElementById('compareRightFooter').textContent='Preview edits · Merge to pack';document.getElementById('compareCaption').textContent='Play to preview the original before Merge.';
 }
 sync(){
  for(const p of this.panels)p.mode.value=this.settings[p.side].mode;
  document.getElementById('compareLink').checked=this.settings.linked;document.getElementById('compareSplit').value=this.settings.split;
  document.getElementById('comparePanels').style.gridTemplateColumns=`minmax(0,${this.settings.split}fr) minmax(0,${100-this.settings.split}fr)`;
  document.getElementById('compareViewport').classList.toggle('log-collapsed',!this.settings.log);
  document.getElementById('compareLog').hidden=!this.settings.log;document.getElementById('compareLogToggle').textContent=this.settings.log?'HIDE COMPARE LOG':'SHOW COMPARE LOG';document.getElementById('compareLogToggle').setAttribute('aria-expanded',String(this.settings.log));
 }
 link(panel){if(this.settings.linked)this.settings[panel.side==='left'?'right':'left']={...this.settings[panel.side]};}
 zoomBy(panel,factor,point={x:0,y:0}){const s=this.settings[panel.side],old=s.zoom;s.zoom=Math.max(.125,Math.min(64,s.zoom*factor));const ratio=s.zoom/old;s.x=point.x-(point.x-s.x)*ratio;s.y=point.y-(point.y-s.y)*ratio;this.link(panel);this.redraw();}
 reset(panel,actual){const s=this.settings[panel.side];s.zoom=actual?Math.max(.125,Math.min(64,1/(this.states[panel.side]?.fit||1))):1;s.x=0;s.y=0;this.link(panel);this.redraw();}
 bitmap(image){let c=this.cache.get(image);if(!c){c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);this.cache.set(image,c);}return c;}
 update(project,frameCanvas,sourceBytes,packedBytes,jsonBytes){
  this.project=project;this.frameCanvas=frameCanvas;this.last.row=Math.min(this.last.row,project.sheet.original.length-1);
  const m=comparisonMetrics(project,sourceBytes,packedBytes,jsonBytes),o=m.original,n=m.merged;
  document.getElementById('compareRightTitle').textContent=n?'● AFTER MERGE':'● EDITED PREVIEW';
  document.getElementById('compareRightFooter').textContent=n?'Confirmed edits · packed image references':'Preview current edits · Merge to create a packed sheet';
  document.getElementById('compareLogState').textContent=n?'MEASURED EXPORT':'ORIGINAL LOADED · MERGE PENDING';
  document.getElementById('compareResultColumn').textContent=n?'MERGED':'AFTER MERGE';
  const rows=[['Resolution',`${o.width} × ${o.height} px`,n?`${n.width} × ${n.height} px`:'—',n?`${m.areaReduction.toFixed(2)}% area saved`:'Merge to measure'],
   ['PNG file',byteSize(o.pngBytes),byteSize(n?.pngBytes),'Actual encoded bytes'],['JSON file','—',byteSize(n?.jsonBytes),'Unity timeline manifest'],
   ['Total files',byteSize(o.pngBytes),byteSize(n?.totalBytes),m.fileReduction==null?'—':`${Math.abs(m.fileReduction).toFixed(2)}% ${m.fileReduction>=0?'smaller':'larger'}`],
   ['Stored images',String(o.storedImages),n?String(n.storedImages):'—',n?`${o.storedImages-n.storedImages} fewer images`:'Merge to count'],
   ['Rows / total ticks',`${o.rows} / ${o.playbackTicks}`,n?`${n.rows} / ${n.playbackTicks}`:'—',`Draft: ${m.editedTicks} ticks`],
   ['RGBA32 estimate',byteSize(o.rgbaBytes),byteSize(n?.rgbaBytes),'Pixels × 4; not measured Unity memory']];
  const body=document.getElementById('compareLogRows');body.replaceChildren();
  for(const values of rows){const tr=document.createElement('tr');values.forEach((value,i)=>{const td=document.createElement(i?'td':'th');td.textContent=value;if(i===0)td.scope='row';tr.append(td);});body.append(tr);}
  document.getElementById('compareFileBytes').textContent=n?`PNG ${n.pngBytes??'…'} B + JSON ${n.jsonBytes??'…'} B · source ${o.pngBytes} B`:`Source PNG: ${o.pngBytes} bytes · no merged file yet`;
  this.redraw();
 }
 draw(seconds,loop,row){this.last={seconds,loop,row};this.redraw();}
 redraw(){
  if(!this.project||document.getElementById('compareViewport').hidden)return;
  const {seconds,loop,row}=this.last,p=this.project,o=p.sheet.original[row],m=p.merged;
  const right=m?{...m.manifest.animations[row],keys:m.manifest.animations[row].timeline.map(k=>({sourceId:k.frame,ticks:k.ticks}))}:p.draft[row];
  for(const [i,panel] of this.panels.entries()){
   const animation=i?right:o,current=frameAtSeconds(animation,seconds,loop),sourceId=current?.key.sourceId,s=this.settings[panel.side];
   let image=null,rect=null;
   if(s.mode==='sheet'){
    const sheet=i?(m??(p.hasPixelEdits?p.sheet.image:null)):(p.originalSheet??p.sheet).image;if(sheet){image=this.bitmap(sheet);rect=i&&m?m.frames[sourceId]:p.sheet.frames[sourceId];}
   }else if(sourceId!=null)image=this.frameCanvas(sourceId,!!(i&&m),!i);
   const w=Math.max(1,panel.stage.clientWidth),h=Math.max(1,panel.stage.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1),c=panel.canvas;
   if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
   const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=false;
   let fit=1;
   if(image){fit=Math.min((w-(s.mode==='sheet'?20:w*.22))/image.width,(h-(s.mode==='sheet'?20:h*.12))/image.height);if(fit>=1)fit=Math.floor(fit);fit=Math.max(.001,fit);const scale=fit*s.zoom;
    ctx.save();ctx.translate(w/2+s.x,h/2+s.y);ctx.scale(scale,scale);ctx.drawImage(image,-image.width/2,-image.height/2);
    if(rect){ctx.strokeStyle=i?'#a5f1d0':'#ec719e';ctx.lineWidth=2/scale;ctx.strokeRect(rect.x-image.width/2,rect.y-image.height/2,p.sheet.grid.cellWidth,p.sheet.grid.cellHeight);}ctx.restore();
   }else{ctx.fillStyle='#8c98b0';ctx.font='12px Consolas';ctx.textAlign='center';ctx.fillText(i&&s.mode==='sheet'&&!m?'MERGE TO CREATE THE NEW SHEET':'NO FRAMES IN THIS ROW',w/2,h/2);}
   this.states[panel.side]={fit,scale:fit*s.zoom};panel.zoom.textContent=image?`${Math.round(fit*s.zoom*100)}%`:'—';
   document.getElementById(`compare${panel.id}Info`).textContent=`${ticks(animation)} ticks · ${animation.fps} FPS · ${(ticks(animation)/animation.fps).toFixed(3)}s`;
  }
  document.getElementById('compareCaption').textContent=`${o.name} · synchronized ${seconds.toFixed(2)}s · ${loop?'looping':'play once'} · drag to pan / wheel to zoom`;
 }
}
