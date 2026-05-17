/** True when the guest app is loaded inside the admin settings iframe (`?embed=1`). */
export function isAdminEmbedPreview(): boolean {
  if (typeof window === 'undefined') return false
  const embed = new URLSearchParams(window.location.search).get('embed')
  return embed === '1' || embed === 'preview'
}

export function initEmbedPreviewShellClass(): void {
  if (!isAdminEmbedPreview()) return
  document.documentElement.classList.add('rms-embed-preview')
}
