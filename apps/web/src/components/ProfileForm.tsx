import { useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUnits, type UnitSystem } from "../lib/units";
import { profileAvatar } from "../lib/profile-ui";
import { avatarTypes } from "../lib/profile";

interface Profile {
  id: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
  photo?: string | null;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

// `photos` is on in Better Auth mode, where /api/profile/avatar stores the photo.
export function ProfileForm({ initial, photos = false }: { initial: Profile; photos?: boolean }) {
  const queries = useQueryClient();
  const { units, setUnits } = useUnits();
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [slug, setSlug] = useState(initial.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [photo, setPhoto] = useState(initial.photo ?? null);
  const [photoBusy, setPhotoBusy] = useState<"upload" | "remove" | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [photoOk, setPhotoOk] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Upload and removal apply straight away; refreshing every query also
  // refreshes the Better Auth session, so the header menu shows the change.
  async function changePhoto(action: "upload" | "remove", file?: File) {
    setPhotoBusy(action);
    setPhotoErr(null);
    setPhotoOk(null);
    try {
      if (action === "upload" && file) {
        setPhoto(await profileAvatar.upload(await profileAvatar.resize(file)));
        setPhotoOk("Photo updated.");
      } else {
        await profileAvatar.delete();
        setPhoto(null);
        setPhotoOk("Photo removed.");
      }
      await queries.invalidateQueries();
    } catch (error) { setPhotoErr((error as Error).message); }
    finally {
      setPhotoBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

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
      {photos && (
        <div>
          <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
            Profile photo
          </span>
          <div className="flex items-center gap-4">
            {photo ? (
              <img src={photo} alt="Your profile photo" className="size-16 shrink-0 rounded-full border border-edge object-cover" />
            ) : (
              <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full border border-edge bg-ink text-slate-500">
                <UserRound className="size-7" />
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput} id="photo" type="file" accept={avatarTypes.join(",")} className="sr-only"
                tabIndex={-1} aria-hidden="true" disabled={photoBusy !== null}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) void changePhoto("upload", file); }}
              />
              <button
                type="button" disabled={photoBusy !== null} onClick={() => fileInput.current?.click()}
                className="rounded border border-edge px-3 py-2 text-sm font-semibold text-slate-200 hover:border-accent disabled:opacity-50"
              >
                {photoBusy === "upload" ? "Uploading…" : photo ? "Change photo" : "Upload photo"}
              </button>
              {photo && (
                <button
                  type="button" disabled={photoBusy !== null} onClick={() => void changePhoto("remove")}
                  className="rounded border border-edge px-3 py-2 text-sm font-semibold text-slate-200 hover:border-red-400 disabled:opacity-50"
                >
                  {photoBusy === "remove" ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            JPEG, PNG or WebP. Shown in your account menu; only you can see it.
          </p>
          {photoErr && <div role="alert" className="text-sm text-red-400 mt-1">{photoErr}</div>}
          {photoOk && !photoErr && <div role="status" className="text-sm text-green-300 mt-1">{photoOk}</div>}
        </div>
      )}

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
