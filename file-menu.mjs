export class FileMenu{
 constructor(root,actions){
  this.root=root;this.actions=actions;this.button=root.querySelector('#fileMenuButton');this.panel=root.querySelector('#fileMenu');this.items=[...this.panel.querySelectorAll('[data-action]')];
  this.button.addEventListener('click',()=>this.open?this.close():this.show());
  this.button.addEventListener('keydown',event=>{
   if(!['ArrowDown','ArrowUp'].includes(event.key))return;
   event.preventDefault();this.show(event.key==='ArrowUp');
  });
  for(const item of this.items)item.addEventListener('click',()=>{
   if(item.disabled)return;this.close(true);this.actions[item.dataset.action]?.();
  });
  this.panel.addEventListener('keydown',event=>{
   const enabled=this.items.filter(item=>!item.disabled),index=enabled.indexOf(this.panel.ownerDocument.activeElement);
   if(event.key==='Escape'){event.preventDefault();this.close(true);return;}
   if(event.key==='Tab'){this.close();return;}
   if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||!enabled.length)return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?enabled.length-1:(index+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length;enabled[next].focus();
  });
  root.ownerDocument.addEventListener('pointerdown',event=>{if(!root.contains(event.target))this.close();});
  root.ownerDocument.defaultView.addEventListener('blur',()=>this.close());
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.open){event.preventDefault();this.close(true);}});
  this.close();
 }
 get open(){return !this.panel.hidden;}
 show(last=false){this.panel.hidden=false;this.button.setAttribute('aria-expanded','true');const enabled=this.items.filter(item=>!item.disabled);enabled[last?enabled.length-1:0]?.focus();}
 close(focus=false){this.panel.hidden=true;this.button.setAttribute('aria-expanded','false');if(focus)this.button.focus();}
 setEnabled(values){for(const item of this.items)if(item.dataset.action in values)item.disabled=!values[item.dataset.action];}
}
