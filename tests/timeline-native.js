// Loaded only by the optional native --test-timeline-move self-test.
// Synthetic PointerEvents exercise the actual packaged DOM/controller, not OS input.
(async()=>{
 const report=window.__timelineChecks={done:false,checks:[],error:null};
 const $=id=>document.getElementById(id),p=()=>spriteCheck.project,keys=()=>p().draft[0].keys;
 const snapshot=()=>JSON.stringify(p().draft),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const check=(name,value)=>{if(!value)throw Error(name);report.checks.push(name);};
 const point=(node,ratio=.25)=>{const r=node.getBoundingClientRect();return {x:r.left+r.width*ratio,y:r.top+r.height*.5};};
 const event=(type,where,target=$('keyframes'))=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,isPrimary:true,pointerType:'mouse',pointerId:91,button:0,buttons:type==='pointerup'?0:1,clientX:where.x,clientY:where.y}));
 const start=index=>{const card=$('keyframes').querySelector(`[data-index="${index}"]`);card.scrollIntoView({block:'nearest',inline:'nearest'});const at=point(card);event('pointerdown',at,card);event('pointermove',{x:at.x+8,y:at.y});return at;};
 const drop=(from,to,after=false)=>{start(from);const card=$('keyframes').querySelector(`[data-index="${to}"]`);card.scrollIntoView({block:'nearest',inline:'nearest'});const at=point(card,after?.85:.15);event('pointermove',at);event('pointerup',at);};
 try{
  $('sheetTab').click();document.querySelector('[data-row="0"]').click();
  check('Fresh Original shows an explicit Edit Keys action',spriteCheck.mode==='original'&&!$('editTimeline').hidden);
  let before=snapshot();start(0);event('pointerup',point($('keyframes')));
  check('Original playback cannot accidentally reorder source keys',snapshot()===before&&!document.querySelector('.key-drop-marker')&&p().undoStack.length===0);
  $('editTimeline').click();
  check('Edit Keys switches playback without modifying the project',spriteCheck.mode==='edited'&&p().undoStack.length===0&&$('editTimeline').hidden);
  const holds=$('holdTicks');holds.value=4;holds.dispatchEvent(new Event('change',{bubbles:true}));
  const original=JSON.stringify(p().sheet.original),pixels=p().sheet.image.data.slice(),other=JSON.stringify(p().draft.slice(1));
  before=snapshot();const count=keys().length,history=p().undoStack.length,moved=structuredClone(keys()[0]),expectedPreview=$('previewCanvas').toDataURL();
  drop(0,count-1,true);
  check('Forward drag reaches the final slot and retains Hold',JSON.stringify(keys().at(-1))===JSON.stringify(moved)&&p().undoStack.length===history+1&&keys().length===count);
  check('Moved key is selected and live preview retains exact pixels at its new start',document.querySelector('#keyframes .selected')?.dataset.index===String(count-1)&&Math.abs(spriteCheck.time-(count-1)/p().draft[0].fps)<1e-7&&$('previewCounter').textContent.startsWith(String(count).padStart(2,'0'))&&!spriteCheck.playing&&$('previewCanvas').toDataURL()===expectedPreview);
  const reordered=snapshot();
  $('undo').click();check('Undo restores the exact pre-drag order and holds',snapshot()===before);
  $('redo').click();check('Redo restores the exact moved order',snapshot()===reordered);
  drop(count-1,0,false);check('Backward drag restores first position with the original held key',JSON.stringify(keys()[0])===JSON.stringify(moved));
  before=snapshot();const undoCount=p().undoStack.length;start(0);const end=point($('keyframes').querySelector('[data-index="1"]'),.15);event('pointermove',end);event('pointerup',end);
  check('Dropping in the adjacent unchanged slot creates no history',snapshot()===before&&p().undoStack.length===undoCount);
  start(1);const last=point($('keyframes').querySelector(`[data-index="${count-1}"]`),.85);event('pointermove',last);
  document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));event('pointerup',last);
  check('Escape cancels preview without editing or leaving a marker',snapshot()===before&&!document.querySelector('.key-drop-marker')&&!$('keyframes').classList.contains('timeline-dragging'));
  start(0);event('pointerup',{x:-20,y:-20});check('Releasing outside cancels without editing',snapshot()===before);
  start(0);document.querySelector('[data-row="1"]').click();event('pointerup',point($('keyframes')));document.querySelector('[data-row="0"]').click();
  check('Switching animation rows cancels a pending drag',snapshot()===before&&!document.querySelector('.key-drop-marker'));
  // A short row leaves a visible blank end area, matching the reported failed drop.
  document.querySelector('[data-row="4"]').click();let short=p().draft[4].keys,first=short[0].sourceId,shortCount=short.length;
  const root=$('keyframes');root.scrollLeft=0;const r=root.getBoundingClientRect(),lastRect=root.querySelector('.key:last-child').getBoundingClientRect();
  check('Short-row fixture provides actual blank drop space',lastRect.right<r.right-8);
  start(0);const blank={x:r.right-8,y:r.top+r.height/2};event('pointermove',blank);event('pointerup',blank);
  check('Blank area after the last card accepts a move',p().draft[4].keys.at(-1).sourceId===first&&p().draft[4].keys.length===shortCount);
  $('undo').click();document.querySelector('[data-row="0"]').click();
  // Add repeated keys through the real button to force horizontal overflow.
  for(let i=0;i<20;i++)$('duplicateKey').click();root.scrollLeft=0;
  const longBefore=snapshot(),longHistory=p().undoStack.length,firstLong=structuredClone(keys()[0]);start(0);
  const edge=root.getBoundingClientRect(),edgePoint={x:edge.right-3,y:edge.top+edge.height/2};event('pointermove',edgePoint);
  for(let i=0;i<120&&root.scrollLeft<root.scrollWidth-root.clientWidth-2;i++)await wait(25);
  check('Holding near the right edge automatically scrolls to hidden keys',root.scrollLeft>100&&root.scrollLeft>=root.scrollWidth-root.clientWidth-4);
  event('pointerup',edgePoint);
  check('Edge-scrolled drop moves exactly one key to the end',JSON.stringify(keys().at(-1))===JSON.stringify(firstLong)&&p().undoStack.length===longHistory+1);
  $('undo').click();check('Undo remains exact after auto-scroll',snapshot()===longBefore);
  for(let i=0;i<20;i++)$('undo').click();
  // From the screenshot scenario: move a key while edited playback is running.
  root.scrollLeft=0;$('play').click();drop(0,2,false);
  check('Moving during playback pauses and leaves the moved key selected',!spriteCheck.playing&&document.querySelector('#keyframes .selected')?.dataset.index==='1');
  check('Reorder preserves immutable artwork, row identity, FPS and Loop',JSON.stringify(p().sheet.original)===original&&JSON.stringify(p().draft.slice(1))===other&&p().draft[0].fps===10&&p().draft[0].loop===true&&pixels.every((v,i)=>v===p().sheet.image.data[i]));
  check('Timeline controls and insertion hint remain readable at 12px or more',[...document.querySelectorAll('.timeline-row-heading *')].filter(e=>e.getClientRects().length&&e.textContent.trim()).every(e=>parseFloat(getComputedStyle(e).fontSize)>=12));
  $('play').click();const time=spriteCheck.time;await wait(250);check('Reordered animation plays and loops through the existing player',spriteCheck.playing&&spriteCheck.time!==time);$('play').click();root.querySelector('.selected').click();
  // Leave a held, reordered timeline for native save/reopen/export verification.
  $('exportName').value='timeline-moved';
  report.expected=structuredClone(p().draft);report.original=structuredClone(p().sheet.original);
  window.__showTimelineInsertion=()=>{start(1);const at=point(root.querySelector('[data-index="4"]'),.15);event('pointermove',at);};
 }catch(error){report.error=String(error.stack??error);}
 finally{report.done=true;}
})();
