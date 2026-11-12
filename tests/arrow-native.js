// Optional native self-test: real packaged DOM, synthetic keyboard events.
(async()=>{
 const report=window.__arrowChecks={done:false,checks:[],error:null},$=id=>document.getElementById(id),p=()=>spriteCheck.project;
 const check=(name,value)=>{if(!value)throw Error(name);report.checks.push(name);};
 const wait=async test=>{for(let i=0;i<300;i++){if(test())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out');};
 const arrow=(direction,target=$('sheetCanvas'))=>{const code=direction>0?'ArrowRight':'ArrowLeft',e=new KeyboardEvent('keydown',{code,key:code,bubbles:true,cancelable:true});target.dispatchEvent(e);return e;};
 const change=(id,value,event='change')=>{$(id).value=value;$(id).dispatchEvent(new Event(event,{bubbles:true}));};
 const card=index=>$('keyframes').querySelector(`[data-index="${index}"]`),selected=()=>Number($('keyframes').querySelector('.selected')?.dataset.index??-1);
 const frameId=()=>Number($('sourceFrame').value),timeline=()=>JSON.stringify(p().draft);
 const outlined=frame=>{const pixel=$('sheetCanvas').getContext('2d').getImageData(frame.x+2,frame.y+10,1,1).data;return pixel[0]===181&&pixel[1]===255&&pixel[2]===224&&pixel[3]===255;};
 try{
  $('sheetTab').click();document.querySelector('[data-row="0"]').click();
  const initial=timeline();arrow(1);
  check('Original Right arrow aligns the source cell, key highlight and preview',spriteCheck.mode==='original'&&selected()===1&&frameId()===1&&$('previewCounter').textContent==='02 / 12'&&outlined(p().sheet.frames[1]));
  $('editTimeline').click();card(1).click();const mousePixels=$('previewCanvas').toDataURL();card(0).click();$('sheetCanvas').focus();const event=arrow(1);
  check('Edited Right arrow matches mouse selection and exact preview pixels',event.defaultPrevented&&selected()===1&&frameId()===1&&$('previewCanvas').toDataURL()===mousePixels&&outlined(p().sheet.frames[1]));
  check('Arrow selection is presentation-only and creates no history',timeline()===initial&&p().undoStack.length===0&&p().redoStack.length===0);
  arrow(-1);check('Left arrow synchronizes every selection back to the first key',selected()===0&&frameId()===0&&outlined(p().sheet.frames[0]));
  card(0).focus();arrow(1,card(0));check('Timeline keyboard focus follows the selected key',document.activeElement===card(1)&&selected()===1);
  for(const id of ['fps','sourceFrame','scrubber','exportName']){const time=spriteCheck.time,index=selected(),e=arrow(1,$(id));check(`Arrow leaves ${id} control behavior untouched`,!e.defaultPrevented&&spriteCheck.time===time&&selected()===index);}
  card(0).click();change('holdTicks','4');const heldPixels=$('previewCanvas').toDataURL(),history=p().undoStack.length;
  for(let i=0;i<3;i++)arrow(1);
  check('Held key remains selected across its first four ticks',selected()===0&&frameId()===0&&Math.abs(spriteCheck.time-.3)<1e-7&&$('previewCanvas').toDataURL()===heldPixels);
  arrow(1);check('Crossing a Hold boundary selects the next key and cell',selected()===1&&frameId()===1&&outlined(p().sheet.frames[1]));
  arrow(-1);check('Left arrow re-enters the held key without changing Hold or history',selected()===0&&frameId()===0&&p().draft[0].keys[0].ticks===4&&p().undoStack.length===history);
  card(1).click();$('duplicateKey').click();change('scrubber','5','input');
  check('Scrubbing to a repeated-source occurrence selects that exact logical key',selected()===2&&frameId()===1);
  arrow(-1);check('Arrow between repeated-source occurrences changes key selection independently',selected()===1&&frameId()===1);
  card(0).click();$('moveRight').click();card(3).click();$('deleteKey').click();$('firstFrame').click();arrow(1);
  check('After reorder and deletion arrows select the edited key order',selected()===1&&frameId()===0&&outlined(p().sheet.frames[0]));
  const beforeDelete=timeline();$('deleteKey').click();
  check('Delete after Arrow removes the selected key rather than the former mouse key',!p().draft[0].keys.some(k=>k.sourceId===0));
  $('undo').click();const redo=p().redoStack.length;arrow(-1);arrow(1);
  check('Navigation preserves Undo/Redo and exact edited timelines',timeline()===beforeDelete&&p().redoStack.length===redo);
  $('firstFrame').click();check('First Frame synchronizes source and timeline selection',selected()===0&&frameId()===p().draft[0].keys[0].sourceId);
  change('playbackMode','original');change('scrubber','2','input');
  check('Original can select a deleted source without highlighting the wrong edited key',selected()===2&&frameId()===2&&$('selectedLabel').textContent==='SOURCE FRAME'&&outlined(p().sheet.frames[2]));
  change('playbackMode','edited');$('confirm').click();$('merge').click();await wait(()=>p().merged&&!document.body.classList.contains('busy'));
  $('sheetTab').click();document.querySelector('[data-row="8"]').click();change('playbackMode','merged');$('viewMerged').click();change('scrubber','6','input');
  const alias=p().draft[8].keys[6].sourceId,packed=p().merged.frames[p().merged.sourceToFrame.get(alias)],merged=p().merged,undo=p().undoStack.length;
  check('Merged aliases select the logical source and its shared packed cell',selected()===6&&frameId()===alias&&packed.sourceId!==alias&&outlined(packed));
  $('compareTab').click();arrow(-1,document.body);
  check('Compare arrows synchronize logical key selection without invalidating Merge',selected()===5&&frameId()===p().draft[8].keys[5].sourceId&&p().merged===merged&&p().undoStack.length===undo&&!$('export').disabled);
  $('sheetTab').click();$('viewOriginal').click();change('playbackMode','edited');document.querySelector('[data-row="0"]').click();
  for(let i=0;i<4;i++)$('zoomIn').click();const viewport=$('sheetViewport');viewport.scrollLeft=0;change('scrubber',String(Number($('endTick').textContent)-1),'input');
  check('Selection automatically reveals cells outside the horizontal sheet viewport',viewport.scrollLeft>0&&selected()===p().draft[0].keys.length-1&&outlined(p().sheet.frames[frameId()]));
  for(let i=0;i<20;i++)$('duplicateKey').click();const root=$('keyframes'),total=p().draft[0].keys.reduce((n,k)=>n+k.ticks,0);
  change('scrubber',String(total-2),'input');root.scrollLeft=0;arrow(1);
  check('Arrow reveals an offscreen selected timeline card',root.scrollLeft>0&&selected()===p().draft[0].keys.length-1);
  const end=spriteCheck.time;arrow(1);check('Right arrow clamps at the end without losing selection',spriteCheck.time===end&&selected()===p().draft[0].keys.length-1);
  $('play').click();arrow(-1);check('Arrow navigation pauses running playback with matching selection',!spriteCheck.playing&&selected()===p().draft[0].keys.length-2);
  document.querySelector('[data-row="4"]').click();const count=p().draft[4].keys.length;for(let i=0;i<count;i++)$('deleteKey').click();arrow(1,document.body);
  check('Empty edited rows have no stale timeline selection',selected()===-1&&$('previewCounter').textContent==='EMPTY ROW'&&$('holdTicks').disabled);
  document.querySelector('[data-row="0"]').click();change('scrubber',String(total-1),'input');
  report.finalSource=frameId();report.finalIndex=selected();report.finalTime=spriteCheck.time;report.draft=structuredClone(p().draft);
 }catch(error){report.error=String(error.stack??error);}
 finally{report.done=true;}
})();
