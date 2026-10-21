// Jev accepts PNG/JPEG images 280-1568 px per side and at most ~2.46 megapixels.
export const IMAGE_MIN_SIDE = 280
export const IMAGE_MAX_SIDE = 1568
export const IMAGE_MAX_PIXELS = 2_458_624

/** Scales (w, h) to fit Jev's limits while keeping the aspect ratio. */
export function fitDimensions(w: number, h: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) throw new Error('Image has no size')
  let scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(w, h))
  scale = Math.min(scale, Math.sqrt(IMAGE_MAX_PIXELS / (w * h)))
  if (Math.min(w, h) * scale < IMAGE_MIN_SIDE) scale = IMAGE_MIN_SIDE / Math.min(w, h)
  // Extremely long, thin images can't satisfy both bounds; clamp each side.
  const width = Math.min(IMAGE_MAX_SIDE, Math.max(IMAGE_MIN_SIDE, Math.round(w * scale)))
  const height = Math.min(IMAGE_MAX_SIDE, Math.max(IMAGE_MIN_SIDE, Math.round(h * scale)))
  return { width, height }
}

/**
 * Loads any image the browser can decode and re-encodes it as a JPEG data URL within limits.
 * `url` is what to display: the original path for samples, or the data URL for uploads (so no
 * object URL outlives this call).
 */
export async function toJevImage(source: Blob | string): Promise<{ dataUrl: string; url: string }> {
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
  try {
    const dataUrl = await encode(objectUrl ?? (source as string))
    return { dataUrl, url: objectUrl ? dataUrl : (source as string) }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

async function encode(url: string): Promise<string> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.86)
}
