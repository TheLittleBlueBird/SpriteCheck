// View preferences only: never fill image pixels, exports, DAT files or history.
export const BACKGROUND_KEY='sprite-check-background-v1';
export const DEFAULT_BACKGROUND=Object.freeze({mode:'checker',color:'#242b3b'});
export function normalizeBackground(value){
 return {mode:value?.mode==='solid'?'solid':'checker',color:typeof value?.color==='string'&&/^#[\da-f]{6}$/i.test(value.color)?value.color.toLowerCase():DEFAULT_BACKGROUND.color};
}
export function loadBackground(storage){
 try{return normalizeBackground(JSON.parse(storage.getItem(BACKGROUND_KEY)));}catch{return {...DEFAULT_BACKGROUND};}
}
export function saveBackground(storage,value){
 try{storage.setItem(BACKGROUND_KEY,JSON.stringify(normalizeBackground(value)));return true;}catch{return false;}
}
export class CanvasBackground{
 constructor(root=document){
  this.document=root;this.window=root.defaultView;
  try{this.storage=this.window.localStorage;}catch{this.storage=null;}
  this.preferences=loadBackground(this.storage);
  const controls=root.createElement('div');controls.className='canvas-background-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Viewport background');
  controls.innerHTML=`<label for="canvasBackgroundMode">BACKGROUND</label><select id="canvasBackgroundMode" aria-label="Viewport background mode" title="พื้นหลังทุก viewport · ไม่ติดไปกับ PNG"><option value="checker">Checkerboard</option><option value="solid">Solid color</option></select><input id="canvasBackgroundColor" type="color" aria-label="Viewport background color" title="เลือกสีพื้นหลังทุก viewport"><div class="background-presets"><button type="button" data-background="#111111" style="--swatch:#111111" aria-label="Black background" title="พื้นหลังดำ"></button><button type="button" data-background="#808080" style="--swatch:#808080" aria-label="Gray background" title="พื้นหลังเทา"></button><button type="button" data-background="#ffffff" style="--swatch:#ffffff" aria-label="White background" title="พื้นหลังขาว"></button></div>`;
  root.querySelector('.menubar').append(controls);
  this.mode=root.getElementById('canvasBackgroundMode');this.color=root.getElementById('canvasBackgroundColor');this.controls=controls;
  this.mode.addEventListener('change',()=>this.set({mode:this.mode.value}));
  this.color.addEventListener('input',()=>this.set({mode:'solid',color:this.color.value}));
  for(const button of controls.querySelectorAll('[data-background]'))button.addEventListener('click',()=>this.set({mode:'solid',color:button.dataset.background}));
  this.apply();
 }
 set(value){this.preferences=normalizeBackground({...this.preferences,...value});this.apply();saveBackground(this.storage,this.preferences);}
 apply(){
  const {mode,color}=this.preferences,root=this.document.documentElement;
  root.dataset.canvasBackground=mode;root.style.setProperty('--canvas-background-color',color);
  this.mode.value=mode;this.color.value=color;
  for(const button of this.controls.querySelectorAll('[data-background]'))button.setAttribute('aria-pressed',String(mode==='solid'&&button.dataset.background===color));
 }
}
