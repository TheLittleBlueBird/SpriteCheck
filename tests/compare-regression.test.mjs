import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8');
const body=source.match(/^function togglePlay\(.*$/m)[0];
function harness({seconds=1.5,playing=false,loop=true,tab='compare'}={}){
 const c={project:{},seconds,playing,tab,activeAnimation:()=>({fps:12}),playbackDuration:()=>2/3,
  $:()=>({checked:loop}),drawDynamic(){},toast(){}};
 vm.createContext(c);vm.runInContext(body,c);return c;
}
test('Compare loop resumes elapsed clock after multiple cycles instead of restarting',()=>{
 for(const seconds of [1.5,1.5333,7.1]){
  const h=harness({seconds});h.togglePlay();assert.equal(h.playing,true);assert.equal(h.seconds,seconds);
 }
});
test('Compare nonloop ending still restarts, while an unfinished pause resumes exactly',()=>{
 const ended=harness({loop:false});ended.togglePlay();assert.equal(ended.seconds,0);assert.equal(ended.playing,true);
 const paused=harness({loop:false,seconds:.25});paused.togglePlay();assert.equal(paused.seconds,.25);
});
test('Pausing an elapsed Compare loop does not alter its clock',()=>{
 const h=harness({playing:true});h.togglePlay();assert.equal(h.playing,false);assert.equal(h.seconds,1.5);
});
test('Sheet loop resumes the phase of an elapsed Compare clock',()=>{
 const h=harness({tab:'sheet'});h.togglePlay();assert.ok(Math.abs(h.seconds-(1.5%(2/3)))<1e-10);assert.equal(h.playing,true);
});
