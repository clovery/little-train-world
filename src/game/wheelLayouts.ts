import type { TrainId } from '../data/catalog';

export interface WheelSpec {
  x: number;
  y: number;
  radius: number;
  texture?: 'wheel-0' | 'wheel-1' | 'wheel-2';
}

const fromPixels = (
  width: number,
  height: number,
  wheels: ReadonlyArray<readonly [x: number, y: number, radius: number, texture?: WheelSpec['texture']]>,
): WheelSpec[] => wheels.map(([x,y,radius,texture])=>({x:x/width,y:y/height,radius:radius/width,texture}));

/** Wheel centres measured from the transparent source illustrations. */
export const wheelLayouts: Record<TrainId, WheelSpec[]> = {
  steam: fromPixels(1421,271,[
    [98,247,18],[208,247,18],[582,247,18],[695,247,18],
    [878,237,21],[979,224,43,'wheel-0'],[1085,224,43,'wheel-1'],[1189,227,40,'wheel-2'],[1336,235,21],
  ]),
  express: fromPixels(1443,187,[
    [75,168,14],[174,168,14],[489,168,14],[591,168,14],
    [738,168,14],[842,168,14],[1190,168,14],[1292,168,14],
  ]),
  freight: fromPixels(1450,210,[
    [72,185,18],[150,185,18],[287,185,18],[363,185,18],
    [469,185,18],[536,185,18],[684,185,18],[758,185,18],
    [890,186,15],[955,186,15],[1021,186,15],[1207,186,15],[1271,186,15],[1342,186,15],
  ]),
  metro: fromPixels(973,180,[
    [68,164,13],[146,164,13],[325,164,13],[400,164,13],
    [503,164,13],[570,164,13],[814,164,13],[880,164,13],
  ]),
  tram: fromPixels(971,247,[
    [133,229,15],[271,229,15],[683,229,15],[823,229,15],
  ]),
  sleeper: fromPixels(995,191,[
    [74,172,15],[149,172,15],[408,172,15],[485,172,15],
    [608,172,15],[688,172,15],[827,172,15],[907,172,15],
  ]),
  mountain: fromPixels(989,177,[
    [73,160,13],[139,160,13],[348,160,13],[413,160,13],
    [493,160,13],[561,160,13],[813,160,13],[878,160,13],
  ]),
  classic: fromPixels(990,187,[
    [63,170,14],[133,170,14],[371,170,14],[447,170,14],
    [542,170,14],[617,170,14],[820,170,14],[899,170,14],
  ]),
  maintenance: fromPixels(986,222,[
    [84,202,16],[157,202,16],[467,202,16],[529,202,16],
    [665,202,16],[733,202,16],[865,202,16],[933,202,16],
  ]),
};
