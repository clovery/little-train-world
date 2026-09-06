import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute, sampleTerrain, visibleChunks, CHUNK_LENGTH, OVERLAP } from '../src/game/route.ts';

test('adjacent chunks have no horizontal gap and matching height/slope at the seam',()=>{
  const chunks=createRoute(['countryside','forest','snow','coast','desert','countryside']);
  for(let i=1;i<chunks.length;i++){
    assert.equal(chunks[i-1].end,chunks[i].start);
    assert.equal(chunks[i-1].endHeight,chunks[i].startHeight);
    const left=sampleTerrain(chunks,chunks[i].start-.001);
    const right=sampleTerrain(chunks,chunks[i].start+.001);
    assert.ok(Math.abs(left.height-right.height)<.001);
    assert.ok(Math.abs(left.slope-right.slope)<.0001);
  }
});

test('visible chunk pool covers the viewport and keeps blend overlaps',()=>{
  const chunks=createRoute(Array.from({length:100},(_,i)=>i%2?'snow':'forest'));
  for(let camera=0;camera<9000;camera+=79){
    const visible=visibleChunks(chunks,camera,1800);
    assert.ok(visible.length<=4);
    assert.ok(visible[0].start<=camera);
    assert.ok(visible.at(-1)!.end+OVERLAP>=camera+1800);
  }
  const seam=visibleChunks(chunks,CHUNK_LENGTH+OVERLAP-1,400);
  assert.equal(seam[0].index,0,'previous chunk retained until crossfade completes');
});

test('height sampling clamps safely at route ends, including a short route',()=>{
  const chunks=createRoute(['countryside','snow']);
  assert.equal(sampleTerrain(chunks,-500).height,0);
  assert.equal(sampleTerrain(chunks,100000).height,0);
  assert.equal(sampleTerrain(chunks,100000).index,1);
  assert.throws(()=>createRoute([]));
});
