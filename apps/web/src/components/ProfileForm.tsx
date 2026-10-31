import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUnits, type UnitSystem } from "../lib/units";

interface Profile {
  id: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export function ProfileForm({ initial }: { initial: Profile }) {
  const queries = useQueryClient();
  const { units, setUnits } = useUnits();
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [slug, setSlug] = useState(initial.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(false);

    const trimmedDisplay = displayName.trim();
    const trimmedSlug = slug.trim().toLowerCase();

    if (!trimmedDisplay) {
      setErr("Display name can't be blank");
      setBusy(false);
      return;
    }
    if (!SLUG_RE.test(trimmedSlug)) {
      setErr(
        "Username must be 2-32 characters: lowercase letters, digits, hyphens (no leading/trailing hyphen)",
      );
      setBusy(false);
      return;
    }

    try {
      await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ display_name: trimmedDisplay, name: trimmedSlug }) });
      setOk(true);
      await queries.invalidateQueries();
    } catch (error) { setErr((error as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
    <form
      onSubmit={onSubmit}
      className="max-w-lg rounded-lg border border-edge bg-panel p-6 space-y-4"
    >
      <div>
        <label htmlFor="display-name" className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
          Display name
        </label>
        <input
          id="display-name" type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="w-full rounded border border-edge bg-ink px-3 py-2 outline-none focus:border-accent"
        />
        <p className="text-xs text-slate-500 mt-1">
          Shown on driver cards, On the road, and the live map.
        </p>
      </div>

      <div>
        <label htmlFor="username" className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
          Username
        </label>
        <input
          id="username" type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          className="w-full rounded border border-edge bg-ink px-3 py-2 outline-none focus:border-accent font-mono"
        />
        <p className="text-xs text-slate-500 mt-1">
          URL slug. Your driver page is at <code>/u/{slug || "…"}</code>.
        </p>
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {ok && !err && <div className="text-sm text-green-300">Saved.</div>}

      <button
        type="submit"
        disabled={busy || !displayName.trim() || !slug.trim()}
        className="rounded bg-accent text-ink font-semibold px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </form>

    <section className="max-w-lg rounded-lg border border-edge bg-panel p-6 space-y-3 mt-6">
      <div>
        <h2 className="text-lg font-bold">Units</h2>
        <p className="text-xs text-slate-500 mt-1">
          How speed and distance are shown in Cabmate. Saved on this
          device — set it once per browser.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["metric", "imperial"] as UnitSystem[]).map((u) => (
          <label
            key={u}
            className={`flex flex-col items-start gap-1 rounded border px-3 py-2 cursor-pointer ${
              units === u
                ? "border-accent bg-accent/10"
                : "border-edge bg-ink hover:border-slate-500"
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="units"
                value={u}
                checked={units === u}
                onChange={() => setUnits(u)}
                className="accent-accent"
              />
              <span className="font-semibold capitalize">{u}</span>
            </div>
            <span className="text-xs text-slate-500">
              {u === "metric" ? "km/h · km" : "mph · mi"}
            </span>
          </label>
        ))}
      </div>
    </section>
    </>
  );
}
