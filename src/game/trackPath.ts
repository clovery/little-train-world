import { CHUNK_LENGTH, sampleTerrain, type RouteChunk } from './route.ts';

export interface TrackSample {
  x: number;
  y: number;
  angle: number;
  slope: number;
  curvature: number;
  index: number;
  inTunnel: boolean;
}

export interface TunnelSegment {
  start: number;
  end: number;
  peak: number;
  biome: string;
}

const DERIVATIVE_STEP = 10;
const TUNNEL_START = 0.38;
const TUNNEL_END = 0.68;

const chunkAt = (chunks: readonly RouteChunk[], distance: number): RouteChunk => {
  const index = Math.max(0, Math.min(chunks.length - 1, Math.floor(distance / CHUNK_LENGTH)));
  return chunks[index];
};

const biomeAmplitude = (biome: string, index: number): number => {
  if (biome === 'snow') return -34;
  if (biome === 'forest') return index % 2 === 0 ? -18 : 16;
  if (biome === 'coast') return 14;
  if (biome === 'desert') return -10;
  return index % 2 === 0 ? 8 : -8;
};

const localTrackOffset = (chunk: RouteChunk, distance: number): number => {
  const t = Math.max(0, Math.min(1, (distance - chunk.start) / CHUNK_LENGTH));
  const seamSafe = Math.sin(Math.PI * t) ** 2;
  const longBend = Math.sin(Math.PI * 2 * t) * biomeAmplitude(chunk.biome, chunk.index);
  const railJoint = Math.sin(Math.PI * 4 * t + chunk.index * 0.7) * 4;
  const tunnelLift = tunnelSegmentForChunk(chunk)
    ? -22 * Math.sin(Math.PI * Math.max(0, Math.min(1, (t - TUNNEL_START) / (TUNNEL_END - TUNNEL_START)))) ** 2
    : 0;
  return seamSafe * (longBend + railJoint) + tunnelLift;
};

const trackHeightAt = (chunks: readonly RouteChunk[], distance: number): number => {
  const terrain = sampleTerrain(chunks, distance);
  return terrain.height + localTrackOffset(chunkAt(chunks, distance), distance);
};

export function tunnelSegmentForChunk(chunk: RouteChunk): TunnelSegment | undefined {
  if (chunk.biome !== 'snow' && !(chunk.biome === 'forest' && chunk.index % 2 === 1)) return undefined;
  return {
    start: chunk.start + CHUNK_LENGTH * TUNNEL_START,
    end: chunk.start + CHUNK_LENGTH * TUNNEL_END,
    peak: chunk.start + CHUNK_LENGTH * 0.53,
    biome: chunk.biome,
  };
}

export function visibleTunnelSegments(chunks: readonly RouteChunk[], cameraX: number, viewportWorldWidth: number): TunnelSegment[] {
  return chunks
    .map(tunnelSegmentForChunk)
    .filter((segment): segment is TunnelSegment => Boolean(segment))
    .filter(segment => segment.end >= cameraX && segment.start <= cameraX + viewportWorldWidth);
}

export function getTunnelSegmentAt(chunks: readonly RouteChunk[], distance: number): TunnelSegment | undefined {
  return visibleTunnelSegments(chunks, distance - 1, 2).find(segment => distance >= segment.start && distance <= segment.end);
}

/**
 * The current route is still authored as terrain chunks, but train rendering
 * talks to this path sampler so the backing path can later become Tiled data.
 */
export function sampleTrack(chunks: readonly RouteChunk[], distance: number): TrackSample {
  const center = sampleTerrain(chunks, distance);
  const height = trackHeightAt(chunks, distance);
  const before = trackHeightAt(chunks, distance - DERIVATIVE_STEP);
  const after = trackHeightAt(chunks, distance + DERIVATIVE_STEP);
  const dy = after - before;
  const angle = Math.atan2(dy, DERIVATIVE_STEP * 2);
  return {
    x: distance,
    y: 500 + height,
    angle,
    slope: center.slope,
    curvature: (after - height * 2 + before) / (DERIVATIVE_STEP ** 2),
    index: center.index,
    inTunnel: Boolean(getTunnelSegmentAt(chunks, distance)),
  };
}

export function sampleTrackFollower(
  chunks: readonly RouteChunk[],
  headDistance: number,
  followDistance: number,
): TrackSample {
  return sampleTrack(chunks, Math.max(0, headDistance - Math.max(0, followDistance)));
}
