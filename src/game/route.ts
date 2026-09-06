/** Logical world units; adjacent chunks share the same height at each boundary. */
export const CHUNK_LENGTH = 1200;
export const OVERLAP = 140;
export interface RouteChunk { biome: string; index: number; start: number; end: number; startHeight: number; endHeight: number; }
export function createRoute(stops: readonly string[]): RouteChunk[] {
  if (!stops.length) throw new Error('A route must have at least one stop');
  const heights = stops.map((biome, index) => {
    if (index === 0) return 0;
    if (biome === 'snow') return -36;
    if (biome === 'forest') return index % 2 === 0 ? -18 : -28;
    if (biome === 'desert') return -12;
    return 0;
  });
  heights.push(0);
  return stops.map((biome,index)=>({biome,index,start:index*CHUNK_LENGTH,end:(index+1)*CHUNK_LENGTH,startHeight:heights[index],endHeight:heights[index+1]}));
}
export function sampleTerrain(chunks: readonly RouteChunk[], distance: number): {height:number;slope:number;index:number} {
  const index=Math.max(0,Math.min(chunks.length-1,Math.floor(distance/CHUNK_LENGTH)));
  const c=chunks[index];
  const t=Math.max(0,Math.min(1,(distance-c.start)/CHUNK_LENGTH));
  const smooth=t*t*(3-2*t);
  return {height:c.startHeight+(c.endHeight-c.startHeight)*smooth,slope:(c.endHeight-c.startHeight)*6*t*(1-t)/CHUNK_LENGTH,index};
}
export function visibleChunks(chunks: readonly RouteChunk[], cameraX:number, viewportWorldWidth:number): RouteChunk[] {
  return chunks.filter(c=>c.end+OVERLAP>=cameraX && c.start-OVERLAP<=cameraX+viewportWorldWidth);
}
