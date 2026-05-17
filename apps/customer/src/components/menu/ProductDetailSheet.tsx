import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import ReviewSystem from '../ReviewSystem'
import { CloseIcon } from '../Icons'
import { useSessionStore } from '../../store/sessionStore'
import { fetchReviewEligibilityForProduct } from '../../services/reviewEligibility'
import type { ProductWithModifiers } from './types'

type Props = {
  product: ProductWithModifiers | null
  language: string
  /** Native shell: full-width bottom sheet, grab handle, safe-area padding */
  shell?: 'web' | 'native'
  formatPrice: (p: number) => string
  isOrderable: boolean
  unavailableMessage: string
  onClose: () => void
  onAddToCart: (qty: number, mods: Record<string, string[]>, notes: string) => void
}

export function ProductDetailSheet({
  product,
  language,
  shell = 'web',
  formatPrice,
  isOrderable,
  unavailableMessage,
  onClose,
  onAddToCart,
}: Props) {
  const [quantity, setQuantity] = useState(1)
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState('')
  const customerId = useSessionStore((s) => s.customerId)
  const [reviewEligibility, setReviewEligibility] = useState<{
    canWrite: boolean
    orderId: string | null
  }>({ canWrite: false, orderId: null })
  const t = (en: string, ar: string | null) => language === 'ar' && ar ? ar : en
  const isNativeShell = shell === 'native'
  const reduceMotion = useReducedMotion()

  function buildInitialSelectedMods(nextProduct: ProductWithModifiers | null) {
    if (!nextProduct) return {}

    const initial: Record<string, string[]> = {}

    for (const group of nextProduct.modifier_groups ?? []) {
      const defaultIds = group.options
        .filter((option) => option.is_available && option.is_default)
        .map((option) => option.id)

      if (defaultIds.length === 0) continue

      const limit = group.selection_type === 'single'
        ? 1
        : group.max_selections > 0
          ? group.max_selections
          : defaultIds.length

      initial[group.id] = defaultIds.slice(0, limit)
    }

    return initial
  }

  useEffect(() => {
    if (!product) return
    setQuantity(1)
    setSelectedMods(buildInitialSelectedMods(product))
    setNotes('')
  }, [product?.id])

  useEffect(() => {
    if (!product?.id || !customerId) {
      setReviewEligibility({ canWrite: false, orderId: null })
      return
    }

    let cancelled = false
    void fetchReviewEligibilityForProduct(customerId, product.id)
      .then((meta) => {
        if (cancelled) return
        setReviewEligibility({
          canWrite: !!meta && !meta.hasReviewed,
          orderId: meta?.orderId ?? null,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setReviewEligibility({ canWrite: false, orderId: null })
        }
      })

    return () => {
      cancelled = true
    }
  }, [product?.id, customerId])

  function getMinimumSelections(group: NonNullable<ProductWithModifiers['modifier_groups']>[number]) {
    return group.is_required
      ? Math.max(1, group.min_selections)
      : group.min_selections
  }

  function getGroupValidation(group: NonNullable<ProductWithModifiers['modifier_groups']>[number]) {
    const selectedCount = (selectedMods[group.id] ?? []).length
    const minimumSelections = getMinimumSelections(group)
    const maximumSelections = group.max_selections > 0 ? group.max_selections : Number.POSITIVE_INFINITY

    return {
      selectedCount,
      minimumSelections,
      maximumSelections,
      hasMinimum: selectedCount >= minimumSelections,
      withinMaximum: selectedCount <= maximumSelections,
      isComplete: selectedCount >= minimumSelections && selectedCount <= maximumSelections,
    }
  }

  function getGroupGuide(group: NonNullable<ProductWithModifiers['modifier_groups']>[number]) {
    const minimumSelections = getMinimumSelections(group)

    if (group.selection_type === 'single') {
      return minimumSelections > 0
        ? t('Choose 1', 'اختر 1')
        : t('Optional / choose 1', 'اختياري / اختر 1')
    }

    if (group.max_selections > 0 && minimumSelections > 0 && minimumSelections !== group.max_selections) {
      return t(
        `Choose ${minimumSelections} to ${group.max_selections}`,
        `اختر من ${minimumSelections} إلى ${group.max_selections}`
      )
    }

    if (group.max_selections > 0) {
      return minimumSelections > 0
        ? t(`Choose up to ${group.max_selections}`, `اختر حتى ${group.max_selections}`)
        : t(`Optional / up to ${group.max_selections}`, `اختياري / حتى ${group.max_selections}`)
    }

    if (minimumSelections > 0) {
      return t(`Choose at least ${minimumSelections}`, `اختر ${minimumSelections} على الأقل`)
    }

    return t('Optional', 'اختياري')
  }

  function toggleMod(
    group: NonNullable<ProductWithModifiers['modifier_groups']>[number],
    optionId: string
  ) {
    setSelectedMods((prev) => {
      const current = prev[group.id] ?? []
      if (group.selection_type === 'single') {
        return { ...prev, [group.id]: [optionId] }
      }

      if (!current.includes(optionId) && group.max_selections > 0 && current.length >= group.max_selections) {
        return prev
      }

      return {
        ...prev,
        [group.id]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      }
    })
  }

  function computeTotal(p: ProductWithModifiers) {
    let extra = 0
    for (const group of p.modifier_groups ?? []) {
      for (const opt of group.options) {
        if ((selectedMods[group.id] ?? []).includes(opt.id)) {
          extra += opt.price_delta
        }
      }
    }
    return (p.base_price + extra) * quantity
  }

  function canAdd(p: ProductWithModifiers) {
    for (const group of p.modifier_groups ?? []) {
      if (!getGroupValidation(group).isComplete) return false
    }
    return true
  }

  const incompleteGroups = (product?.modifier_groups ?? [])
    .filter((group) => !getGroupValidation(group).isComplete)
    .map((group) => t(group.name_en, group.name_ar))

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          key={product.id}
          className="pds-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className={`pds-panel ${isNativeShell ? 'pds-panel--native' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pds-title"
            initial={reduceMotion ? undefined : { y: 48, opacity: 0.97 }}
            animate={reduceMotion ? undefined : { y: 0, opacity: 1 }}
            exit={reduceMotion ? undefined : { y: 32, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {isNativeShell ? <div className="pds-grab" aria-hidden /> : null}
            <button type="button" className="pds-close" onClick={onClose} aria-label={language === 'ar' ? 'إغلاق' : 'Close'}>
              <CloseIcon />
            </button>

            {product.image_url && (
              <div className="pds-image">
                <img src={product.image_url} alt={t(product.name_en, product.name_ar)} loading="lazy" />
              </div>
            )}

            <div className="pds-body">
              <div className="pds-title-row">
                <h2 id="pds-title" className="pds-title">
                  {t(product.name_en, product.name_ar)}
                </h2>
                <span className="pds-base-price">{formatPrice(product.base_price)}</span>
              </div>
              {product.description_en && (
                <p className="pds-desc">{t(product.description_en, product.description_ar)}</p>
              )}

              {(product.modifier_groups ?? []).map((group) => (
                <div
                  key={group.id}
                  className={`pds-mod-group ${getGroupValidation(group).isComplete ? '' : 'incomplete'}`}
                >
                  <div className="pds-mod-head">
                    <div className="pds-mod-head-copy">
                      <span className="pds-mod-name">{t(group.name_en, group.name_ar)}</span>
                      <span className="pds-mod-guide">{getGroupGuide(group)}</span>
                    </div>
                    <div className="pds-mod-status">
                      {group.is_required && (
                        <span className="pds-required">{language === 'ar' ? 'مطلوب' : 'Required'}</span>
                      )}
                      <span className={`pds-selection-count ${getGroupValidation(group).isComplete ? 'complete' : 'pending'}`}>
                        {getGroupValidation(group).selectedCount}
                        {group.max_selections > 0 ? `/${group.max_selections}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="pds-mod-options">
                    {group.options
                      .filter((o) => o.is_available)
                      .map((opt) => {
                        const isSelected = (selectedMods[group.id] ?? []).includes(opt.id)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            className={`pds-mod-opt ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleMod(group, opt.id)}
                          >
                            <div className={`pds-indicator ${group.selection_type}`}>
                              {isSelected && <span>✓</span>}
                            </div>
                            <span className="pds-opt-name">{t(opt.name_en, opt.name_ar)}</span>
                            {opt.price_delta !== 0 && (
                              <span className="pds-opt-price">
                                {opt.price_delta > 0 ? '+' : ''}
                                {formatPrice(opt.price_delta)}
                              </span>
                            )}
                          </button>
                        )
                      })}
                  </div>
                  {!getGroupValidation(group).isComplete && (
                    <p className="pds-group-warning">
                      {language === 'ar'
                        ? 'يرجى استكمال هذا الاختيار قبل الإضافة إلى السلة.'
                        : 'Complete this selection before adding to cart.'}
                    </p>
                  )}
                </div>
              ))}

              <div className="pds-notes">
                <label htmlFor="pds-notes-input">{language === 'ar' ? 'ملاحظات خاصة' : 'Special notes'}</label>
                <textarea
                  id="pds-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={language === 'ar' ? 'أي تعليمات خاصة…' : 'Any special instructions…'}
                  rows={2}
                />
              </div>

              <div className="pds-footer-shell">
                {incompleteGroups.length > 0 && (
                  <p className="pds-footer-hint">
                    {language === 'ar'
                      ? `أكمل الاختيارات المطلوبة: ${incompleteGroups.join('، ')}`
                      : `Complete required selections: ${incompleteGroups.join(', ')}`}
                  </p>
                )}

                <div className="pds-footer">
                  <div className="pds-qty">
                    <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                      −
                    </button>
                    <span>{quantity}</span>
                    <button type="button" onClick={() => setQuantity((q) => q + 1)}>
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="pds-add"
                    disabled={!isOrderable || !canAdd(product)}
                    onClick={() => onAddToCart(quantity, selectedMods, notes)}
                  >
                    <span>
                      {!isOrderable
                        ? (language === 'ar' ? 'الطلبات متوقفة' : 'Ordering is closed')
                        : (language === 'ar' ? 'أضف إلى السلة' : 'Add to Cart')}
                    </span>
                    <span>{formatPrice(computeTotal(product))}</span>
                  </button>
                </div>
              </div>

              {!isOrderable && (
                <p className="pds-unavailable-message">{unavailableMessage}</p>
              )}

              {customerId && (
                <ReviewSystem
                  productId={product.id}
                  productNameEn={product.name_en}
                  productNameAr={product.name_ar}
                  canWriteReview={reviewEligibility.canWrite}
                  eligibleOrderId={reviewEligibility.orderId}
                />
              )}
            </div>

            <style>{`
              .pds-backdrop {
                position: fixed;
                inset: 0;
                z-index: 200;
                background: rgba(14, 14, 14, 0.6);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: flex-end;
                justify-content: center;
              }
              @media (min-width: 640px) {
                .pds-backdrop {
                  align-items: center;
                }
              }
              .pds-panel {
                position: relative;
                background: var(--surface);
                width: 100%;
                max-width: 540px;
                max-height: 90dvh;
                border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                overflow-y: auto;
                box-shadow: var(--elev-3);
              }
              @media (min-width: 640px) {
                .pds-panel {
                  border-radius: var(--radius-lg);
                }
              }
              ${
                isNativeShell
                  ? `
              .pds-panel--native {
                max-width: 100%;
                max-height: min(92dvh, calc(100svh - env(safe-area-inset-top, 0px) - 0.75rem));
                border-radius: var(--radius-lg) var(--radius-lg) 0 0;
                padding-bottom: env(safe-area-inset-bottom, 0px);
              }
              .pds-grab {
                width: 2.75rem;
                height: 5px;
                border-radius: 999px;
                background: var(--border-strong);
                margin: 0.4rem auto 0.15rem;
              }
              .pds-panel--native .pds-close {
                top: calc(0.65rem + env(safe-area-inset-top, 0px));
              }
              .pds-panel--native .pds-footer-shell {
                padding-bottom: calc(0.95rem + env(safe-area-inset-bottom, 0px));
              }
              `
                  : ''
              }
              .pds-close {
                position: absolute;
                top: 1rem;
                right: 1rem;
                z-index: 10;
                width: 36px;
                height: 36px;
                background: rgba(14, 14, 14, 0.75);
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .pds-close svg {
                width: 16px;
                height: 16px;
              }
              [dir='rtl'] .pds-close {
                right: auto;
                left: 1rem;
              }
              .pds-image {
                aspect-ratio: 16/9;
                overflow: hidden;
              }
              .pds-image img {
                width: 100%;
                height: 100%;
                object-fit: cover;
              }
              .pds-body {
                padding: 1.5rem;
              }
              .pds-title-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 1rem;
                margin-bottom: 0.5rem;
              }
              .pds-title {
                font-family: var(--font-display);
                font-size: 1.6rem;
                font-weight: 600;
                color: var(--ink);
              }
              .pds-base-price {
                font-size: 1rem;
                color: var(--gold-dark);
                font-weight: 500;
                white-space: nowrap;
              }
              .pds-desc {
                font-size: 0.875rem;
                color: var(--ink-muted);
                margin-bottom: 1.5rem;
                line-height: 1.6;
              }
              .pds-mod-group {
                margin-bottom: 1.25rem;
              }
              .pds-mod-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 0.75rem;
                margin-bottom: 0.65rem;
              }
              .pds-mod-head-copy {
                display: grid;
                gap: 0.2rem;
              }
              .pds-mod-name {
                font-size: 0.8rem;
                font-weight: 600;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                color: var(--ink);
              }
              .pds-mod-guide {
                font-size: 0.78rem;
                color: var(--ink-soft);
              }
              .pds-mod-status {
                display: flex;
                align-items: center;
                gap: 0.45rem;
                flex-wrap: wrap;
                justify-content: flex-end;
              }
              .pds-required {
                font-size: 0.65rem;
                padding: 0.15rem 0.5rem;
                background: var(--ink);
                color: var(--cream);
                border-radius: 20px;
                font-weight: 500;
                letter-spacing: 0.04em;
              }
              .pds-selection-count {
                font-size: 0.7rem;
                padding: 0.18rem 0.55rem;
                border-radius: 999px;
                border: 1px solid var(--border);
                background: var(--surface-elevated);
                color: var(--ink-soft);
                font-weight: 600;
              }
              .pds-selection-count.complete {
                border-color: var(--success-border);
                background: var(--success-muted);
                color: var(--success);
              }
              .pds-selection-count.pending {
                border-color: rgba(184, 151, 90, 0.24);
                background: rgba(184, 151, 90, 0.08);
                color: var(--gold-dark);
              }
              .pds-mod-options {
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
              }
              .pds-mod-group.incomplete .pds-mod-options {
                padding: 0.65rem;
                border: 1px solid rgba(184, 151, 90, 0.22);
                border-radius: calc(var(--radius-sm) + 2px);
                background: rgba(184, 151, 90, 0.05);
              }
              .pds-mod-opt {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.6rem 0.75rem;
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                text-align: start;
                transition: all var(--transition);
                width: 100%;
                background: var(--surface);
                color: var(--ink);
              }
              .pds-mod-opt:hover {
                border-color: var(--border-strong);
              }
              .pds-mod-opt.selected {
                border-color: var(--gold);
                background: rgba(184, 151, 90, 0.05);
              }
              .pds-indicator {
                width: 18px;
                height: 18px;
                flex-shrink: 0;
                border: 1.5px solid var(--border-strong);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.65rem;
                color: var(--gold);
              }
              .pds-indicator.single {
                border-radius: 50%;
              }
              .pds-indicator.multiple {
                border-radius: 3px;
              }
              .pds-mod-opt.selected .pds-indicator {
                border-color: var(--gold);
                background: rgba(184, 151, 90, 0.15);
              }
              .pds-opt-name {
                flex: 1;
                font-size: 0.875rem;
              }
              .pds-opt-price {
                font-size: 0.8rem;
                color: var(--gold-dark);
                font-weight: 500;
              }
              .pds-group-warning {
                margin-top: 0.5rem;
                font-size: 0.78rem;
                color: var(--gold-dark);
                line-height: 1.5;
              }
              .pds-notes {
                margin: 1.25rem 0;
              }
              .pds-notes label {
                display: block;
                font-size: 0.78rem;
                font-weight: 600;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                color: var(--ink-soft);
                margin-bottom: 0.4rem;
              }
              .pds-notes textarea {
                resize: none;
                font-size: 0.875rem;
              }
              .pds-footer-shell {
                position: sticky;
                bottom: 0;
                margin: 0 -1.5rem -1.5rem;
                padding: 0.9rem 1.5rem 1.15rem;
                border-top: 1px solid var(--border);
                background: var(--surface);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
              }
              .pds-footer-hint {
                margin-bottom: 0.65rem;
                font-size: 0.8rem;
                color: var(--gold-dark);
                line-height: 1.5;
              }
              .pds-footer {
                display: flex;
                align-items: center;
                gap: 1rem;
              }
              .pds-qty {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 0 0.25rem;
              }
              .pds-qty button {
                width: 36px;
                height: 36px;
                font-size: 1.2rem;
                color: var(--ink);
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
              }
              .pds-qty span {
                font-size: 0.95rem;
                font-weight: 600;
                min-width: 1.5rem;
                text-align: center;
              }
              .pds-add {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.85rem 1.25rem;
                background: var(--ink);
                color: var(--cream);
                border-radius: var(--radius-sm);
                font-size: 0.9rem;
                font-weight: 500;
                transition: all var(--transition);
              }
              .pds-add:hover:not(:disabled) {
                background: var(--gold);
              }
              .pds-add:disabled {
                opacity: 0.4;
                cursor: not-allowed;
              }
              .pds-unavailable-message {
                margin-top: 0.85rem;
                color: var(--warning);
                font-size: 0.88rem;
                line-height: 1.45;
              }
              @media (max-width: 640px) {
                .pds-footer-shell {
                  margin: 0 -1.5rem -1.5rem;
                  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
                }
                .pds-footer {
                  flex-direction: column;
                  align-items: stretch;
                }
                .pds-qty {
                  justify-content: space-between;
                }
                .pds-add {
                  min-height: 52px;
                }
              }
            `}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
