// Visible, registered pixels only. Transparent padding cannot inflate the score.
export function similarityLabel(score){return score===100?'100%':score>99.99?'>99.99%':`${score.toFixed(2)}%`;}
export function visibleDifference(a,b){let changed=0,visible=0;for(let i=0;i<a.length;i+=4){if(!a[i+3]&&!b[i+3])continue;visible++;if(a[i+3]!==b[i+3]||[0,1,2].some(c=>Math.round(a[i+c]*a[i+3]/255)!==Math.round(b[i+c]*b[i+3]/255)))changed++;}return {changed,visible};}
function descriptor(frame,w,h){
 const bins=new Float64Array(8*8*4);let visible=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,a=frame.data[i+3];if(!a)continue;visible++;const at=(Math.min(7,Math.floor(y*8/h))*8+Math.min(7,Math.floor(x*8/w)))*4;for(let c=0;c<3;c++)bins[at+c]+=Math.round(frame.data[i+c]*a/255);bins[at+3]+=a;}
 return {bins,visible};
}
export function visibleSimilarity(a,b,{threshold=0}={}){
 if(a.length!==b.length)throw Error('Frame dimensions differ.');
 let error=0,union=0;const maxError=(a.length/4)*(1-threshold/100)*255;
 for(let i=0;i<a.length;i+=4){const aa=a[i+3],ba=b[i+3];if(!aa&&!ba)continue;union++;let delta=Math.abs(aa-ba);for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(Math.round(a[i+c]*aa/255)-Math.round(b[i+c]*ba/255)));error+=delta;if(error>maxError)return null;}
 const score=union?100*(1-error/(union*255)):100;return score+1e-9>=threshold?Math.max(0,score):null;
}
export async function findSimilarFrames(sheet,animations,{threshold=95,signal,onProgress=()=>{},maxComparisons=200000,maxResults=500,yieldTask=()=>new Promise(r=>setTimeout(r,0))}={}){
 if(!Number.isFinite(threshold)||threshold<50||threshold>100)throw Error('Similarity must be 50–100%.');
 const w=sheet.grid.cellWidth,h=sheet.grid.cellHeight,rows=animations.map(a=>[...new Set(a.keys.map(k=>k.sourceId))]),ids=[...new Set(rows.flat())],descriptors=new Map();
 for(let i=0;i<ids.length;i++){signal?.throwIfAborted();descriptors.set(ids[i],descriptor(sheet.frames[ids[i]],w,h));if(i%8===0)await yieldTask();}
 const total=rows.reduce((n,r)=>n+r.length*(r.length-1)/2,0),pairs=[];let checked=0,compared=0,found=0,limited=false;
 outer:for(const row of rows)for(let i=0;i<row.length;i++)for(let j=i+1;j<row.length;j++){
  signal?.throwIfAborted();checked++;const a=descriptors.get(row[i]),b=descriptors.get(row[j]);let lower=0;
  for(let bin=0;bin<a.bins.length;bin+=4){let delta=0;for(let c=0;c<4;c++)delta=Math.max(delta,Math.abs(a.bins[bin+c]-b.bins[bin+c]));lower+=delta;}
  const unionMax=Math.min(w*h,a.visible+b.visible);
  if(!unionMax||lower<=(1-threshold/100)*unionMax*255+1e-7){
   if(compared>=maxComparisons){limited=true;break outer;}compared++;
   const score=visibleSimilarity(sheet.frames[row[i]].data,sheet.frames[row[j]].data,{threshold});
   if(score!=null){found++;pairs.push({a:row[i],b:row[j],row:sheet.frames[row[i]].row,score});if(pairs.length>maxResults*2){pairs.sort((x,y)=>y.score-x.score||x.a-y.a||x.b-y.b);pairs.length=maxResults;}}
  }
  if(checked%64===0){onProgress(checked,total);await yieldTask();}
 }
 pairs.sort((a,b)=>b.score-a.score||a.a-b.a||a.b-b.b);pairs.length=Math.min(pairs.length,maxResults);onProgress(checked,total);
 return {pairs,threshold,checked,total,compared,found,limited};
}
export function replaceSourceKeys(animations,sheet,from,to){
 const a=sheet.frames[from],b=sheet.frames[to];if(!a||!b||a.row!==b.row)throw Error('Use source frames in the same animation row.');
 if(from===to)return 0;let replaced=0;for(const key of animations[a.row].keys)if(key.sourceId===from){key.sourceId=to;replaced++;}return replaced;
}
