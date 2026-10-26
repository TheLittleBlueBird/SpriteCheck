// Physical key codes keep Ctrl+Z/Y working with Thai and English layouts.
export function shortcutAction(event,{hasProject=false,modalOpen=false,menuOpen=false,busy=false}={}){
 if(!hasProject||modalOpen||menuOpen||busy||event.isComposing||event.defaultPrevented||event.altKey)return null;
 const target=event.target,tag=target?.tagName?.toUpperCase(),type=target?.type?.toLowerCase();
 const textInput=tag==='INPUT'&&!['number','checkbox','radio','range','button','submit','file','reset','color'].includes(type);
 if(target?.closest?.('[role="separator"]')||target?.closest?.('[data-file-menu]'))return null;
 if(textInput||tag==='TEXTAREA'||target?.isContentEditable||target?.closest?.('[contenteditable="true"]'))return null;
 const key=event.key?.toLowerCase(),control=event.ctrlKey||event.metaKey;
 if(control){
  if(event.code==='KeyZ'||key==='z')return event.shiftKey?'redo':'undo';
  if(event.code==='KeyY'||key==='y')return 'redo';
  return null;
 }
 if(event.shiftKey)return null;
 if(event.code==='Space'||event.key===' '||event.key==='Spacebar')return 'play';
 if(!['INPUT','SELECT','TEXTAREA'].includes(tag)){
  if(event.code==='ArrowLeft'||event.key==='ArrowLeft')return 'previous';
  if(event.code==='ArrowRight'||event.key==='ArrowRight')return 'next';
 }
 if((event.code==='Delete'||event.key==='Delete')&&!['INPUT','SELECT','TEXTAREA'].includes(tag))return 'delete';
 return null;
}
