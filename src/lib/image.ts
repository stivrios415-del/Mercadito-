export interface OptimizeOptions {
  maxSize?: number
  quality?: number
  forcePng?: boolean
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = src
  })
}

/** Reduce y convierte la imagen a JPEG/PNG para guardarla sin llenar IndexedDB. */
export async function optimizeImage(
  file: File,
  { maxSize = 900, quality = 0.78, forcePng = false }: OptimizeOptions = {},
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen')
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL(forcePng ? 'image/png' : 'image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
