// Window preferences are separate from sprite data, DAT files and Undo history.
export const LAYOUT_KEY='sprite-check-layout-v1';
export const DEFAULT_LAYOUT=Object.freeze({sidebar:246,inspector:320,timeline:190,preview:220});
// ResizeObserver must not resize its own observed layout in the delivery cycle.
// Batch notifications into the next paint; direct pointer/key updates stay immediate.
export function frameScheduler(callback,host=window){
 let pending=false;
 return ()=>{
  if(pending)return;pending=true;
  host.requestAnimationFrame(()=>{pending=false;callback();});
 };
}
const bound=(value,min,max)=>Math.round(Math.max(min,Math.min(max,value)));
export function normalizeLayout(value={}){
 const result={};
 for(const [name,fallback] of Object.entries(DEFAULT_LAYOUT)){
  const n=value?.[name];result[name]=typeof n==='number'&&Number.isFinite(n)?bound(n,60,1600):fallback;
 }
 return result;
}
export function constrainLayout(preferences,{width,height,previewSpace=height}={}){
 const p=normalizeLayout(preferences),w=Math.max(0,Number(width)||0),h=Math.max(0,Number(height)||0);
 const sidebarMin=200,inspectorMin=260,centerMin=300,gutters=24;
 const sidebarMax=Math.max(sidebarMin,Math.min(420,w-gutters-centerMin-inspectorMin));
 const sidebar=bound(p.sidebar,sidebarMin,sidebarMax);
 const inspectorMax=Math.max(inspectorMin,Math.min(720,w-gutters-centerMin-sidebar));
 const inspector=bound(p.inspector,inspectorMin,inspectorMax);
 const timelineMax=Math.max(170,Math.min(600,h-190-12));
 const timeline=bound(p.timeline,170,timelineMax);
 const previewMax=Math.max(72,Math.min(900,previewSpace-180));
 const preview=bound(p.preview,72,previewMax);
 return {sizes:{sidebar,inspector,timeline,preview},limits:{sidebar:[sidebarMin,sidebarMax],inspector:[inspectorMin,inspectorMax],timeline:[170,timelineMax],preview:[72,previewMax]}};
}
export class WorkspaceLayout{
 constructor(root=document){
  this.document=root;this.window=root.defaultView;this.app=root.querySelector('.app');this.workspace=root.querySelector('.workspace');
  try{this.preferences=normalizeLayout(JSON.parse(this.window.localStorage.getItem(LAYOUT_KEY)||'{}'));}catch{this.preferences=normalizeLayout();}
  this.handles=[...root.querySelectorAll('[data-resize]')];this.drag=null;
  this.apply();
  for(const handle of this.handles)this.bind(handle);
  root.getElementById('resetLayout').addEventListener('click',()=>this.reset());
  this.observer=new this.window.ResizeObserver(frameScheduler(()=>this.apply(),this.window));this.observer.observe(this.app);this.observer.observe(this.workspace);
  this.window.addEventListener('resize',()=>this.apply());
  this.window.addEventListener('blur',()=>this.finish(false));
 }
 get state(){return {preferences:{...this.preferences},sizes:{...this.current},limits:structuredClone(this.limits),compact:this.compact};}
 save(){try{this.window.localStorage.setItem(LAYOUT_KEY,JSON.stringify(this.preferences));}catch{/* Restricted storage still permits resizing this session. */}}
 apply(){
  this.compact=this.window.innerWidth<=980;
  const fixed=['.topbar','.overview','.workflow-guide','.app-footer'].reduce((n,selector)=>n+this.app.querySelector(selector).getBoundingClientRect().height,0);
  const available=this.app.clientHeight-fixed-8;
  const result=constrainLayout(this.preferences,{width:this.workspace.clientWidth,height:available,previewSpace:this.workspace.clientHeight});
  this.current=result.sizes;this.limits=result.limits;
  for(const [name,size] of Object.entries(this.current)){
   const property=`--${name}-size`,value=`${size}px`;
   if(this.app.style.getPropertyValue(property)!==value)this.app.style.setProperty(property,value);
  }
  for(const handle of this.handles){
   const name=handle.dataset.resize,disabled=this.compact;
   handle.tabIndex=disabled?-1:0;handle.setAttribute('aria-disabled',String(disabled));
   handle.setAttribute('aria-valuemin',this.limits[name][0]);handle.setAttribute('aria-valuemax',this.limits[name][1]);handle.setAttribute('aria-valuenow',this.current[name]);handle.setAttribute('aria-valuetext',`${this.current[name]} pixels`);
  }
 }
 set(name,value){
  this.preferences[name]=bound(value,...this.limits[name]);this.apply();
 }
 reset(name){
  if(name)this.preferences[name]=DEFAULT_LAYOUT[name];else this.preferences=normalizeLayout();
  this.apply();this.save();
 }
 finish(commit){
  if(!this.drag)return;
  const {handle,pointerId,before}=this.drag;this.drag=null;
  if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);
  this.document.body.classList.remove('resizing','resizing-horizontal','resizing-vertical');handle.classList.remove('dragging');
  if(commit)this.save();else{this.preferences=before;this.apply();}
 }
 bind(handle){
  const name=handle.dataset.resize,horizontal=handle.getAttribute('aria-orientation')==='horizontal',sign=['inspector','timeline'].includes(name)?-1:1;
  handle.addEventListener('pointerdown',event=>{
   if(this.compact||event.button!==0||this.drag)return;
   event.preventDefault();handle.focus({preventScroll:true});
   this.drag={handle,pointerId:event.pointerId,start:horizontal?event.clientY:event.clientX,size:this.current[name],before:{...this.preferences}};
   handle.setPointerCapture(event.pointerId);handle.classList.add('dragging');
   this.document.body.classList.add('resizing',horizontal?'resizing-horizontal':'resizing-vertical');
  });
  handle.addEventListener('pointermove',event=>{
   if(this.drag?.handle!==handle||this.drag.pointerId!==event.pointerId)return;
   this.set(name,this.drag.size+sign*((horizontal?event.clientY:event.clientX)-this.drag.start));
  });
  handle.addEventListener('pointerup',event=>{if(this.drag?.pointerId===event.pointerId)this.finish(true);});
  handle.addEventListener('pointercancel',()=>this.finish(false));handle.addEventListener('lostpointercapture',()=>this.finish(false));
  handle.addEventListener('dblclick',()=>{if(!this.compact)this.reset(name);});
  handle.addEventListener('keydown',event=>{
   if(this.compact)return;
   if(event.key==='Escape'&&this.drag){event.preventDefault();this.finish(false);return;}
   const increase=horizontal?'ArrowDown':'ArrowRight',decrease=horizontal?'ArrowUp':'ArrowLeft';
   if(![increase,decrease,'Home','End'].includes(event.key))return;
   event.preventDefault();event.stopPropagation();
   this.set(name,event.key==='Home'?this.limits[name][0]:event.key==='End'?this.limits[name][1]:this.current[name]+(event.key===increase?1:-1)*sign*(event.shiftKey?40:10));this.save();
  });
 }
}
