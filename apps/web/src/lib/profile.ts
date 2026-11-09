export const avatarTypes = ['image/jpeg', 'image/png', 'image/webp']

// Calls the private photo endpoint and returns the resulting image URL (or null).
export async function avatarRequest(init: RequestInit) {
  const response = await fetch('/api/profile/avatar', init)
  const body = (await response.json().catch(() => ({}))) as {
    image?: string | null
    error?: string
  }
  if (!response.ok)
    throw new Error(body.error ?? 'Unable to update your profile photo.')
  return body.image ?? null
}

// Crops to a 512 px square JPEG in the browser; the server re-encodes it again.
export async function prepareAvatar(file: File) {
  if (!avatarTypes.includes(file.type))
    throw new Error('Choose a JPEG, PNG or WebP photo.')
  if (file.size > 10 * 1024 * 1024)
    throw new Error('Choose a photo smaller than 10 MB.')
  const image = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare this photo.')
    const side = Math.min(image.width, image.height)
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512
    )
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('This photo could not be prepared.')),
        'image/jpeg',
        0.85
      )
    )
  } finally {
    image.close()
  }
}
