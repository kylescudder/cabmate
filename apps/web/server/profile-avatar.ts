import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Database } from './db';
import { isVerifiedAllowed } from './auth-policy';
import { authUser, userProfile } from './schema';

type SessionUser = { id: string; email: string; emailVerified: boolean };
export type AvatarSettings = {
  origin: string;
  allowedEmails: readonly string[];
  getSession: (headers: Headers) => Promise<{ user: SessionUser } | null>;
};

// The browser already sends a 512 px JPEG; anything larger is refused unread.
export const AVATAR_UPLOAD_LIMIT = 512_000;
const avatarPath = '/api/profile/avatar';
export const avatarUrl = (version: string) => avatarPath + '?v=' + version;

const privateHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

class AvatarError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new AvatarError(413, 'This photo is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new AvatarError(400, 'Choose a photo to upload.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AvatarError(413, 'This photo is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

// Check the file signature before handing anything to an image decoder.
function sniff(body: Buffer) {
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg';
  if (body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

// GET, PUT and DELETE /api/profile/avatar for the signed-in driver's own photo.
// Better Auth only: a verified email that is still in AUTH_ALLOWED_EMAILS.
export function createAvatarHandler(db: Database, settings: AvatarSettings) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });
  return async (request: Request): Promise<Response> => {
    try {
      if (new URL(request.url).pathname !== avatarPath) return json({ error: 'Not found' }, 404);
      if (request.method !== 'GET' && (request.headers.get('origin') !== settings.origin || request.headers.get('sec-fetch-site') === 'cross-site'))
        return json({ error: 'Invalid request origin' }, 403);
      const session = await settings.getSession(request.headers);
      if (!session) return json({ error: 'Please sign in to change your photo.' }, 401);
      if (!isVerifiedAllowed(session.user, settings.allowedEmails)) return json({ error: 'Sign in with an invited, verified email first.' }, 403);
      const userId = session.user.id;

      if (request.method === 'GET') {
        const [row] = await db.select({ avatar: userProfile.avatar }).from(userProfile).where(eq(userProfile.userId, userId));
        if (!row?.avatar) return json({ error: 'No profile photo' }, 404);
        return new Response(new Uint8Array(row.avatar), {
          headers: { ...privateHeaders, 'Content-Type': 'image/jpeg', 'Content-Security-Policy': "default-src 'none'; sandbox" },
        });
      }

      if (request.method === 'PUT') {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(request.headers.get('content-type')?.split(';')[0].trim() ?? ''))
          throw new AvatarError(415, 'Choose a JPEG, PNG or WebP photo.');
        const body = await readBody(request, AVATAR_UPLOAD_LIMIT);
        const format = sniff(body);
        if (!format) throw new AvatarError(400, 'Choose a valid JPEG, PNG or WebP photo.');
        let avatar: Buffer;
        try {
          const image = sharp(body, { failOn: 'error', limitInputPixels: 4_000_000, animated: false });
          const metadata = await image.metadata();
          if (metadata.format !== format || (metadata.pages ?? 1) > 1) throw new Error('Unsupported image');
          // Re-encode: strips EXIF/GPS and never serves uploaded bytes back.
          avatar = await image.rotate().resize(256, 256, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
        } catch {
          throw new AvatarError(400, 'This photo could not be read. Choose a different JPEG, PNG or WebP image.');
        }
        const avatarVersion = randomUUID();
        const image = avatarUrl(avatarVersion);
        await db.transaction(async tx => {
          await tx.insert(userProfile).values({ userId, avatar, avatarVersion })
            .onConflictDoUpdate({ target: userProfile.userId, set: { avatar, avatarVersion, updatedAt: new Date() } });
          // The account menu reads user.image; the version busts any cached copy.
          await tx.update(authUser).set({ image, updatedAt: new Date() }).where(eq(authUser.id, userId));
        });
        return json({ image });
      }

      if (request.method === 'DELETE') {
        await db.transaction(async tx => {
          await tx.update(userProfile).set({ avatar: null, avatarVersion: null, updatedAt: new Date() }).where(eq(userProfile.userId, userId));
          await tx.update(authUser).set({ image: null, updatedAt: new Date() }).where(eq(authUser.id, userId));
        });
        return json({ image: null });
      }
      return json({ error: 'Method not allowed' }, 405);
    } catch (error) {
      if (error instanceof AvatarError) return json({ error: error.message }, error.status);
      // Database and auth details never reach the response or the logs.
      console.error('Profile photo request failed', { method: request.method });
      return json({ error: 'Unable to update your photo. Please try again.' }, 500);
    }
  };
}
