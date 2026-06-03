/** Resize Supabase Storage images via the render API (smaller payloads, faster menu). */

import { isNativeCustomerApp } from './nativeCustomerShell'

const DEFAULT_PROJECT_URL = 'https://gwjisaswagnfukvjllgb.supabase.co'

export type StorageImagePreset = 'thumb' | 'product-card' | 'product-detail' | 'offer' | 'hero'

const PRESET_SIZES: Record<StorageImagePreset, { width: number; quality: number }> = {
  thumb: { width: 160, quality: 72 },
  'product-card': { width: 520, quality: 78 },
  'product-detail': { width: 900, quality: 82 },
  offer: { width: 640, quality: 78 },
  hero: { width: 1280, quality: 85 },
}

function projectStorageUrl(): string {
  const fromEnv = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (fromEnv?.replace(/\/$/, '') || DEFAULT_PROJECT_URL)
}

function objectPublicPrefix(): string {
  return `${projectStorageUrl()}/storage/v1/object/public/`
}

/** True when URL points at this project's public Storage object. */
export function isProjectStorageUrl(url: string): boolean {
  return url.startsWith(objectPublicPrefix())
}

/**
 * Returns a resized image URL for Supabase Storage, or the original URL for external hosts.
 * Set VITE_STORAGE_IMAGE_TRANSFORM=false to disable (e.g. if render API is unavailable).
 */
export function storageImageUrl(
  url: string | null | undefined,
  preset: StorageImagePreset = 'product-card',
): string | null {
  if (!url?.trim()) return null
  const trimmed = url.trim()

  if (import.meta.env.VITE_STORAGE_IMAGE_TRANSFORM === 'false' || isNativeCustomerApp()) {
    return trimmed
  }

  const prefix = objectPublicPrefix()
  if (!trimmed.startsWith(prefix)) {
    return trimmed
  }

  const objectPath = trimmed.slice(prefix.length)
  const { width, quality } = PRESET_SIZES[preset]
  const params = new URLSearchParams({
    width: String(width),
    quality: String(quality),
    resize: 'cover',
  })
  return `${projectStorageUrl()}/storage/v1/render/image/public/${objectPath}?${params.toString()}`
}
