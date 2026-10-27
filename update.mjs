export const APP_VERSION='1.7.1';
export const REPOSITORY='TheLittleBlueBird/SpriteCheck';
export const RELEASES_URL=`https://github.com/${REPOSITORY}/releases`;
export const API_URL=`https://api.github.com/repos/${REPOSITORY}/releases/latest`;
export function compareVersions(a,b){
 const parse=v=>{const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(v);if(!m||m[0]!==v||m.slice(1).some(n=>Number(n)>2147483647))throw Error('Invalid release version.');return m.slice(1).map(Number);};
 const x=parse(a),y=parse(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;
}
export function releaseInfo(release,current=APP_VERSION){
 if(!release||release.draft||release.prerelease||!release.published_at)throw Error('No published stable release is available.');
 compareVersions(release.tag_name,current);
 const version=release.tag_name.replace(/^v/,''),name=`SpriteCheck-${version}-win-x64.zip`;
 const asset=release.assets?.find(a=>a.name===name&&a.state==='uploaded');
 const url=`${RELEASES_URL}/download/${release.tag_name}/${name}`;
 if(!asset||asset.browser_download_url!==url||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>128*1024*1024)throw Error('This release has no compatible Windows package.');
 return {state:compareVersions(version,current)>0?'available':'current',version,notes:String(release.body??'').slice(0,12000),url:`${RELEASES_URL}/tag/${release.tag_name}`,bytes:asset.size};
}
export class UpdateDialog{
 constructor({document,desktop,post,saveSession,pause,fetchRelease}){
  this.d=document;this.desktop=desktop;this.post=post;this.saveSession=saveSession;this.pause=pause;this.fetchRelease=fetchRelease;this.sequence=0;this.info=null;this.locked=false;
  const $=id=>document.getElementById(id);this.$=$;
  $('updateCurrent').textContent=desktop?.version??APP_VERSION;
  $('updateClose').onclick=()=>this.close();$('updateCheck').onclick=()=>this.check();$('updateInstall').onclick=()=>this.install();
  $('updateRelease').onclick=()=>{if(desktop)post({kind:'update-open-release'});else document.defaultView.open(RELEASES_URL,'_blank','noopener,noreferrer');};
  $('updateDialog').addEventListener('cancel',e=>{if(this.locked)e.preventDefault();else this.sequence++;});
 }
 open(){if(!this.$('updateDialog').open)this.$('updateDialog').showModal();if(!this.locked)this.check();}
 close(){if(this.locked)return;this.sequence++;this.$('updateDialog').close();}
 state(value){
  const $=this.$;this.info=value;this.locked=['saving','downloading','installing'].includes(value.state);
  $('updateStatus').textContent=value.message??({checking:'กำลังตรวจสอบเวอร์ชันจาก GitHub…',current:'คุณกำลังใช้เวอร์ชันล่าสุดแล้ว',available:'มีเวอร์ชันใหม่ พร้อมอัปเดต',saving:'กำลังเก็บงานปัจจุบันก่อนอัปเดต…',downloading:'กำลังดาวน์โหลดและตรวจสอบแพตช์…',installing:'กำลังติดตั้ง โปรแกรมจะเปิดใหม่อัตโนมัติ',error:'ตรวจสอบการอัปเดตไม่สำเร็จ'}[value.state]??'');
  $('updateStatus').dataset.state=value.state;$('updateLatest').textContent=value.version??'—';
  $('updateNotes').textContent=value.notes??'';$('updateNotes').hidden=!value.notes;
  $('updateProgress').hidden=!this.locked;$('updateProgress').value=value.percent??0;
  $('updateClose').disabled=this.locked;$('updateCheck').disabled=this.locked||value.state==='checking';
  $('updateInstall').hidden=value.state!=='available';$('updateInstall').disabled=this.locked;
  $('updateInstall').textContent=this.desktop?'UPDATE & RESTART':'DOWNLOAD FOR WINDOWS';
 }
 async check(){
  if(this.locked)return;const requestId=++this.sequence;this.state({state:'checking'});
  if(this.desktop){this.post({kind:'update-check',requestId});return;}
  try{const info=await this.fetchRelease();if(requestId===this.sequence)this.state(releaseInfo(info));}
  catch(error){if(requestId===this.sequence)this.state({state:'error',message:error.message});}
 }
 receive(packet){if(packet.kind==='update-state'&&packet.requestId===this.sequence)this.state(packet);}
 async install(){
  if(this.info?.state!=='available'||this.locked)return;
  if(!this.desktop){this.d.defaultView.open(this.info.url,'_blank','noopener,noreferrer');return;}
  const version=this.info.version,requestId=++this.sequence;this.state({state:'saving',version});this.pause();
  try{const session=await this.saveSession();if(requestId!==this.sequence||this.info.state!=='saving')return;this.post({kind:'update-install',requestId,session});this.state({state:'downloading',version});}
  catch(error){if(requestId===this.sequence)this.state({state:'error',message:`เก็บงานไม่สำเร็จ จึงยังไม่อัปเดต: ${error.message}`});}
 }
}
