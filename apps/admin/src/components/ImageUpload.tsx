// apps/admin/src/components/ImageUpload.tsx
import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

interface ImageUploadProps {
  value: string | null
  onChange: (url: string) => void
  label?: string
  bucket?: string
  maxFileSizeBytes?: number
  /** Cap longest edge before upload (menu photos default 1280). */
  compressMaxDimension?: number
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

async function compressRasterImage(file: File, maxDimension: number, quality: number): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const maxSide = Math.max(bitmap.width, bitmap.height)
    const ratio = maxSide > maxDimension ? maxDimension / maxSide : 1
    const w = Math.max(1, Math.round(bitmap.width * ratio))
    const h = Math.max(1, Math.round(bitmap.height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create canvas context')
    ctx.drawImage(bitmap, 0, 0, w, h)

    let blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    })
    if (!blob || blob.size === 0) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      })
    }
    if (!blob) throw new Error('Could not compress image')
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `${base}.${ext}`, { type: blob.type })
  } finally {
    bitmap.close()
  }
}

/** Shrink large raster images so uploads stay under typical Storage limits. */
async function prepareImageForUpload(
  file: File,
  maxBytes: number,
  compressMaxDimension?: number,
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    if (file.size > maxBytes) {
      throw new Error(
        `File is too large (${formatMb(file.size)}). Maximum is ${formatMb(maxBytes)}. ` +
          'Compress the file or raise the limit in Supabase → Project Settings → Storage.',
      )
    }
    return file
  }

  let working = file
  if (working.size <= maxBytes) return working

  const attempts: { maxDim: number; q: number }[] = [
    ...(compressMaxDimension
      ? [{ maxDim: compressMaxDimension, q: 0.82 }]
      : []),
    { maxDim: 2048, q: 0.9 },
    { maxDim: 1920, q: 0.85 },
    { maxDim: 1600, q: 0.8 },
    { maxDim: 1280, q: 0.75 },
    { maxDim: 1024, q: 0.7 },
    { maxDim: 800, q: 0.65 },
    { maxDim: 640, q: 0.6 },
    { maxDim: 512, q: 0.55 },
  ]

  for (const { maxDim, q } of attempts) {
    try {
      working = await compressRasterImage(working, maxDim, q)
      if (working.size <= maxBytes) return working
    } catch {
      break
    }
  }

  if (working.size > maxBytes) {
    throw new Error(
      `Image is still too large (${formatMb(working.size)}) after compression. ` +
        `Maximum is ${formatMb(maxBytes)}. Use a smaller source file, or increase the upload cap in Supabase → Storage.`,
    )
  }
  return working
}

export default function ImageUpload({
  value,
  onChange,
  label = 'Image',
  bucket = 'menu',
  maxFileSizeBytes = 2 * 1024 * 1024,
  compressMaxDimension,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    try {
      let toUpload = file
      try {
        toUpload = await prepareImageForUpload(file, maxFileSizeBytes, compressMaxDimension)
      } catch (prepErr) {
        alert(errorMessage(prepErr))
        return
      }

      const fileExt = toUpload.name.split('.').pop() || 'bin'
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, toUpload)

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)

      onChange(data.publicUrl)
    } catch (error) {
      console.error('Error uploading image:', error)
      const raw = errorMessage(error)
      let user =
        /maximum allowed size|exceeded the maximum|Payload too large|413/i.test(raw)
          ? `This file exceeds your Supabase Storage upload limit (${raw}). Try a smaller image — uploads are compressed automatically when possible — or raise the limit in Supabase Dashboard → Project Settings → Storage.`
          : `Upload failed: ${raw}`
      alert(user)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="image-upload-comp">
      <label className="comp-label">{label}</label>
      <p className="image-upload-hint">
        Large images are resized and compressed in the browser (WebP/JPEG) before upload, up to about{' '}
        {formatMb(maxFileSizeBytes)} per file. If uploads still fail, raise the file size limit in Supabase → Storage.
      </p>
      <div className="upload-container">
        {value ? (
          <div className="preview-container">
            <img src={value} alt="Preview" className="image-preview" />
            <div className="preview-actions">
              <button
                type="button"
                className="replace-btn"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Replace'}
              </button>
              <button type="button" className="remove-btn" onClick={() => onChange('')} aria-label="Remove image">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div className="dropzone" onClick={() => fileInputRef.current?.click()}>
            <span className="dropzone-icon">↑</span>
            <span className="dropzone-text">{uploading ? 'Uploading...' : 'Upload Image'}</span>
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          accept="image/*"
          style={{ display: 'none' }}
        />
      </div>

      <style>{`
        .image-upload-comp { margin-bottom: 1rem; }
        .comp-label { display: block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem; }
        .image-upload-hint {
          font-size: 0.65rem;
          color: var(--text-muted);
          line-height: 1.4;
          margin: 0 0 0.5rem;
          max-width: 36rem;
        }
        .upload-container { width: 100%; height: 120px; border: 2px dashed var(--border); border-radius: var(--radius-md); overflow: hidden; position: relative; }
        .dropzone { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: background var(--transition); }
        .dropzone:hover { background: var(--bg-3); border-color: var(--gold); }
        .dropzone-icon { font-size: 1.5rem; color: var(--text-muted); margin-bottom: 0.25rem; }
        .dropzone-text { font-size: 0.75rem; color: var(--text-soft); font-weight: 500; }
        .preview-container { width: 100%; height: 100%; position: relative; }
        .image-preview { width: 100%; height: 100%; object-fit: cover; }
        .preview-actions { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 0.35rem; padding: 0.45rem; background: linear-gradient(transparent, rgba(0,0,0,0.75)); }
        .replace-btn { flex: 1; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.35); background: rgba(255,255,255,0.12); color: #fff; font-size: 0.68rem; font-weight: 700; cursor: pointer; }
        .replace-btn:hover:not(:disabled) { background: rgba(255,255,255,0.22); }
        .replace-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .remove-btn { width: 28px; height: 28px; border-radius: 50%; border: none; background: rgba(0,0,0,0.55); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; cursor: pointer; flex-shrink: 0; }
        .remove-btn:hover { background: rgba(0,0,0,0.8); }
      `}</style>
    </div>
  )
}
