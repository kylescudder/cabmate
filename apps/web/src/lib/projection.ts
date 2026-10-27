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
  // Live SCS telemetry uses the opposite X direction from the exported tile map.
  const mapX = -x;
  const nx = (mapX - ETS2_MAP_INFO.x1) / (ETS2_MAP_INFO.x2 - ETS2_MAP_INFO.x1);
  const ny = (z - ETS2_MAP_INFO.y1) / (ETS2_MAP_INFO.y2 - ETS2_MAP_INFO.y1);

  return [(ny - 1) * MAP_UNITS, nx * MAP_UNITS];
}
