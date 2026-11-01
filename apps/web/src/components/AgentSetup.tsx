import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface AgentSetupProps {
  userId: string;
  apiKey: string;
}

const AGENT_DOWNLOAD_URL =
  "https://github.com/kylescudder/cabmate/releases/latest/download/ets2-tracker.exe";
const LINUX_AGENT_DOWNLOAD_URL =
  "https://github.com/kylescudder/cabmate/releases/latest/download/ets2-tracker";

export function AgentSetup({ userId, apiKey }: AgentSetupProps) {
  const queries = useQueryClient();
  const [key, setKey] = useState(apiKey);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<"key" | "config" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ingestUrl = typeof window === 'undefined' ? '/api/ingest' : `${window.location.origin}/api/ingest`;

  const configSnippet = useMemo(
    () => JSON.stringify({ ingestUrl, apiKey: key }, null, 2),
    [ingestUrl, key],
  );

  async function copy(value: string, label: "key" | "config") {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
  }

  async function regenerate() {
    if (
      !confirm(
        "Regenerate your agent key? The old key stops working immediately and you'll need to update config.json on every machine running the agent.",
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const next = await api<{ api_key: string }>('/api/profile/key', { method: 'POST', body: '{}' });
      setKey(next.api_key);
      setReveal(true);
      await queries.invalidateQueries({ queryKey: ['profile'] });
    } catch (error) { setErr((error as Error).message); }
    finally { setBusy(false); }
  }

  const masked = key.slice(0, 4) + "…".repeat(8) + key.slice(-4);

  return (
    <section className="max-w-lg rounded-lg border border-edge bg-panel p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold">Connect your game</h2>
        <p className="text-xs text-slate-500 mt-1">
          The Windows companion uses this key to connect your game to Cabmate.
          Download the .exe, drop the config snippet into
          <code className="mx-1">%USERPROFILE%\.ets2-tracker\config.json</code>,
          then double-click the .exe with ETS2 running. Playing on Linux with
          Proton? Use the Linux build and
          <code className="mx-1">~/.ets2-tracker/config.json</code> instead.
        </p>
      </div>

      <a
        href={AGENT_DOWNLOAD_URL}
        className="inline-flex items-center justify-center rounded bg-accent text-ink font-semibold px-4 py-2 hover:brightness-110"
      >
        Download ets2-tracker.exe
      </a>
      <a
        href={LINUX_AGENT_DOWNLOAD_URL}
        className="ml-2 inline-flex items-center justify-center rounded border border-edge bg-ink px-4 py-2 text-sm hover:border-accent"
      >
        Linux (Proton)
      </a>

      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
          API key
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={reveal ? key : masked}
            className="flex-1 rounded border border-edge bg-ink px-3 py-2 outline-none font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="rounded border border-edge bg-ink px-3 py-2 text-sm hover:border-accent"
          >
            {reveal ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={() => copy(key, "key")}
            className="rounded border border-edge bg-ink px-3 py-2 text-sm hover:border-accent"
          >
            {copied === "key" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
          config.json
        </label>
        <pre className="rounded border border-edge bg-ink px-3 py-2 text-xs font-mono overflow-x-auto">
{configSnippet}
        </pre>
        <button
          type="button"
          onClick={() => copy(configSnippet, "config")}
          className="mt-2 rounded border border-edge bg-ink px-3 py-1.5 text-sm hover:border-accent"
        >
          {copied === "config" ? "Copied" : "Copy snippet"}
        </button>
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}

      <div className="flex items-center justify-between pt-2 border-t border-edge">
        <p className="text-xs text-slate-500">
          Rotate this key if you suspect it leaked.
        </p>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="rounded border border-red-500/40 text-red-300 px-3 py-1.5 text-sm hover:bg-red-500/10 disabled:opacity-50"
        >
          {busy ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
    </section>
  );
}
