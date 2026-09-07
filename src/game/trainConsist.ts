import type { TrainId } from '../data/catalog';

export interface CoachStyle {
  count: number;
  windowCount: number;
  roof: 'round' | 'flat' | 'low';
  stripe: 'belt' | 'cargo' | 'tram' | 'none';
  textureCrop?: { x: number; y: number; width: number; height: number };
  bodyColor?: string;
  sideColor?: string;
  roofColor?: string;
  stripeColor?: string;
  windowColor?: string;
}

export interface ConsistSpacing {
  firstLag: number;
  coachLag: number;
}

export const coachStyles: Record<TrainId, CoachStyle> = {
  steam: { count: 3, windowCount: 4, roof: 'round', stripe: 'belt', textureCrop: { x: 0, y: 0, width: 780, height: 271 }, bodyColor: '#f0ca47', sideColor: '#fff0b4', roofColor: '#496f80', stripeColor: '#9e382f', windowColor: '#ffe8a8' },
  express: { count: 4, windowCount: 4, roof: 'low', stripe: 'belt', stripeColor: '#466d83' },
  freight: { count: 4, windowCount: 0, roof: 'flat', stripe: 'cargo', sideColor: '#a97a56', stripeColor: '#5d6f55' },
  metro: { count: 3, windowCount: 4, roof: 'low', stripe: 'belt', stripeColor: '#3d817b' },
  tram: { count: 2, windowCount: 3, roof: 'round', stripe: 'tram', stripeColor: '#fff7cf' },
  sleeper: { count: 4, windowCount: 4, roof: 'round', stripe: 'belt', stripeColor: '#445b89' },
  mountain: { count: 3, windowCount: 3, roof: 'flat', stripe: 'belt', stripeColor: '#7f5145' },
  classic: { count: 3, windowCount: 3, roof: 'round', stripe: 'belt', stripeColor: '#55754a' },
  maintenance: { count: 2, windowCount: 1, roof: 'flat', stripe: 'cargo', stripeColor: '#705b28' },
};

export function consistSpacing(trainWidth:number, coachWidth:number, scale:number): ConsistSpacing {
  const connector = Math.max(16, coachWidth * .12);
  return {
    firstLag: (trainWidth / 2 + coachWidth / 2 + connector) / scale,
    coachLag: (coachWidth + connector) / scale,
  };
}
