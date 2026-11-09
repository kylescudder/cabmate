import { avatarRequest, prepareAvatar } from './profile'

// The photo lives in Cabmate's Postgres behind /api/profile/avatar, which also
// sets user.image, so the header UserButton shows it once the session refreshes.
// Cabmate's own profile form uses these same callbacks for upload and removal.
export const profileAvatar = {
  enabled: true,
  size: 512,
  extension: 'jpg' as const,
  resize: async (file: File) =>
    new File([await prepareAvatar(file)], 'avatar.jpg', { type: 'image/jpeg' }),
  upload: async (file: File) => {
    const image = await avatarRequest({
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: file
    })
    if (!image) throw new Error('The photo could not be uploaded.')
    return image
  },
  delete: async () => {
    await avatarRequest({ method: 'DELETE' })
  }
}
