import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UnitSystem = "metric" | "imperial";

interface UnitsContextValue {
  units: UnitSystem;
  setUnits: (u: UnitSystem) => void;
}

const UnitsCtx = createContext<UnitsContextValue>({
  units: "metric",
  setUnits: () => {},
});

const STORAGE_KEY = "ets2-tracker-units";

export function UnitsProvider({ children }: { children: ReactNode }) {
  // Default to metric until we've hydrated from localStorage — avoids the SSR
  // mismatch that would happen if we synchronously read window on first render.
  const [units, setUnitsState] = useState<UnitSystem>("metric");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "imperial" || stored === "metric") setUnitsState(stored);
  }, []);

  function setUnits(u: UnitSystem) {
    setUnitsState(u);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, u);
    }
  }

  return <UnitsCtx.Provider value={{ units, setUnits }}>{children}</UnitsCtx.Provider>;
}

export function useUnits() {
  return useContext(UnitsCtx);
}

const KM_TO_MI = 0.621371;

export function formatSpeed(kph: number | null | undefined, units: UnitSystem): string {
  if (kph === null || kph === undefined) return "—";
  if (units === "imperial") return `${Math.round(kph * KM_TO_MI)} mph`;
  return `${Math.round(kph)} km/h`;
}

export function formatDistance(
  km: number | null | undefined,
  units: UnitSystem,
  precision = 0,
): string {
  if (km === null || km === undefined) return "—";
  const value = units === "imperial" ? km * KM_TO_MI : km;
  const unit = units === "imperial" ? "mi" : "km";
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })} ${unit}`;
}
