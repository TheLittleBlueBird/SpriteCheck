import test from 'node:test';
import assert from 'node:assert/strict';
import {UpdateDialog,APP_VERSION} from '../update.mjs';

function harness(){
 const ids=['updateCurrent','updateClose','updateCheck','updateInstall','updateRelease','updateDialog','updateStatus','updateLatest','updateNotes','updateProgress'];
 const e=Object.fromEntries(ids.map(id=>[id,{dataset:{},open:false,disabled:false,hidden:false,textContent:'',addEventListener(type,fn){this[type]=fn;},showModal(){this.open=true;},close(){this.open=false;}}]));
 const packets=[],saves=[];let paused=0;
 const ui=new UpdateDialog({document:{getElementById:id=>e[id],defaultView:{open(){}}},desktop:{version:APP_VERSION},post:p=>packets.push(p),pause:()=>paused++,saveSession:()=>new Promise((resolve,reject)=>saves.push({resolve,reject})),fetchRelease:async()=>{throw Error('not used');}});
 const send=(state,extra={})=>ui.receive({kind:'update-state',requestId:ui.sequence,state,version:'99.0.0',...extra});
 ui.open();send('available');return {ui,e,packets,saves,send,get paused(){return paused;}};
}
test('Dewey stale check packets cannot unlock a pending recovery save',async()=>{
 const h=harness(),active=h.ui.sequence,installing=h.ui.install();
 h.send('error',{requestId:active-1,message:'late old check'});
 const observed={state:h.e.updateStatus.dataset.state,locked:h.ui.locked,closeDisabled:h.e.updateClose.disabled};
 h.saves[0].resolve('DAT');await installing;
 assert.deepEqual(observed,{state:'saving',locked:true,closeDisabled:true});
});
test('Dewey stale available packet cannot enable a second install while downloading',async()=>{
 const h=harness(),active=h.ui.sequence,first=h.ui.install();h.saves[0].resolve('DAT');await first;
 h.send('available',{requestId:active-1});
 const second=h.ui.install();for(const job of h.saves.slice(1))job.resolve('DAT');await second;
 assert.equal(h.saves.length,1,'stale available enabled a second recovery/install');
 assert.equal(h.packets.filter(p=>p.kind==='update-install').length,1);assert.equal(h.ui.locked,true);
});
test('Dewey duplicate clicks without stale packets capture/install once and keep Escape locked',async()=>{
 const h=harness(),first=h.ui.install();await h.ui.install();let prevented=false;
 h.e.updateDialog.cancel({preventDefault(){prevented=true;}});h.ui.close();
 assert.equal(prevented,true);assert.equal(h.e.updateDialog.open,true);assert.equal(h.saves.length,1);
 h.saves[0].resolve(null);await first;assert.equal(h.packets.filter(p=>p.kind==='update-install').length,1);assert.equal(h.packets.at(-1).session,null);
});
test('Dewey matching progress/error remains accepted while locked and snapshot failure never posts install',async()=>{
 const h=harness(),first=h.ui.install();h.saves[0].resolve('DAT');await first;
 h.send('downloading',{percent:61});assert.equal(h.e.updateProgress.value,61);assert.equal(h.ui.locked,true);
 h.send('error',{message:'download failed'});assert.equal(h.e.updateClose.disabled,false);assert.equal(h.ui.locked,false);
 h.ui.close();h.ui.open();h.send('available');const failed=h.ui.install();h.saves.at(-1).reject(Error('encode failed'));await failed;
 assert.equal(h.packets.filter(p=>p.kind==='update-install').length,1);assert.match(h.e.updateStatus.textContent,/encode failed/);assert.equal(h.e.updateClose.disabled,false);
});
test('Dewey every locked phase rejects nonmatching IDs while the current error unlocks',async()=>{
 for(const phase of ['saving','downloading','installing']){
  const h=harness(),installing=h.ui.install(),id=h.ui.sequence;
  h.send(phase,{percent:42});
  const observed=[];
  for(const requestId of [id-1,id+1,String(id),null,undefined,NaN]){
   for(const state of ['available','error','current','checking']){
    h.send(state,{requestId,message:'not this request'});
    observed.push({phase,requestId:String(requestId),state:h.e.updateStatus.dataset.state,locked:h.ui.locked,closeDisabled:h.e.updateClose.disabled});
    h.send(phase,{percent:42});
   }
  }
  h.send(phase,{percent:73});
  assert.equal(h.e.updateProgress.value,73,'current progress remains accepted');
  h.send('error',{message:'current failure'});
  assert.equal(h.ui.locked,false);assert.equal(h.e.updateClose.disabled,false);assert.match(h.e.updateStatus.textContent,/current failure/);
  h.saves[0].resolve('DAT');await installing;
  assert.ok(observed.every(x=>x.state===phase&&x.locked&&x.closeDisabled),JSON.stringify(observed));
 }
});
test('Dewey install owns a fresh captured ID; current save error cancels later install',async()=>{
 const h=harness(),checkId=h.ui.sequence,installing=h.ui.install(),installId=h.ui.sequence;
 h.send('available',{requestId:checkId});
 assert.notEqual(installId,checkId);assert.equal(h.e.updateStatus.dataset.state,'saving');assert.equal(h.ui.locked,true);
 h.send('error',{requestId:installId,message:'cancel this save'});
 h.saves[0].resolve('DAT');await installing;
 assert.equal(h.packets.filter(p=>p.kind==='update-install').length,0,'cancelled recovery must not start update');
 assert.equal(h.e.updateStatus.dataset.state,'error');assert.equal(h.ui.locked,false);
 h.ui.close();h.ui.open();h.send('available');const retry=h.ui.install(),retryId=h.ui.sequence;
 h.saves.at(-1).resolve('DAT');await retry;
 assert.equal(h.packets.at(-1).requestId,retryId);assert.equal(h.packets.at(-1).session,'DAT');
});
