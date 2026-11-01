export const ETS2_MAP_INFO = {
  x1: -67572.39,
  x2: 85786.14,
  y1: -64903.6953,
  y2: 88454.8359,
  minZoom: 0,
  maxZoom: 6,
} as const;

const TILE_SIZE = 256;
const MAP_UNITS = TILE_SIZE;

export const ETS2_MAP_BOUNDS: [[number, number], [number, number]] = [
  [-MAP_UNITS, 0],
  [0, MAP_UNITS],
];

export const ETS2_MAP_CENTER: [number, number] = [-MAP_UNITS / 2, MAP_UNITS / 2];

export function simToMapPoint(x: number, z: number): [number, number] {
  const nx = (x - ETS2_MAP_INFO.x1) / (ETS2_MAP_INFO.x2 - ETS2_MAP_INFO.x1);
  const ny = (z - ETS2_MAP_INFO.y1) / (ETS2_MAP_INFO.y2 - ETS2_MAP_INFO.y1);

  // Game X runs east and Z runs south, the same as the tiles. L.CRS.Simple draws
  // pixel y as -lat, so the top edge of the map is lat 0 and south is negative.
  return [-ny * MAP_UNITS, nx * MAP_UNITS];
}
