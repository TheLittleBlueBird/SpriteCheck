export const MAX_IMAGE_SIDE=8192;
export const MAX_IMAGE_PIXELS=MAX_IMAGE_SIDE*MAX_IMAGE_SIDE;
export const MAX_GRID_CELLS=4096;
export function assertImageSize(width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_IMAGE_SIDE||height>MAX_IMAGE_SIDE)throw new Error('Sprite sheets must be between 1 and 8192 pixels on each side (up to 8192 × 8192).');
}
// Enlarge only the suggested grid if a new image would exceed the cell limit.
// Source pixels stay intact; the artist can choose a different grid afterward.
export function fitImportGrid(image,grid){
 assertImageSize(image.width,image.height);
 for(const name of ['cellWidth','cellHeight','offsetX','offsetY','gapX','gapY']){const value=grid?.[name]??(name.startsWith('cell')?NaN:0);if(!Number.isInteger(value)||value<(name.startsWith('cell')?1:0))throw new Error('Grid values must be valid whole pixels.');}
 const count=({cellWidth:w,cellHeight:h,offsetX=0,offsetY=0,gapX=0,gapY=0})=>{
  const columns=Math.floor((image.width-offsetX+gapX)/(w+gapX)),rows=Math.floor((image.height-offsetY+gapY)/(h+gapY));
  return columns>0&&rows>0?columns*rows:Infinity;
 };
 if(count(grid)<=MAX_GRID_CELLS)return {...grid};
 const result={cellWidth:Math.min(image.width,grid.cellWidth),cellHeight:Math.min(image.height,grid.cellHeight),offsetX:0,offsetY:0,gapX:0,gapY:0};
 while(count(result)>MAX_GRID_CELLS){result.cellWidth=Math.min(image.width,result.cellWidth*2);result.cellHeight=Math.min(image.height,result.cellHeight*2);}
 return result;
}
