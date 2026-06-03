import { useState, type ImgHTMLAttributes } from 'react'
import { storageImageUrl, type StorageImagePreset } from '../lib/storageImage'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined
  preset?: StorageImagePreset
  fallbackSrc?: string | null
  wrapClassName?: string
}

export function StorageImage({
  src,
  preset = 'product-card',
  fallbackSrc,
  className = '',
  wrapClassName = '',
  alt = '',
  onLoad,
  onError,
  ...rest
}: Props) {
  const primary = storageImageUrl(src, preset)
  const fallback = (fallbackSrc ?? src)?.trim() || null
  const [activeSrc, setActiveSrc] = useState(primary)
  const [loaded, setLoaded] = useState(false)

  if (!activeSrc) return null

  return (
    <span className={`storage-image-wrap${wrapClassName ? ` ${wrapClassName}` : ''}`}>
      {!loaded ? <span className="storage-image-skeleton" aria-hidden /> : null}
      <img
        {...rest}
        src={activeSrc}
        alt={alt}
        className={`storage-image${loaded ? ' storage-image--loaded' : ''}${className ? ` ${className}` : ''}`}
        onLoad={(e) => {
          setLoaded(true)
          onLoad?.(e)
        }}
        onError={(e) => {
          if (fallback && activeSrc !== fallback) {
            setActiveSrc(fallback)
            setLoaded(false)
            return
          }
          onError?.(e)
        }}
      />
    </span>
  )
}
