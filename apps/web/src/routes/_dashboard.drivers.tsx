import { createFileRoute } from "@tanstack/react-router";
"use client";

import { useLiveDrivers } from "../lib/useLiveDrivers";
import { DriverCard } from "../components/DriverCard";

export const Route = createFileRoute("/_dashboard/drivers")({ component: Page });

function Page() {
  const { drivers, connected } = useLiveDrivers();
  const online = drivers.filter((d) => d.status === "online");
  const offline = drivers.filter((d) => d.status !== "online");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Who&apos;s on the road</h1>
        <span className={`text-xs ${connected ? "text-green-400" : "text-slate-500"}`}>
          {connected ? "● live" : "○ disconnected"}
        </span>
      </div>

      {online.length === 0 && (
        <div className="text-slate-400 mb-8">
          No-one online right now.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {online.map((d) => <DriverCard key={d.userId} d={d} />)}
      </div>

      {offline.length > 0 && (
        <>
          <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Offline</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {offline.map((d) => <DriverCard key={d.userId} d={d} />)}
          </div>
        </>
      )}
    </div>
  );
}
