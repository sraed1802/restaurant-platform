// apps/customer/src/pages/CartPage.tsx
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { buildCartItemId, useCartStore } from '../store/cartStore'
import { useSessionStore } from '../store/sessionStore'
import { useCustomerPromotionContext } from '../hooks/useCustomerPromotionContext'
import { useOrderAvailability } from '../hooks/useOrderAvailability'
import { supabase } from '../lib/supabase'
import { CartIcon, CheckIcon, ClockIcon, MenuIcon, SparklesIcon, UtensilsIcon } from '../components/Icons'
import { StorageImage } from '../components/StorageImage'
import type { Promotion } from '../../types'
import {
  fetchCustomerPromotionContext,
  getFirstOrderPromotionError,
  getPromotionDiscountAmount,
  isPromotionEligibleForCustomer,
} from '../services/promotionEligibility'

export default function CartPage() {
  const { language, phone, customerId } = useSessionStore()
  const {
    items, subtotal, comboDiscountAmount, deliveryFeeValue, systemConfig,
    appliedPromotion, appliedCombos, promoError,
    updateQuantity, removeItem, applyPromotion, removePromotion, setPromoError, loadComboPromotions
  } = useCartStore()

  useEffect(() => {
    useCartStore.getState().loadDeliveryFee()
    void loadComboPromotions()
  }, [loadComboPromotions])
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const navigate = useNavigate()
  const t = (en: string, ar: string) => language === 'ar' ? ar : en
  const { status: orderAvailabilityStatus, isOrderable } = useOrderAvailability()
  const {
    context: customerPromotionContext,
    loading: promotionContextLoading,
    error: promotionContextError,
  } = useCustomerPromotionContext(phone, customerId)
  const formatMoney = (value: number) => `QAR ${value.toFixed(2)}`
  const closedMessage = (() => {
    const baseMessage = language === 'ar'
      ? (orderAvailabilityStatus.public_message_ar || 'الطلبات مغلقة حالياً.')
      : (orderAvailabilityStatus.public_message_en || 'Orders are currently closed.')

    if (!orderAvailabilityStatus.next_open_at) return baseMessage

    const nextOpenLabel = new Date(orderAvailabilityStatus.next_open_at).toLocaleString(
      language === 'ar' ? 'ar-QA' : 'en-US',
      {
        dateStyle: 'medium',
        timeStyle: 'short',
      },
    )

    return `${baseMessage} ${t('Opens again:', 'يفتح مجدداً:')} ${nextOpenLabel}`
  })()
  const subtotalAmount = subtotal()
  const comboSavingsAmount = comboDiscountAmount()
  const shouldGateFirstOrderPromotion = appliedPromotion?.condition_type === 'first_order' && (
    promotionContextLoading ||
    promotionContextError !== null ||
    !isPromotionEligibleForCustomer(appliedPromotion, customerPromotionContext)
  )
  const effectiveAppliedPromotion = shouldGateFirstOrderPromotion ? null : appliedPromotion
  const promotionDiscountAmount = getPromotionDiscountAmount(
    effectiveAppliedPromotion,
    subtotalAmount
  )
  const totalDiscountAmount = comboSavingsAmount + promotionDiscountAmount
  const effectiveDeliveryFee = effectiveAppliedPromotion?.discount_type === 'free_delivery'
    ? 0
    : systemConfig.freeDeliveryEnabled
      ? 0
      : deliveryFeeValue
  const totalAmount = Math.max(0, subtotalAmount - totalDiscountAmount + effectiveDeliveryFee)

  function getCartLineId(item: typeof items[number]) {
    return item.cartItemId ?? buildCartItemId(item.product.id, item.selectedModifiers, item.notes)
  }

  function getModifierLabels(item: typeof items[number]) {
    const labels: string[] = []

    for (const group of item.product.modifier_groups ?? []) {
      const selectedIds = item.selectedModifiers[group.id] ?? []
      if (selectedIds.length === 0) continue

      for (const option of group.options ?? []) {
        if (selectedIds.includes(option.id)) {
          labels.push(`${t(group.name_en, group.name_ar)}: ${t(option.name_en, option.name_ar)}`)
        }
      }
    }

    return labels
  }

  useEffect(() => {
    if (appliedPromotion?.condition_type !== 'first_order') return
    if (promotionContextLoading || promotionContextError) return
    if (isPromotionEligibleForCustomer(appliedPromotion, customerPromotionContext)) return

    removePromotion()
    setPromoError(getFirstOrderPromotionError(language))
  }, [
    appliedPromotion,
    customerPromotionContext,
    language,
    promotionContextError,
    promotionContextLoading,
    removePromotion,
    setPromoError,
  ])

  async function applyPromo() {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    setPromoError(null)
    try {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('code', promoCode.toUpperCase())
        .eq('is_active', true)
        .or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())
        .maybeSingle()

      if (error || !data) {
        setPromoError(t('Invalid or expired promo code', 'رمز الترويج غير صالح أو منتهي الصلاحية'))
        return
      }
      const promotion = data as Promotion

      if (promotion.condition_type === 'first_order') {
        const context = await fetchCustomerPromotionContext(phone)
        if (!isPromotionEligibleForCustomer(promotion, context)) {
          setPromoError(getFirstOrderPromotionError(language))
          return
        }
      }

      if (promotion.min_order_value && subtotal() < promotion.min_order_value) {
        setPromoError(
          t(
            `Minimum order value: QAR ${promotion.min_order_value.toFixed(2)}`,
            `الحد الأدنى للطلب: ${promotion.min_order_value.toFixed(2)} ريال`
          )
        )
        return
      }
      if (promotion.usage_limit !== null && promotion.usage_count >= promotion.usage_limit) {
        setPromoError(t('Promo code has reached its usage limit', 'تم الوصول إلى حد استخدام رمز الترويج'))
        return
      }
      applyPromotion(promotion)
      setPromoCode('')
    } catch (error) {
      console.error('Failed to apply promo code:', error)
      setPromoError(t('Failed to apply promo code', 'تعذّر تطبيق رمز الترويج'))
    } finally {
      setPromoLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <>
        <div className="empty-state-shell">
          <section className="empty-state" aria-labelledby="empty-cart-title">
            <span className="empty-eyebrow">
              {t('Ready when you are', 'جاهزون متى ما أردت')}
            </span>
            <div className="empty-icon" aria-hidden="true">
              <CartIcon className="empty-icon-svg" />
            </div>
            <h2 id="empty-cart-title" className="empty-title">
              {t('Your cart is empty', 'سلتك فارغة')}
            </h2>
            <p className="empty-desc">
              {t('Add items from the menu to get started', 'أضف عناصر من القائمة للبدء')}
            </p>
            <button
              onClick={() => navigate('/menu')}
              className="empty-action-btn"
              aria-label={t('Browse Menu', 'تصفح القائمة')}
            >
              <MenuIcon className="empty-action-icon" />
              <span>{t('Browse Menu', 'تصفح القائمة')}</span>
            </button>
            <p className="empty-note">
              {t(
                'Explore the menu and add your favorites in just a few taps.',
                'استكشف القائمة وأضف مفضلاتك خلال بضع نقرات.'
              )}
            </p>
          </section>
        </div>
        <style>{cartPageStyles}</style>
      </>
    )
  }

  return (
    <div className="cart-page">
      <div className="cart-page-head">
        <div>
          <span className="cart-kicker">{t('Checkout preview', 'معاينة الطلب')}</span>
          <h1 className="page-title">{t('Your Order', 'طلبك')}</h1>
          <p className="cart-subtitle">
            {t(
              `${items.length} line items ready for checkout and final refinements.`,
              `${items.length} عناصر جاهزة للدفع مع اللمسات الأخيرة.`
            )}
          </p>
        </div>
        <button type="button" className="cart-browse-btn" onClick={() => navigate('/menu')}>
          <MenuIcon className="cart-browse-icon" />
          <span>{t('Add more items', 'أضف المزيد')}</span>
        </button>
      </div>

      <div className="cart-layout">
        <div className="cart-items-column">
          {!isOrderable && <p className="checkout-warning checkout-warning-inline">{closedMessage}</p>}

          <div className="cart-items">
            {items.map((item) => {
              const cartLineId = getCartLineId(item)
              const modifierLabels = getModifierLabels(item)
              const unitPrice = item.quantity > 0 ? item.lineTotal / item.quantity : item.lineTotal

              return (
                <article key={cartLineId} className="cart-item">
                  <div className="cart-item-media" aria-hidden="true">
                    {item.product.image_url ? (
                      <StorageImage
                        src={item.product.image_url}
                        preset="thumb"
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="cart-item-placeholder">
                        <UtensilsIcon />
                      </div>
                    )}
                  </div>

                  <div className="cart-item-content">
                    <div className="cart-item-topline">
                      <div className="cart-item-info">
                        <h3>{language === 'ar' ? item.product.name_ar : item.product.name_en}</h3>

                        {modifierLabels.length > 0 && (
                          <div className="cart-item-modifiers" role="list" aria-label={t('Selected modifiers', 'الإضافات المختارة')}>
                            {modifierLabels.map((label) => (
                              <span key={label} className="cart-item-modifier-chip" role="listitem">
                                {label}
                              </span>
                            ))}
                          </div>
                        )}

                        {item.notes ? (
                          <p className="cart-item-note">
                            <strong>{t('Note:', 'ملاحظة:')}</strong> {item.notes}
                          </p>
                        ) : null}

                        <div className="cart-item-meta">
                          {item.product.prep_time_minutes ? (
                            <span className="cart-item-meta-pill">
                              <ClockIcon className="cart-item-meta-icon" />
                              {item.product.prep_time_minutes} {t('min', 'د')}
                            </span>
                          ) : null}
                          <span className="cart-item-meta-pill">
                            <CheckIcon className="cart-item-meta-icon" />
                            {item.quantity} x {formatMoney(unitPrice)}
                          </span>
                        </div>
                      </div>

                      <div className="cart-item-total-block">
                        <span className="cart-item-total-label">{t('Line total', 'إجمالي العنصر')}</span>
                        <strong className="cart-item-total">{formatMoney(item.lineTotal)}</strong>
                      </div>
                    </div>

                    <div className="cart-item-controls">
                      <div className="qty-row">
                        <button
                          type="button"
                          onClick={() => updateQuantity(cartLineId, item.quantity - 1)}
                          aria-label={t('Decrease quantity', 'تقليل الكمية')}
                        >
                          −
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(cartLineId, item.quantity + 1)}
                          aria-label={t('Increase quantity', 'زيادة الكمية')}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => removeItem(cartLineId)}
                        aria-label={t('Remove item', 'إزالة العنصر')}
                      >
                        {t('Remove', 'إزالة')}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <div className="cart-summary">
          <div className="cart-summary-header">
            <div>
              <span className="section-label">{t('Order summary', 'ملخص الطلب')}</span>
              <h2 className="cart-summary-title">{t('Ready to place', 'جاهز للتأكيد')}</h2>
            </div>
            <span className="cart-summary-count">
              {items.reduce((sum, item) => sum + item.quantity, 0)} {t('items', 'عناصر')}
            </span>
          </div>

          <div className="cart-summary-note">
            <SparklesIcon className="cart-summary-note-icon" />
            <span>
              {t(
                'Review your selected options and notes before checkout. Everything shown here will be sent to the kitchen.',
                'راجع الخيارات والملاحظات المختارة قبل الدفع. كل ما يظهر هنا سيصل إلى المطبخ.'
              )}
            </span>
          </div>

          <div className="promo-section">
            <label className="section-label">{t('Promo Code', 'رمز الترويج')}</label>
            {effectiveAppliedPromotion ? (
              <div className="promo-applied">
                <span>✓ {effectiveAppliedPromotion.code ?? effectiveAppliedPromotion.name_en}</span>
                <button type="button" onClick={removePromotion}>{t('Remove', 'إزالة')}</button>
              </div>
            ) : (
              <div className="promo-input-row">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder={t('Enter code', 'أدخل الرمز')}
                  onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                />
                <button type="button" onClick={applyPromo} disabled={promoLoading} className="promo-apply-btn">
                  {promoLoading ? '...' : t('Apply', 'تطبيق')}
                </button>
              </div>
            )}
            {promoError && <p className="promo-error">{promoError}</p>}
          </div>

          <div className="totals">
            <div className="total-row"><span>{t('Subtotal', 'المجموع الفرعي')}</span><span>{formatMoney(subtotalAmount)}</span></div>
            {comboSavingsAmount > 0 && (
              <div className="total-row discount">
                <span>{t('Combo savings', 'توفير الكومبو')}</span>
                <span>− {formatMoney(comboSavingsAmount)}</span>
              </div>
            )}
            {totalDiscountAmount > 0 && (
              <div className="total-row discount">
                <span>{t('Total discounts', 'إجمالي الخصومات')}</span>
                <span>− {formatMoney(totalDiscountAmount)}</span>
              </div>
            )}
            <div className="total-row"><span>{t('Delivery', 'التوصيل')}</span><span>{formatMoney(effectiveDeliveryFee)}</span></div>
            <div className="total-row grand-total">
              <span>{t('Total', 'الإجمالي')}</span>
              <span>{formatMoney(totalAmount)}</span>
            </div>
          </div>

          {appliedCombos.length > 0 && (
            <div className="combo-summary-box">
              <label className="section-label">{t('Applied combos', 'الكومبوهات المطبقة')}</label>
              {appliedCombos.map((combo) => (
                <div key={combo.combo_promotion_id} className="combo-summary-row">
                  <span>
                    {combo.quantity}× {language === 'ar' ? combo.name_ar : combo.name_en}
                  </span>
                  <strong>− {formatMoney(combo.savings)}</strong>
                </div>
              ))}
            </div>
          )}

          {!isOrderable && <p className="checkout-warning">{closedMessage}</p>}

          <button type="button" className="checkout-btn" onClick={() => navigate('/checkout')} disabled={!isOrderable}>
            {t('Proceed to Checkout', 'المتابعة للدفع')}
          </button>
        </div>
      </div>

      <div className="cart-mobile-bar">
        <div className="cart-mobile-bar-copy">
          <span className="cart-mobile-bar-label">{t('Total', 'الإجمالي')}</span>
          <strong>{formatMoney(totalAmount)}</strong>
        </div>
        <button type="button" className="cart-mobile-bar-btn" onClick={() => navigate('/checkout')} disabled={!isOrderable}>
          {t('Checkout', 'الدفع')}
        </button>
      </div>

      <style>{cartPageStyles}</style>
    </div>
  )
}

const cartPageStyles = `
  .cart-page { max-width: 1100px; margin: 0 auto; padding: 2rem 1.25rem 7.5rem; }
  .cart-page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
  .cart-kicker { display: inline-block; margin-bottom: 0.45rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold-dark); }
  .page-title { font-family: var(--font-display); font-size: clamp(1.9rem, 5vw, 2.4rem); font-weight: 300; margin-bottom: 0.35rem; }
  .cart-subtitle { color: var(--ink-muted); max-width: 42rem; line-height: 1.6; }
  .cart-browse-btn { display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.8rem 1rem; border: 1px solid rgba(184,151,90,0.28); border-radius: 999px; background: var(--surface-elevated); box-shadow: var(--elev-1); }
  .cart-browse-icon { width: 1rem; height: 1rem; }
  .cart-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 380px); gap: 2rem; align-items: start; }
  @media (max-width: 860px) {
    .cart-layout { grid-template-columns: 1fr; }
  }
  .cart-items-column { min-width: 0; }
  .cart-items { display: flex; flex-direction: column; gap: 0.9rem; }
  .cart-item {
    background: linear-gradient(180deg, var(--surface), var(--surface-elevated));
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-md) + 4px);
    padding: 1rem;
    display: grid;
    grid-template-columns: 108px minmax(0, 1fr);
    gap: 1rem;
    box-shadow: var(--elev-1);
  }
  .cart-item-media { position: relative; aspect-ratio: 1 / 1; border-radius: calc(var(--radius-sm) + 4px); overflow: hidden; background: var(--cream-2); border: 1px solid rgba(184,151,90,0.14); }
  .cart-item-media img,
  .cart-item-media .storage-image { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cart-item-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--gold-dark); background: linear-gradient(135deg, var(--cream-2), var(--cream-3)); }
  .cart-item-placeholder svg { width: 28px; height: 28px; }
  .cart-item-content { min-width: 0; }
  .cart-item-topline { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .cart-item-info { min-width: 0; }
  .cart-item-info h3 { font-family: var(--font-display); font-size: 1.15rem; font-weight: 600; line-height: 1.25; }
  .cart-item-modifiers { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.55rem; }
  .cart-item-modifier-chip { font-size: 0.7rem; color: var(--ink-soft); background: rgba(184,151,90,0.1); border: 1px solid rgba(184,151,90,0.18); border-radius: 999px; padding: 0.28rem 0.55rem; }
  .cart-item-note { margin-top: 0.6rem; font-size: 0.8rem; line-height: 1.55; color: var(--ink-soft); }
  .cart-item-meta { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.7rem; }
  .cart-item-meta-pill { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: var(--ink-muted); padding: 0.35rem 0.55rem; border-radius: 999px; background: var(--surface-elevated); border: 1px solid var(--border); }
  .cart-item-meta-icon { width: 0.85rem; height: 0.85rem; }
  .cart-item-total-block { text-align: end; min-width: 112px; }
  .cart-item-total-label { display: block; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-muted); margin-bottom: 0.3rem; }
  .cart-item-total { font-size: 1rem; color: var(--gold-dark); }
  .cart-item-controls { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.95rem; }
  .qty-row { display: flex; align-items: center; gap: 0.75rem; border: 1px solid rgba(184,151,90,0.18); border-radius: 999px; padding: 0.2rem; background: var(--surface-elevated); }
  .qty-row button { width: 40px; height: 40px; font-size: 1.1rem; border-radius: 999px; background: var(--surface); border: 1px solid transparent; transition: border-color var(--transition), background var(--transition); }
  .qty-row button:hover { border-color: rgba(184,151,90,0.28); background: var(--cream); }
  .qty-row span { font-size: 0.9rem; font-weight: 600; min-width: 1.5rem; text-align: center; }
  .remove-btn { padding: 0.7rem 0.9rem; font-size: 0.78rem; font-weight: 600; color: var(--danger); border: 1px solid var(--danger-border); border-radius: 999px; background: var(--danger-muted); }
  .remove-btn:hover { background: color-mix(in srgb, var(--danger-muted) 84%, var(--surface)); }
  .cart-summary { background: linear-gradient(180deg, var(--surface), var(--surface-elevated)); border: 1px solid var(--border); border-radius: calc(var(--radius-md) + 4px); padding: 1.4rem; position: sticky; top: 120px; box-shadow: var(--elev-2); }
  .cart-summary-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.9rem; }
  .cart-summary-title { font-family: var(--font-display); font-size: 1.4rem; line-height: 1.15; }
  .cart-summary-count { font-size: 0.78rem; color: var(--ink-soft); background: rgba(184,151,90,0.12); border: 1px solid rgba(184,151,90,0.22); border-radius: 999px; padding: 0.35rem 0.65rem; white-space: nowrap; }
  .cart-summary-note { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.8rem 0.9rem; margin-bottom: 1.25rem; border-radius: var(--radius-sm); background: rgba(184,151,90,0.08); border: 1px solid rgba(184,151,90,0.16); color: var(--ink-soft); font-size: 0.8rem; line-height: 1.55; }
  .cart-summary-note-icon { width: 1rem; height: 1rem; color: var(--gold-dark); flex-shrink: 0; margin-top: 0.1rem; }
  .section-label { display: block; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 0.5rem; }
  .promo-section { margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
  .promo-input-row { display: flex; gap: 0.5rem; }
  .promo-input-row input { flex: 1; font-size: 0.875rem; font-weight: 500; letter-spacing: 0.05em; }
  .promo-apply-btn { padding: 0 1rem; background: var(--ink); color: var(--cream); border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 500; white-space: nowrap; }
  .promo-applied { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.6rem 0.75rem; background: rgba(184,151,90,0.1); border: 1px solid rgba(184,151,90,0.3); border-radius: var(--radius-sm); font-size: 0.875rem; font-weight: 500; color: var(--gold-dark); }
  .promo-applied button { font-size: 0.75rem; font-weight: 700; color: var(--ink); }
  .promo-error { font-size: 0.78rem; color: var(--danger); margin-top: 0.4rem; }
  .totals { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.5rem; }
  .total-row { display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--ink-soft); }
  .total-row.discount { color: var(--success); }
  .total-row.grand-total { font-size: 1.1rem; font-weight: 600; color: var(--ink); padding-top: 0.75rem; border-top: 1px solid var(--border); }
  .combo-summary-box { margin-bottom: 1.25rem; padding: 0.9rem; border-radius: var(--radius-md); background: rgba(184,151,90,0.08); border: 1px solid rgba(184,151,90,0.22); }
  .combo-summary-row { display: flex; justify-content: space-between; gap: 0.75rem; font-size: 0.82rem; color: var(--ink-soft); }
  .combo-summary-row + .combo-summary-row { margin-top: 0.45rem; }
  .combo-summary-row strong { color: var(--success); }
  .checkout-btn { width: 100%; padding: 1rem; background: var(--ink); color: var(--cream); border-radius: var(--radius-sm); font-size: 0.95rem; font-weight: 500; transition: background var(--transition); }
  .checkout-btn:hover { background: var(--gold); }
  .checkout-btn:disabled { opacity: 0.55; cursor: not-allowed; background: var(--ink-soft); }
  .checkout-warning { margin: 0 0 0.75rem; color: var(--warning); font-size: 0.85rem; line-height: 1.45; }
  .checkout-warning-inline { padding: 0.85rem 1rem; border-radius: var(--radius-md); background: rgba(184,151,90,0.1); border: 1px solid rgba(184,151,90,0.22); margin-bottom: 0.9rem; }
  .cart-mobile-bar { display: none; }
  .empty-state-shell {
    min-height: calc(100dvh - 16rem);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.25rem 4rem;
  }
  .empty-state {
    width: min(100%, 36rem);
    text-align: center;
    background: linear-gradient(180deg, var(--surface) 0%, var(--surface-elevated) 100%);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius-md) + 6px);
    box-shadow: var(--elev-2);
    padding: 2rem 1.5rem;
  }
  .empty-eyebrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(184, 151, 90, 0.12);
    color: var(--gold-dark);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 1rem;
  }
  .empty-icon {
    width: 5rem;
    height: 5rem;
    margin: 0 auto 1.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(184, 151, 90, 0.12);
    color: var(--gold-dark);
    border: 1px solid rgba(184, 151, 90, 0.24);
  }
  .empty-icon-svg {
    width: 2rem;
    height: 2rem;
  }
  .empty-title { font-family: var(--font-display); font-size: clamp(1.9rem, 5vw, 2.3rem); font-weight: 300; margin-bottom: 0.75rem; }
  .empty-desc { color: var(--ink-muted); margin: 0 auto 1.5rem; font-size: 1rem; line-height: 1.65; max-width: 30rem; }
  .empty-action-btn {
    min-height: 48px;
    padding: 0.9rem 1.25rem;
    background: var(--ink);
    color: var(--cream);
    border-radius: var(--radius-sm);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background var(--transition), transform var(--transition), box-shadow var(--transition);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
  }
  .empty-action-icon {
    width: 1rem;
    height: 1rem;
  }
  .empty-action-btn:hover { background: var(--gold); transform: translateY(-1px); }
  .empty-action-btn:focus-visible {
    outline: 3px solid rgba(184, 151, 90, 0.35);
    outline-offset: 3px;
  }
  .empty-note {
    margin-top: 1rem;
    color: var(--ink-soft);
    font-size: 0.82rem;
    line-height: 1.6;
  }

  @media (max-width: 860px) {
    .cart-page-head {
      flex-direction: column;
      align-items: stretch;
    }

    .cart-summary {
      position: static;
      top: auto;
    }

    .cart-mobile-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      position: fixed;
      left: 1rem;
      right: 1rem;
      bottom: 1rem;
      z-index: 120;
      padding: 0.85rem 0.9rem;
      border-radius: 18px;
      background: rgba(17,12,8,0.92);
      color: #fffaf0;
      box-shadow: 0 24px 50px rgba(0,0,0,0.22);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .cart-mobile-bar-copy {
      display: grid;
      gap: 0.15rem;
    }

    .cart-mobile-bar-label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(255,247,234,0.7);
    }

    .cart-mobile-bar-btn {
      min-height: 46px;
      padding: 0.8rem 1rem;
      border-radius: 999px;
      background: linear-gradient(135deg, #f2cc71, #caa04b);
      color: #22160a;
      font-weight: 800;
      white-space: nowrap;
    }

    .cart-mobile-bar-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  @media (max-width: 640px) {
    .cart-page {
      padding: 1.25rem 1rem 4rem;
    }

    .cart-item {
      grid-template-columns: 1fr;
    }

    .cart-item-media {
      aspect-ratio: 16 / 10;
    }

    .cart-item-topline,
    .cart-item-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .cart-item-total-block {
      text-align: start;
    }

    .qty-row {
      justify-content: space-between;
    }

    .remove-btn {
      width: 100%;
      min-height: 44px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
    }

    .promo-input-row,
    .combo-summary-row,
    .total-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .promo-apply-btn {
      min-height: 44px;
    }

    .cart-summary {
      padding: 1.15rem;
    }

    .empty-state-shell {
      min-height: calc(100dvh - 12rem);
      padding: 1.25rem 1rem 3rem;
    }

    .empty-state {
      padding: 1.5rem 1rem;
    }
  }
`
