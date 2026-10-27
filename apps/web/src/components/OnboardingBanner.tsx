export function OnboardingBanner() {
  return (
    <section className="rounded-lg border border-accent/30 bg-accent/5 p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-accent">Welcome — let&apos;s get you on the road</h2>
        <p className="text-sm text-slate-300 mt-1">
          Live telemetry comes from a small Windows agent on your gaming PC. It
          reads <code className="mx-1 text-xs">Local\SCSTelemetry</code> (the
          shared-memory block exposed by scs-sdk-plugin) and POSTs samples to
          this site. Four one-time steps:
        </p>
      </div>

      <ol className="text-sm text-slate-300 space-y-3 list-decimal list-inside">
        <li>
          Install{" "}
          <a
            className="underline hover:text-accent"
            href="https://github.com/RenCloud/scs-sdk-plugin/releases"
            target="_blank"
            rel="noreferrer"
          >
            scs-sdk-plugin
          </a>{" "}
          into{" "}
          <code className="text-xs">
            &lt;Steam&gt;\steamapps\common\Euro Truck Simulator 2\bin\win_x64\plugins\
          </code>{" "}
          (create the <code className="text-xs">plugins</code> folder if it&apos;s
          missing).
        </li>
        <li>
          Download the latest{" "}
          <a
            className="underline hover:text-accent"
            href="https://github.com/kylescudder/ets2-data-dashboard/releases/"
            target="_blank"
            rel="noreferrer"
          >
            <code className="text-xs">ets2-tracker.exe</code> release
          </a>
          .
        </li>
        <li>
          Create the folder{" "}
          <code className="text-xs">%USERPROFILE%\.ets2-tracker\</code> and drop
          both the <code className="text-xs">ets2-tracker.exe</code> and a{" "}
          <code className="text-xs">config.json</code> file (use the snippet
          below) into it.
        </li>
        <li>
          In Steam, right-click{" "}
          <span className="font-semibold">Euro Truck Simulator 2</span> →{" "}
          <span className="font-semibold">Properties</span> →{" "}
          <span className="font-semibold">General</span> →{" "}
          <span className="font-semibold">Launch Options</span> and paste (replace{" "}
          <code className="text-xs">&lt;your-username&gt;</code> with your
          Windows account name):
          <pre className="mt-2 rounded border border-edge bg-ink px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`"C:\\Users\\<your-username>\\.ets2-tracker\\ets2-tracker.exe" %command% -developer -console`}
          </pre>
          Steam launches the agent and the game together every time you hit{" "}
          <span className="font-semibold">Play</span>. The{" "}
          <code className="text-xs">-developer -console</code> flags also open
          the in-game dev console so you can verify the plugin loaded.
        </li>
      </ol>

      <p className="text-xs text-slate-500 pt-2 border-t border-edge">
        This panel disappears once your first driving session arrives.
      </p>
    </section>
  );
}
