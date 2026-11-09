import { useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useUnits, type UnitSystem } from '../lib/units'
import { profileAvatar } from '../lib/profile-ui'
import { avatarTypes } from '../lib/profile'

interface Profile {
  id: string
  name: string
  display_name: string
  avatar_url: string | null
  photo?: string | null
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/

// The profile photo is stored privately by /api/profile/avatar.
export function ProfileForm({ initial }: { initial: Profile }) {
  const queries = useQueryClient()
  const { units, setUnits } = useUnits()
  const [displayName, setDisplayName] = useState(initial.display_name)
  const [slug, setSlug] = useState(initial.name)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [photo, setPhoto] = useState(initial.photo ?? null)
  const [photoBusy, setPhotoBusy] = useState<'upload' | 'remove' | null>(null)
  const [photoErr, setPhotoErr] = useState<string | null>(null)
  const [photoOk, setPhotoOk] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Upload and removal apply straight away; refreshing every query also
  // refreshes the Better Auth session, so the header menu shows the change.
  async function changePhoto(action: 'upload' | 'remove', file?: File) {
    setPhotoBusy(action)
    setPhotoErr(null)
    setPhotoOk(null)
    try {
      if (action === 'upload' && file) {
        setPhoto(await profileAvatar.upload(await profileAvatar.resize(file)))
        setPhotoOk('Photo updated.')
      } else {
        await profileAvatar.delete()
        setPhoto(null)
        setPhotoOk('Photo removed.')
      }
      await queries.invalidateQueries()
    } catch (error) {
      setPhotoErr((error as Error).message)
    } finally {
      setPhotoBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setOk(false)

    const trimmedDisplay = displayName.trim()
    const trimmedSlug = slug.trim().toLowerCase()

    if (!trimmedDisplay) {
      setErr("Display name can't be blank")
      setBusy(false)
      return
    }
    if (!SLUG_RE.test(trimmedSlug)) {
      setErr(
        'Username must be 2-32 characters: lowercase letters, digits, hyphens (no leading/trailing hyphen)'
      )
      setBusy(false)
      return
    }

    try {
      await api('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: trimmedDisplay,
          name: trimmedSlug
        })
      })
      setOk(true)
      await queries.invalidateQueries()
    } catch (error) {
      setErr((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form
        onSubmit={onSubmit}
        className='max-w-lg space-y-4 rounded-lg border border-edge bg-panel p-6'
      >
        <div>
          <span className='mb-1 block text-xs tracking-wide text-slate-500 uppercase'>
            Profile photo
          </span>
          <div className='flex items-center gap-4'>
            {photo ? (
              <img
                src={photo}
                alt='Your profile photo'
                className='size-16 shrink-0 rounded-full border border-edge object-cover'
              />
            ) : (
              <span
                aria-hidden='true'
                className='flex size-16 shrink-0 items-center justify-center rounded-full border border-edge bg-ink text-slate-500'
              >
                <UserRound className='size-7' />
              </span>
            )}
            <div className='flex flex-wrap gap-2'>
              <input
                ref={fileInput}
                id='photo'
                type='file'
                accept={avatarTypes.join(',')}
                className='sr-only'
                tabIndex={-1}
                aria-hidden='true'
                disabled={photoBusy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void changePhoto('upload', file)
                }}
              />
              <button
                type='button'
                disabled={photoBusy !== null}
                onClick={() => fileInput.current?.click()}
                className='rounded border border-edge px-3 py-2 text-sm font-semibold text-slate-200 hover:border-accent disabled:opacity-50'
              >
                {photoBusy === 'upload'
                  ? 'Uploading…'
                  : photo
                    ? 'Change photo'
                    : 'Upload photo'}
              </button>
              {photo && (
                <button
                  type='button'
                  disabled={photoBusy !== null}
                  onClick={() => void changePhoto('remove')}
                  className='rounded border border-edge px-3 py-2 text-sm font-semibold text-slate-200 hover:border-red-400 disabled:opacity-50'
                >
                  {photoBusy === 'remove' ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          </div>
          <p className='mt-1 text-xs text-slate-500'>
            JPEG, PNG or WebP. Shown in your account menu; only you can see it.
          </p>
          {photoErr && (
            <div role='alert' className='mt-1 text-sm text-red-400'>
              {photoErr}
            </div>
          )}
          {photoOk && !photoErr && (
            <div role='status' className='mt-1 text-sm text-green-300'>
              {photoOk}
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor='display-name'
            className='mb-1 block text-xs tracking-wide text-slate-500 uppercase'
          >
            Display name
          </label>
          <input
            id='display-name'
            type='text'
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className='w-full rounded border border-edge bg-ink px-3 py-2 outline-none focus:border-accent'
          />
          <p className='mt-1 text-xs text-slate-500'>
            Shown on driver cards, On the road, and the live map.
          </p>
        </div>

        <div>
          <label
            htmlFor='username'
            className='mb-1 block text-xs tracking-wide text-slate-500 uppercase'
          >
            Username
          </label>
          <input
            id='username'
            type='text'
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className='w-full rounded border border-edge bg-ink px-3 py-2 font-mono outline-none focus:border-accent'
          />
          <p className='mt-1 text-xs text-slate-500'>
            URL slug. Your driver page is at <code>/u/{slug || '…'}</code>.
          </p>
        </div>

        {err && <div className='text-sm text-red-400'>{err}</div>}
        {ok && !err && <div className='text-sm text-green-300'>Saved.</div>}

        <button
          type='submit'
          disabled={busy || !displayName.trim() || !slug.trim()}
          className='rounded bg-accent px-4 py-2 font-semibold text-ink disabled:opacity-50'
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>

      <section className='mt-6 max-w-lg space-y-3 rounded-lg border border-edge bg-panel p-6'>
        <div>
          <h2 className='text-lg font-bold'>Units</h2>
          <p className='mt-1 text-xs text-slate-500'>
            How speed and distance are shown in Cabmate. Saved on this device —
            set it once per browser.
          </p>
        </div>
        <div className='grid grid-cols-2 gap-2'>
          {(['metric', 'imperial'] as UnitSystem[]).map((u) => (
            <label
              key={u}
              className={`flex cursor-pointer flex-col items-start gap-1 rounded border px-3 py-2 ${
                units === u
                  ? 'border-accent bg-accent/10'
                  : 'border-edge bg-ink hover:border-slate-500'
              }`}
            >
              <div className='flex items-center gap-2'>
                <input
                  type='radio'
                  name='units'
                  value={u}
                  checked={units === u}
                  onChange={() => setUnits(u)}
                  className='accent-accent'
                />
                <span className='font-semibold capitalize'>{u}</span>
              </div>
              <span className='text-xs text-slate-500'>
                {u === 'metric' ? 'km/h · km' : 'mph · mi'}
              </span>
            </label>
          ))}
        </div>
      </section>
    </>
  )
}
