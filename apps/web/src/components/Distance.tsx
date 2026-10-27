import { formatDistance, useUnits } from "../lib/units";

// Small client wrapper so a server component can render a km value that will
// be reformatted client-side once the user's units preference is hydrated.
export function Distance({
  km,
  precision = 0,
}: {
  km: number | null | undefined;
  precision?: number;
}) {
  const { units } = useUnits();
  return <>{formatDistance(km, units, precision)}</>;
}
