import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute } from '../src/game/route.ts';
import { getTunnelSegmentAt, sampleTrack, sampleTrackFollower, visibleTunnelSegments } from '../src/game/trackPath.ts';

test('track sample exposes a continuous point and tangent angle', () => {
  const route = createRoute(['countryside', 'snow', 'forest']);
  const flat = sampleTrack(route, 10);
  const climb = sampleTrack(route, 700);
  const scenicBend = sampleTrack(route, 300);

  assert.equal(flat.x, 10);
  assert.ok(Math.abs(flat.y - 500) < 0.1);
  assert.equal(flat.index, 0);
  assert.notEqual(Math.round(scenicBend.y), Math.round(flat.y), 'local track curves should add visible shape');
  assert.ok(climb.angle < 0, 'snow approach should tilt upward on screen');
  assert.ok(Number.isFinite(climb.curvature));
});

test('track follower samples behind the head without moving before route start', () => {
  const route = createRoute(['countryside', 'forest']);
  const head = sampleTrack(route, 80);
  const follower = sampleTrackFollower(route, 80, 140);

  assert.equal(follower.x, 0);
  assert.equal(follower.index, 0);
  assert.ok(follower.y >= head.y && follower.y <= 500);
});

test('mountain and forest chunks expose tunnel spans to the scene', () => {
  const route = createRoute(['countryside', 'snow', 'forest', 'forest']);
  const tunnels = visibleTunnelSegments(route, 0, 5000);
  const snowTunnel = tunnels.find(segment => segment.biome === 'snow');
  const forestTunnel = tunnels.find(segment => segment.biome === 'forest');

  assert.ok(snowTunnel);
  assert.ok(forestTunnel);
  assert.equal(getTunnelSegmentAt(route, 200), undefined);
  assert.equal(sampleTrack(route, snowTunnel.peak).inTunnel, true);
});
