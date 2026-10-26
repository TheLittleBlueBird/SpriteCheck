// Synthetic geometric QA sheet. No artist pixels or source images are used.
import {writeFile} from 'node:fs/promises';
import {encodePNG} from '../png.mjs';
const rows=[[0,1,2,3,4,5,6,7,8,9,10,11],[12,13,14,15,16,17,18,19,20,21,22,23],[24,25,26,27,28,29,30,31],[32,33,34,35,36,37,38,39],[40,41,42,43,44],[45,46,47,48,49],[50,51,52,53,54,55,56,57,58,59,60,61],[62,51,52,53,54,55,56,57,58,59,60,61],[63,64,65,66,67,68,68,69],[70,71,72,73,74,75,75,75],[76,77,78,78,79,79,80,80,80,81,82,83,84],[85,86,86,87,88,89,90,91,92,93,94,95,95]];
const image={width:1365,height:1380,data:new Uint8ClampedArray(1365*1380*4)};
for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){const id=rows[r][c];for(let y=0;y<66;y++)for(let x=0;x<52;x++){if(x<3||y<3||x>=49||y>=63||((x>>3)+(y>>3)+id)%4===0)continue;const px=c*105+26+x,py=r*115+25+y,i=(py*image.width+px)*4;image.data.set([45+(id*47)%200,50+(id*71)%190,55+(id*23)%180,255],i);}}
await writeFile(new URL('../assets/test-sheet.png',import.meta.url),await encodePNG(image));
