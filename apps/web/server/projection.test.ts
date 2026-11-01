import { describe, expect, test } from 'bun:test';
import { ETS2_MAP_BOUNDS, ETS2_MAP_INFO, simToMapPoint } from '../src/lib/projection';

describe('simToMapPoint', () => {
  test('maps the tile corners onto the Leaflet bounds', () => {
    const { x1, x2, y1, y2 } = ETS2_MAP_INFO;
    const [[south, west], [north, east]] = ETS2_MAP_BOUNDS;

    const [topLat, leftLng] = simToMapPoint(x1, y1);
    const [bottomLat, rightLng] = simToMapPoint(x2, y2);

    expect(topLat).toBeCloseTo(north);
    expect(leftLng).toBeCloseTo(west);
    expect(bottomLat).toBeCloseTo(south);
    expect(rightLng).toBeCloseTo(east);
  });

  test('keeps game east and south as map east and south', () => {
    const london = simToMapPoint(-40197, -12259);
    const berlin = simToMapPoint(8898, -11127);
    const aberdeen = simToMapPoint(-39597, -56040);

    expect(berlin[1]).toBeGreaterThan(london[1]);
    expect(aberdeen[0]).toBeGreaterThan(london[0]);
  });

  test('puts a truck parked at a Geneva depot on the Geneva tiles', () => {
    // Telemetry recovered from a side-by-side of the dashboard and the in-game map.
    const [lat, lng] = simToMapPoint(-18542, 24014);

    expect(lat).toBeCloseTo(-148.43, 1);
    expect(lng).toBeCloseTo(81.85, 1);
  });
});
