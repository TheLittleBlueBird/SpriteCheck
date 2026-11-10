// Slots are boundaries between cards, including the empty space after the last.
export function dropSlot(rectangles,x){
 const index=rectangles.findIndex(r=>x<r.left+r.width/2);
 return index<0?rectangles.length:index;
}
export function keyMoveIndex(count,from,slot){
 if(![count,from,slot].every(Number.isInteger)||from<0||from>=count||slot<0||slot>count)return -1;
 return slot>from?slot-1:slot;
}
export function moveKeyToSlot(keys,from,slot){
 const to=keyMoveIndex(keys.length,from,slot);
 if(to<0||to===from)return false;
 keys.splice(to,0,keys.splice(from,1)[0]);return true;
}

// Pointer events avoid the native HTML drag ghost/forbidden cursor on blank space.
// A drag is a preview only; commit once on release, through the app's shared history.
export class TimelineDrag{
 constructor(root,{getState,onMove,onStart=()=>{},onHint=()=>{}}){
  this.root=root;this.document=root.ownerDocument;this.window=this.document.defaultView;
  this.getState=getState;this.onMove=onMove;this.onStart=onStart;this.onHint=onHint;
  this.gesture=null;this.frame=null;this.suppressClick=false;
  root.addEventListener('pointerdown',e=>this.down(e));
  root.addEventListener('dragstart',e=>{if(e.target.closest('.key'))e.preventDefault();});
  root.addEventListener('click',e=>{if(this.suppressClick&&e.detail>0){this.suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  this.document.addEventListener('pointermove',e=>this.move(e),true);
  this.document.addEventListener('pointerup',e=>this.up(e),true);
  this.document.addEventListener('pointercancel',e=>{if(e.pointerId===this.gesture?.id)this.cancel();},true);
  root.addEventListener('lostpointercapture',e=>{if(e.pointerId===this.gesture?.id)this.cancel();});
  this.document.addEventListener('keydown',e=>{
   if(!this.gesture)return;
   const escape=e.key==='Escape';this.cancel();
   if(escape){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  this.window.addEventListener('blur',()=>this.cancel());
  this.document.addEventListener('visibilitychange',()=>{if(this.document.hidden)this.cancel();});
 }
 valid(){const g=this.gesture,s=this.getState();return !!g&&s.enabled&&s.owner===g.owner&&s.row===g.row&&s.keys===g.keys;}
 down(e){
  this.suppressClick=false;
  if(e.button!==0||e.isPrimary===false)return;
  this.cancel();
  const card=e.target.closest('.key'),state=this.getState();
  if(!card||!this.root.contains(card)||!state.enabled||state.keys.length<2)return;
  const from=Number(card.dataset.index);if(!Number.isInteger(from)||from<0||from>=state.keys.length)return;
  this.gesture={id:e.pointerId,from,keys:state.keys,owner:state.owner,row:state.row,card,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,slot:from,last:0};
 }
 move(e){
  const g=this.gesture;if(!g||g.id!==e.pointerId)return;
  if(!this.valid()||!(e.buttons&1)){this.cancel();return;}
  g.x=e.clientX;g.y=e.clientY;
  if(!g.active&&Math.hypot(g.x-g.startX,g.y-g.startY)>=5){
   g.active=true;this.onStart(g.from);g.card.classList.add('key-dragging');this.root.classList.add('timeline-dragging');
   this.marker=this.document.createElement('div');this.marker.className='key-drop-marker';this.marker.setAttribute('aria-hidden','true');this.root.append(this.marker);
   try{this.root.setPointerCapture(g.id);}catch{/* Synthetic/native test events may not own a pointer. */}
   this.frame=this.window.requestAnimationFrame(t=>this.scroll(t));
  }
  if(g.active){e.preventDefault();this.preview();}
 }
 inside(){const r=this.root.getBoundingClientRect(),g=this.gesture;return g.x>=r.left&&g.x<=r.right&&g.y>=r.top&&g.y<=r.bottom;}
 preview(){
  const g=this.gesture;if(!g?.active)return;
  const cards=[...this.root.querySelectorAll('.key')],rects=cards.map(c=>c.getBoundingClientRect());
  g.slot=dropSlot(rects,g.x);
  const to=keyMoveIndex(g.keys.length,g.from,g.slot),inside=this.inside();
  this.marker.hidden=!inside;
  if(rects.length){const x=g.slot<rects.length?rects[g.slot].left-3:rects.at(-1).right+2;this.marker.style.left=`${x-this.root.getBoundingClientRect().left+this.root.scrollLeft}px`;}
  this.onHint(inside?`MOVE KEY ${g.from+1} → ${to+1} · ESC CANCEL`:'Release outside to cancel · ESC CANCEL');
 }
 scroll(time){
  this.frame=null;const g=this.gesture;if(!g?.active)return;
  if(!this.valid()){this.cancel();return;}
  const r=this.root.getBoundingClientRect(),edge=Math.min(48,r.width/4),delta=Math.min(32,time-g.last||16);g.last=time;
  if(g.y>=r.top&&g.y<=r.bottom){
   const direction=g.x<r.left+edge?-Math.min(1,(r.left+edge-g.x)/edge):g.x>r.right-edge?Math.min(1,(g.x-r.right+edge)/edge):0;
   this.root.scrollLeft=Math.max(0,Math.min(this.root.scrollWidth-this.root.clientWidth,this.root.scrollLeft+direction*delta*.8));
  }
  this.preview();this.frame=this.window.requestAnimationFrame(t=>this.scroll(t));
 }
 up(e){
  const g=this.gesture;if(!g||g.id!==e.pointerId)return;
  g.x=e.clientX;g.y=e.clientY;
  const active=g.active,valid=active&&this.valid()&&this.inside();
  if(valid)this.preview();const slot=g.slot,from=g.from;
  this.cancel();
  if(active){this.suppressClick=true;e.preventDefault();if(valid)this.onMove(from,slot);}
 }
 cancel(){
  const g=this.gesture;this.gesture=null;
  if(this.frame!=null)this.window.cancelAnimationFrame(this.frame);this.frame=null;
  this.marker?.remove();this.marker=null;this.root.classList.remove('timeline-dragging');
  if(g){g.card.classList.remove('key-dragging');if(g.active){this.suppressClick=true;this.onHint(null);}try{if(this.root.hasPointerCapture(g.id))this.root.releasePointerCapture(g.id);}catch{}}
 }
}
