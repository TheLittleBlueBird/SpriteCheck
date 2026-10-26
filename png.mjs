// Lossless PNG codec. Reads raw samples without Canvas premultiplication.
const signature = new Uint8Array([137,80,78,71,13,10,26,10]);
const concat = arrays => { const out = new Uint8Array(arrays.reduce((n,a)=>n+a.length,0)); let p=0; for(const a of arrays){out.set(a,p);p+=a.length;} return out; };
const u32 = n => { const a=new Uint8Array(4); new DataView(a.buffer).setUint32(0,n); return a; };
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(name,data){const type=new TextEncoder().encode(name);return concat([u32(data.length),type,data,u32(crc(concat([type,data])))]);}
async function transform(bytes,Kind){const stream=new Blob([bytes]).stream().pipeThrough(new Kind('deflate'));return new Uint8Array(await new Response(stream).arrayBuffer());}
const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
export async function decodePNG(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<33||!signature.every((x,i)=>bytes[i]===x))throw new Error('Please choose a valid PNG sprite sheet.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=8,width,height,depth,color,palette,transparency,ended=false;const idats=[];
 while(p+12<=bytes.length){const n=view.getUint32(p);if(n>bytes.length-p-12)throw new Error('Truncated PNG chunk.');const type=new TextDecoder().decode(bytes.subarray(p+4,p+8));const data=bytes.subarray(p+8,p+8+n);if(crc(bytes.subarray(p+4,p+8+n))!==view.getUint32(p+8+n))throw new Error('PNG checksum failed.');
 if(type==='IHDR'){width=view.getUint32(p+8);height=view.getUint32(p+12);depth=data[8];color=data[9];if(!width||!height||width*height>16777216)throw new Error('PNG must contain at most 16 megapixels.');if(data[10]||data[11]||data[12])throw new Error('Please export an 8-bit, non-interlaced PNG from your art app.');}
 if(type==='PLTE')palette=data.slice();if(type==='tRNS')transparency=data.slice();if(type==='IDAT')idats.push(data);if(type==='IEND'){ended=true;break;}p+=12+n;}
 if(!ended||!idats.length||!width)throw new Error('Incomplete PNG.');
 const channels={0:1,2:3,3:1,4:2,6:4}[color];if(!channels||!(depth===8||(color===3&&[1,2,4].includes(depth))))throw new Error('Supported PNG: RGB, RGBA, grayscale 8-bit, or indexed palette. Export 16-bit artwork as 8-bit first.');
 const stride=Math.ceil(width*channels*depth/8),bpp=Math.max(1,Math.ceil(channels*depth/8));const raw=await transform(concat(idats),DecompressionStream);if(raw.length!==(stride+1)*height)throw new Error('PNG scanline size is invalid.');const samples=new Uint8Array(stride*height);
 for(let y=0;y<height;y++){const f=raw[y*(stride+1)];if(f>4)throw new Error('Invalid PNG filter.');for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=bpp?samples[i-bpp]:0,b=y?samples[i-stride]:0,c=y&&x>=bpp?samples[i-stride-bpp]:0;const v=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c);samples[i]=(raw[y*(stride+1)+1+x]+v)&255;}}
 const rgba=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const dest=(y*width+x)*4,s=y*stride+x*channels;if(color===6)rgba.set(samples.subarray(s,s+4),dest);else if(color===2){rgba.set(samples.subarray(s,s+3),dest);rgba[dest+3]=transparency&&samples[s]===transparency[1]&&samples[s+1]===transparency[3]&&samples[s+2]===transparency[5]?0:255;}else if(color===3){if(!palette)throw new Error('Missing PNG palette.');const bit=x*depth,index=(samples[y*stride+(bit>>3)]>>(8-depth-(bit%8)))&((1<<depth)-1);if(index*3+2>=palette.length)throw new Error('Invalid palette index.');rgba.set(palette.subarray(index*3,index*3+3),dest);rgba[dest+3]=transparency&&index<transparency.length?transparency[index]:255;}else{rgba[dest]=rgba[dest+1]=rgba[dest+2]=samples[s];rgba[dest+3]=color===4?samples[s+1]:(transparency&&samples[s]===transparency[1]?0:255);}}
 return {width,height,data:rgba};
}
export async function encodePNG({width,height,data}){
 if(data.length!==width*height*4)throw new Error('RGBA buffer does not match export size.');
 const stride=width*4,raw=new Uint8Array((stride+1)*height);let previous=new Uint8Array(stride);
 for(let y=0;y<height;y++){const row=data.subarray(y*stride,(y+1)*stride);let best,score=Infinity,filter=0;for(let f=0;f<=4;f++){const candidate=new Uint8Array(stride);let sum=0;for(let x=0;x<stride;x++){const a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0,v=f===0?0:f===1?a:f===2?b:f===3?Math.floor((a+b)/2):paeth(a,b,c);const delta=(row[x]-v)&255;candidate[x]=delta;sum+=Math.min(delta,256-delta);}if(sum<score){score=sum;best=candidate;filter=f;}}raw[y*(stride+1)]=filter;raw.set(best,y*(stride+1)+1);previous=row;}
 const ihdr=new Uint8Array(13);ihdr.set(u32(width),0);ihdr.set(u32(height),4);ihdr.set([8,6,0,0,0],8);return concat([signature,chunk('IHDR',ihdr),chunk('IDAT',await transform(raw,CompressionStream)),chunk('IEND',new Uint8Array())]);
}
