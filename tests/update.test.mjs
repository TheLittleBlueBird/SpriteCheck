import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {APP_VERSION,REPOSITORY,releaseInfo,compareVersions,UpdateDialog} from '../update.mjs';
const NEXT=APP_VERSION.split('.').map((v,i)=>i===2?Number(v)+1:v).join('.');
const release=(version=NEXT)=>({tag_name:`v${version}`,published_at:'2026-10-26T00:00:00Z',draft:false,prerelease:false,body:'Fixes <script>remain plain text</script>',assets:[{name:`SpriteCheck-${version}-win-x64.zip`,state:'uploaded',size:123, browser_download_url:`https://github.com/${REPOSITORY}/releases/download/v${version}/SpriteCheck-${version}-win-x64.zip`}]});
test('Update compares numeric version segments, excludes downgrades and invalid versions',()=>{
 assert.equal(compareVersions('v1.10.0','1.9.9'),1);assert.equal(compareVersions('1.6.0','1.6.0'),0);assert.equal(compareVersions('1.5.0','1.6.0'),-1);
 for(const value of ['1.6.0-beta','1.6','01.6.0','1.6.0.1','1.999999999999999999.0','1.6.0\n'])assert.throws(()=>compareVersions(value,APP_VERSION));
 assert.equal(releaseInfo(release('1.5.0')).state,'current');assert.equal(releaseInfo(release(APP_VERSION)).state,'current');assert.equal(releaseInfo(release()).state,'available');
});
test('Update accepts only a published stable Windows package from this repository',()=>{
 for(const mutate of [r=>r.draft=true,r=>r.prerelease=true,r=>r.published_at=null,r=>r.assets=[],r=>r.assets[0].state='new',r=>r.assets[0].size=0,r=>r.assets[0].size=129*1024*1024,r=>r.assets[0].browser_download_url='https://other.example/payload.zip']){const r=release();mutate(r);assert.throws(()=>releaseInfo(r));}
 assert.match(releaseInfo(release()).notes,/<script>/);
});
function harness(desktop=true){
 const ids=['updateCurrent','updateClose','updateCheck','updateInstall','updateRelease','updateDialog','updateStatus','updateLatest','updateNotes','updateProgress'];
 const elements=Object.fromEntries(ids.map(id=>[id,{textContent:'',hidden:false,disabled:false,dataset:{},open:false,addEventListener(type,handler){this[type]=handler;},showModal(){this.open=true;},close(){this.open=false;}}]));
 const packets=[],windows=[];let saved=0,paused=0,resolver;
 const d={getElementById:id=>elements[id],defaultView:{open:(...a)=>windows.push(a)}};
 const ui=new UpdateDialog({document:d,desktop:desktop?{version:APP_VERSION}:null,post:p=>packets.push(p),pause:()=>paused++,saveSession:async()=>{saved++;return 'snapshot';},fetchRelease:()=>new Promise(resolve=>resolver=resolve)});
 return{ui,e:elements,packets,windows,resolve:r=>resolver(r),get saved(){return saved;},get paused(){return paused;}};
}
test('Native check matches request IDs and ignores results from dismissed dialogs',()=>{
 const h=harness();h.ui.open();assert.equal(h.packets[0].kind,'update-check');assert.equal(h.e.updateCurrent.textContent,APP_VERSION);
 h.ui.close();h.ui.receive({kind:'update-state',requestId:1,state:'available',version:NEXT});assert.equal(h.e.updateInstall.hidden,true);
 h.ui.open();h.ui.receive({kind:'update-state',requestId:h.ui.sequence,state:'available',version:NEXT});assert.equal(h.e.updateInstall.hidden,false);
});
test('Install captures project before request, pauses and locks closure during installation',async()=>{
 const h=harness();h.ui.open();h.ui.receive({kind:'update-state',requestId:h.ui.sequence,state:'available',version:NEXT});
 const installing=h.ui.install();assert.equal(h.paused,1);assert.equal(h.e.updateClose.disabled,true);h.ui.close();assert.equal(h.e.updateDialog.open,true);await installing;
 assert.equal(h.saved,1);assert.equal(h.packets.at(-1).session,'snapshot');assert.equal(h.packets.at(-1).kind,'update-install');assert.equal(h.e.updateInstall.hidden,true);
 await h.ui.install();assert.equal(h.saved,1);h.ui.receive({kind:'update-state',requestId:h.ui.sequence,state:'error',message:'offline'});assert.equal(h.e.updateStatus.textContent,'offline');assert.equal(h.e.updateClose.disabled,false);
});
test('Browser check never submits projects, closing ignores stale fetch and opens releases safely',async()=>{
 const h=harness(false);h.ui.open();h.ui.close();h.resolve(release());await new Promise(r=>setTimeout(r,0));assert.equal(h.e.updateInstall.hidden,true);
 h.ui.open();h.resolve(release());await new Promise(r=>setTimeout(r,0));await h.ui.install();assert.equal(h.saved,0);assert.equal(h.packets.length,0);assert.match(h.windows[0][0],new RegExp(`releases/tag/v${NEXT}$`));assert.equal(h.windows[0][2],'noopener,noreferrer');
});
test('Failed recovery snapshot prevents installation and leaves retry available',async()=>{
 const h=harness();h.ui.open();h.ui.receive({kind:'update-state',requestId:h.ui.sequence,state:'available',version:NEXT});h.ui.saveSession=async()=>{throw Error('encoding failed');};await h.ui.install();
 assert.equal(h.packets.filter(p=>p.kind==='update-install').length,0);assert.equal(h.e.updateClose.disabled,false);assert.match(h.e.updateStatus.textContent,/encoding failed/);
});
test('Release package, native client and update UI have the same version',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.version,APP_VERSION);
 const service=await readFile(new URL('../desktop/UpdateService.cs',import.meta.url),'utf8'),native=await readFile(new URL('../desktop/SpriteCheck.cs',import.meta.url),'utf8'),manifest=await readFile(new URL('../desktop/app.manifest',import.meta.url),'utf8');
 assert.ok(service.includes(`const string Version = "${APP_VERSION}"`));assert.ok(native.includes(`AssemblyFileVersion("${APP_VERSION}.0")`));assert.ok(manifest.includes(`version="${APP_VERSION}.0"`));
});
