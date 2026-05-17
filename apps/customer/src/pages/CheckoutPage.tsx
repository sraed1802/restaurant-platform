// apps/customer/src/pages/CheckoutPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeatureFlag, useTenantScope } from '@rms/platform'
import type { DeliveryAddress, OutsideDeliveryAddress } from '@rms/supabase/types'
import { isHotelRoomDeliveryAddress, isOutsideDeliveryAddress } from '@rms/supabase/fulfillment'
import { useCartStore } from '../store/cartStore'
import { useSessionStore } from '../store/sessionStore'
import { useCustomerPromotionContext } from '../hooks/useCustomerPromotionContext'
import { useRestaurantSettings } from '../hooks/useRestaurantSettings'
import { useOrderAvailability } from '../hooks/useOrderAvailability'
import { useFulfillmentSettings } from '../hooks/useFulfillmentSettings'
import { supabase } from '../lib/supabase'
import { placeOrderRequest } from '../services/checkout'
import { getPublicPaymentGatewaySettings } from '../services/paymentGatewaySettings'
import type { Promotion } from '../../types'
import { fetchCustomerProfileRow } from '../services/customerProfile'
import {
  fetchCustomerPromotionContext,
  getFirstOrderPromotionError,
  getPromotionDiscountAmount,
  isPromotionEligibleForCustomer,
} from '../services/promotionEligibility'

function buildSpecialInstructions(
  deliveryNotes: string,
  occasionNotes: string,
  kitchenLabel: { en: string; ar: string },
  language: 'en' | 'ar'
) {
  const label = language === 'ar' ? kitchenLabel.ar : kitchenLabel.en
  const parts: string[] = []
  if (deliveryNotes.trim()) parts.push(deliveryNotes.trim())
  if (occasionNotes.trim()) parts.push(`${label}: ${occasionNotes.trim()}`)
  return parts.join('\n\n')
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const tenantScope = useTenantScope()
  const { settings: restaurant } = useRestaurantSettings()
  const {
    language, phone, customerId, customerName, deliveryAddress,
    setPhone, setCustomerName, setDeliveryAddress, setPendingOrderId,
  } = useSessionStore()
  const lang = language === 'ar' ? 'ar' : 'en'

  const {
    items, subtotal, comboDiscountAmount, deliveryFeeValue, systemConfig,
    appliedPromotion, applyPromotion, removePromotion,
    appliedCombos, promoError, setPromoError, loadComboPromotions,
    clearCart,
  } = useCartStore()

  useEffect(() => {
    void loadComboPromotions()
  }, [loadComboPromotions])

  const stripePaymentsEnabled = useFeatureFlag('stripePayments')
  const { fulfillmentMode, loading: fulfillmentLoading } = useFulfillmentSettings()
  const { status: orderAvailabilityStatus, isOrderable } = useOrderAvailability()
  const {
    context: customerPromotionContext,
    loading: promotionContextLoading,
    error: promotionContextError,
  } = useCustomerPromotionContext(phone, customerId)
  const [checkoutStep, setCheckoutStep] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>('cash')
  const [instructions, setInstructions] = useState('')
  const [occasionNotes, setOccasionNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [applyingPromo, setApplyingPromo] = useState(false)
  const [stripeCheckoutEnabled, setStripeCheckoutEnabled] = useState<boolean>(stripePaymentsEnabled)
  const [isCompletingOrder, setIsCompletingOrder] = useState(false)
  const [address, setAddress] = useState<{
    street: string
    building: string
    floor: string
    apartment: string
    area: string
    city: string
    guest_name: string
    room_number: string
    hotel_name: string
  }>(() => {
    if (deliveryAddress && isHotelRoomDeliveryAddress(deliveryAddress)) {
      return {
        street: '',
        building: '',
        floor: '',
        apartment: '',
        area: deliveryAddress.area ?? '',
        city: deliveryAddress.city ?? 'Doha',
        guest_name: deliveryAddress.guest_name ?? (customerName ?? ''),
        room_number: deliveryAddress.room_number ?? '',
        hotel_name: deliveryAddress.hotel_name ?? '',
      }
    }

    return {
      street: deliveryAddress?.street ?? '',
      building: deliveryAddress?.building ?? '',
      floor: deliveryAddress?.floor ?? '',
      apartment: deliveryAddress?.apartment ?? '',
      area: deliveryAddress?.area ?? '',
      city: deliveryAddress?.city ?? 'Doha',
      guest_name: customerName ?? '',
      room_number: '',
      hotel_name: '',
    }
  })
  const [savedCheckoutAddresses, setSavedCheckoutAddresses] = useState<OutsideDeliveryAddress[]>([])
  const [selectedCheckoutAddressId, setSelectedCheckoutAddressId] = useState<string | null>(null)

  const isHotelRoomDelivery = fulfillmentMode === 'hotel_room_delivery'

  const currency = restaurant.currency_code || 'QAR'
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  function applySavedCheckoutAddress(id: string) {
    const a = savedCheckoutAddresses.find((x) => x.id === id)
    if (!a) return
    setSelectedCheckoutAddressId(id)
    setAddress((prev) => ({
      ...prev,
      street: a.street,
      building: a.building,
      floor: a.floor ?? '',
      apartment: a.apartment ?? '',
      area: a.area,
      city: a.city ?? 'Doha',
    }))
    setDeliveryAddress(a)
  }

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
  const baseDeliveryFee = effectiveAppliedPromotion?.discount_type === 'free_delivery'
    ? 0
    : systemConfig.freeDeliveryEnabled
      ? 0
      : deliveryFeeValue
  const effectiveDeliveryFee = isHotelRoomDelivery ? 0 : baseDeliveryFee
  const displayTotal = Math.max(0, subtotalAmount - totalDiscountAmount + effectiveDeliveryFee)
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
  const availablePaymentMethods = stripeCheckoutEnabled
    ? (['cash', 'card', 'online'] as const)
    : (['cash', 'card'] as const)

  useEffect(() => {
    let cancelled = false

    async function loadPaymentGatewaySettings() {
      try {
        const settings = await getPublicPaymentGatewaySettings()
        if (!cancelled) {
          setStripeCheckoutEnabled(stripePaymentsEnabled && settings.stripe_enabled)
        }
      } catch (gatewayError) {
        console.error('Failed to load payment gateway settings:', gatewayError)
        if (!cancelled) {
          setStripeCheckoutEnabled(stripePaymentsEnabled)
        }
      }
    }

    void loadPaymentGatewaySettings()

    return () => {
      cancelled = true
    }
  }, [stripePaymentsEnabled])

  useEffect(() => {
    if (!customerId || isHotelRoomDelivery) {
      setSavedCheckoutAddresses([])
      setSelectedCheckoutAddressId(null)
      return
    }
    let cancelled = false
    void fetchCustomerProfileRow(customerId).then((row) => {
      if (cancelled || !row?.delivery_addresses) return
      const outside = row.delivery_addresses.filter((a): a is OutsideDeliveryAddress => isOutsideDeliveryAddress(a))
      if (outside.length < 2) {
        setSavedCheckoutAddresses([])
        setSelectedCheckoutAddressId(null)
        return
      }
      setSavedCheckoutAddresses(outside)
      const def = outside.find((a) => a.is_default) ?? outside[0]
      const id = def?.id
      setSelectedCheckoutAddressId(id ?? null)
      if (def && id) {
        setAddress((prev) => ({
          ...prev,
          street: def.street,
          building: def.building,
          floor: def.floor ?? '',
          apartment: def.apartment ?? '',
          area: def.area,
          city: def.city ?? 'Doha',
        }))
        setDeliveryAddress(def)
      }
    })
    return () => {
      cancelled = true
    }
  }, [customerId, isHotelRoomDelivery])

  useEffect(() => {
    setAddress((current) => {
      if (isHotelRoomDelivery) {
        const savedHotelAddress = deliveryAddress && isHotelRoomDeliveryAddress(deliveryAddress)
          ? deliveryAddress
          : null

        return {
          ...current,
          street: '',
          building: '',
          floor: '',
          apartment: '',
          area: savedHotelAddress?.area ?? current.area,
          city: savedHotelAddress?.city ?? current.city,
          guest_name: savedHotelAddress?.guest_name ?? current.guest_name ?? customerName ?? '',
          room_number: savedHotelAddress?.room_number ?? current.room_number,
          hotel_name: savedHotelAddress?.hotel_name ?? current.hotel_name ?? restaurant.restaurant_name_en ?? '',
        }
      }

      if (deliveryAddress && !isHotelRoomDeliveryAddress(deliveryAddress)) {
        return {
          ...current,
          street: deliveryAddress.street ?? current.street,
          building: deliveryAddress.building ?? current.building,
          floor: deliveryAddress.floor ?? current.floor,
          apartment: deliveryAddress.apartment ?? current.apartment,
          area: deliveryAddress.area ?? current.area,
          city: deliveryAddress.city ?? current.city,
        }
      }

      return current
    })
  }, [customerName, deliveryAddress, isHotelRoomDelivery, restaurant.restaurant_name_en])
 
  useEffect(() => {
    // UX: keep the active step content centered in view.
    // The footer can be tall; without this, users often remain scrolled near the footer after clicking Continue.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [checkoutStep])

  useEffect(() => {
    if (!isCompletingOrder && items.length === 0) navigate('/menu')
  }, [isCompletingOrder, items.length, navigate])

  useEffect(() => {
    if (!stripeCheckoutEnabled && paymentMethod === 'online') {
      setPaymentMethod('cash')
    }
  }, [paymentMethod, stripeCheckoutEnabled])

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

  async function applyPromoCode() {
    if (!promoCode.trim()) return
    setApplyingPromo(true)
    setPromoError(null)
    try {
      const { data, error: queryErr } = await supabase
        .from('promotions')
        .select('*')
        .eq('code', promoCode.toUpperCase())
        .eq('is_active', true)
        .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
        .maybeSingle()

      if (queryErr || !data) {
        setPromoError(t('Invalid or expired promo code', 'رمز الخصم غير صالح أو منتهي الصلاحية'))
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

      if (promotion.min_order_value > 0 && subtotal() < promotion.min_order_value) {
        setPromoError(
          t(
            `Minimum order value: ${currency} ${promotion.min_order_value.toFixed(2)}`,
            `الحد الأدنى للطلب: ${promotion.min_order_value.toFixed(2)} ريال`
          )
        )
        return
      }
      if (promotion.usage_limit && promotion.usage_count >= promotion.usage_limit) {
        setPromoError(t('Promo code has reached its usage limit', 'استُنفد الحد الأقصى لاستخدام هذا الرمز'))
        return
      }
      applyPromotion(promotion)
      setPromoCode('')
    } catch {
      setPromoError(t('Failed to apply promo code', 'تعذّر تطبيق رمز الخصم'))
    } finally {
      setApplyingPromo(false)
    }
  }

  function validateStep1() {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    const normalizedPhone = phone.startsWith('+') ? phone : `+974${phone}`
    if (!phoneRegex.test(normalizedPhone)) {
      setError(t('Please enter a valid phone number', 'يرجى إدخال رقم هاتف صحيح'))
      return false
    }
    if (isHotelRoomDelivery) {
      if (!address.guest_name.trim() || !address.room_number.trim()) {
        setError(t('Please enter guest name and room number', 'يرجى إدخال اسم الضيف ورقم الغرفة'))
        return false
      }
    } else if (!address.street || !address.area || !address.building) {
      setError(t('Please fill in all required fields', 'يرجى ملء جميع الحقول المطلوبة'))
      return false
    }
    setError(null)
    return true
  }

  async function placeOrder() {
    if (!validateStep1()) return
    if (!isOrderable) {
      setError(closedMessage)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const special_instructions = buildSpecialInstructions(
        instructions,
        occasionNotes,
        { en: 'Occasion / room note', ar: 'مناسبة / غرفة' },
        lang
      )

      const deliveryAddressPayload: DeliveryAddress = isHotelRoomDelivery
        ? {
            mode: 'hotel_room_delivery',
            guest_name: address.guest_name.trim(),
            room_number: address.room_number.trim(),
            hotel_name: (address.hotel_name || restaurant.restaurant_name_en || '').trim() || undefined,
            area: (address.area || restaurant.contact_address_en || '').trim() || undefined,
            city: address.city || 'Doha',
            instructions: instructions.trim() || undefined,
          }
        : {
            mode: 'outside_delivery',
            street: address.street.trim(),
            building: address.building.trim(),
            floor: address.floor.trim() || undefined,
            apartment: address.apartment.trim() || undefined,
            area: address.area.trim(),
            city: address.city.trim() || 'Doha',
            instructions: instructions.trim() || undefined,
          }

      const payload = {
        phone_e164: phone.startsWith('+') ? phone : `+974${phone}`,
        customer_name: customerName,
        fulfillment_mode: fulfillmentMode,
        delivery_address: deliveryAddressPayload,
        items: items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          selected_modifier_option_ids: Object.values(item.selectedModifiers).flat(),
          notes: item.notes,
        })),
        promo_code: effectiveAppliedPromotion?.code ?? undefined,
        payment_method: paymentMethod,
        special_instructions,
        language_pref: language,
        tenant_scope: {
          organization_id: tenantScope.organizationId,
          cluster_id: tenantScope.clusterId,
          property_id: tenantScope.propertyId,
        },
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      const result = await placeOrderRequest(payload)
      if (!result.success || !result.order_id) {
        setError(result.public_message ?? result.error ?? t('Order failed', 'تعذّر تقديم الطلب'))
        return
      }
      const orderId = result.order_id

      setDeliveryAddress({
        ...deliveryAddressPayload,
        id: crypto.randomUUID(),
        label: isHotelRoomDelivery ? 'Room delivery' : 'Home',
        is_default: true,
      })
      setIsCompletingOrder(true)
      clearCart()

      if (result.payment_url) {
        setPendingOrderId(null)
        window.location.assign(result.payment_url)
        return
      }

      if (session?.user) {
        setPendingOrderId(null)
        navigate(`/track/${orderId}`, { replace: true })
        return
      }

      setPendingOrderId(orderId)
      navigate('/verify', { replace: true })
    } catch (err) {
      setIsCompletingOrder(false)
      setError(err instanceof Error ? err.message : t('Something went wrong', 'حدث خطأ ما'))
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0 && !isCompletingOrder) return null

  const steps = [
    { id: 1, en: isHotelRoomDelivery ? 'Guest & room' : 'Guest & delivery', ar: isHotelRoomDelivery ? 'الضيف والغرفة' : 'الضيف والتوصيل' },
    { id: 2, en: 'Payment & offers', ar: 'الدفع والعروض' },
    { id: 3, en: 'Confirm', ar: 'التأكيد' },
  ]

  return (
    <>
      <div className="checkout-page">
        <h1 className="page-title">{t('Checkout', 'إتمام الطلب')}</h1>

        <nav className="checkout-steps" aria-label={t('Checkout steps', 'خطوات الطلب')}>
            {steps.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`checkout-step ${checkoutStep === s.id ? 'current' : ''} ${checkoutStep > s.id ? 'done' : ''}`}
              onClick={() => {
                if (s.id < checkoutStep) {
                  setError(null)
                  setCheckoutStep(s.id)
                  return
                }
                if (!validateStep1()) return
                setCheckoutStep(s.id)
              }}
            >
              <span className="checkout-step-num">{s.id}</span>
              <span className="checkout-step-label">{t(s.en, s.ar)}</span>
            </button>
          ))}
        </nav>

        <div className="checkout-layout">
          <div className="checkout-form">
            {checkoutStep === 1 && (
              <>
                <section className="form-section">
                  <h2 className="form-section-title">{t('Contact Details', 'بيانات التواصل')}</h2>
                  <div className="field-group">
                    <label htmlFor="customer-name">{t('Name', 'الاسم')}</label>
                    <input
                      id="customer-name"
                      value={customerName ?? ''}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={t('Your name', 'اسمك')}
                      aria-label={t('Customer name', 'اسم العميل')}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="customer-phone">{t('Phone Number', 'رقم الهاتف')} *</label>
                    <input
                      id="customer-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+974 XXXX XXXX"
                      type="tel"
                      dir="ltr"
                      required
                      aria-label={t('Phone number', 'رقم الهاتف')}
                      aria-required="true"
                    />
                  </div>
                </section>

                <section className="form-section">
                  <h2 className="form-section-title">
                    {isHotelRoomDelivery
                      ? t('Room Delivery Details', 'تفاصيل التوصيل للغرفة')
                      : t('Delivery Address', 'عنوان التوصيل')}
                  </h2>
                  {fulfillmentLoading && (
                    <p className="checkout-mode-note">
                      {t('Loading property delivery mode…', 'جارٍ تحميل وضع التوصيل الخاص بالمنشأة…')}
                    </p>
                  )}
                  {isHotelRoomDelivery ? (
                    <>
                      <div className="field-group">
                        <label htmlFor="guest-name">{t('Guest Name', 'اسم الضيف')} *</label>
                        <input
                          id="guest-name"
                          value={address.guest_name}
                          onChange={(e) => setAddress((a) => ({ ...a, guest_name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="field-row">
                        <div className="field-group">
                          <label htmlFor="room-number">{t('Room Number', 'رقم الغرفة')} *</label>
                          <input
                            id="room-number"
                            value={address.room_number}
                            onChange={(e) => setAddress((a) => ({ ...a, room_number: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="field-group">
                          <label htmlFor="hotel-name">{t('Hotel / property', 'الفندق / العقار')}</label>
                          <input
                            id="hotel-name"
                            value={address.hotel_name}
                            onChange={(e) => setAddress((a) => ({ ...a, hotel_name: e.target.value }))}
                            placeholder={restaurant.restaurant_name_en || t('Hotel name', 'اسم الفندق')}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {savedCheckoutAddresses.length >= 2 && (
                        <div className="field-group">
                          <label htmlFor="saved-address-select">{t('Choose saved address', 'اختر عنواناً محفوظاً')}</label>
                          <select
                            id="saved-address-select"
                            value={selectedCheckoutAddressId ?? savedCheckoutAddresses[0]?.id ?? ''}
                            onChange={(e) => applySavedCheckoutAddress(e.target.value)}
                          >
                            {savedCheckoutAddresses.map((a) => (
                              <option key={a.id ?? a.street} value={a.id ?? ''}>
                                {(typeof a.label === 'string' && a.label.trim()
                                  ? a.label
                                  : `${a.street}, ${a.building}, ${a.area}`
                                ).slice(0, 72)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="field-group">
                        <label htmlFor="address-street">{t('Street', 'الشارع')} *</label>
                        <input
                          id="address-street"
                          value={address.street}
                          onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                          required
                          aria-label={t('Street address', 'عنوان الشارع')}
                          aria-required="true"
                        />
                      </div>
                      <div className="field-row">
                        <div className="field-group">
                          <label htmlFor="address-building">{t('Building', 'المبنى')} *</label>
                          <input
                            id="address-building"
                            value={address.building}
                            onChange={(e) => setAddress((a) => ({ ...a, building: e.target.value }))}
                            required
                            aria-label={t('Building number', 'رقم المبنى')}
                            aria-required="true"
                          />
                        </div>
                        <div className="field-group">
                          <label htmlFor="address-floor">{t('Floor', 'الطابق')}</label>
                          <input
                            id="address-floor"
                            value={address.floor}
                            onChange={(e) => setAddress((a) => ({ ...a, floor: e.target.value }))}
                            aria-label={t('Floor number', 'رقم الطابق')}
                          />
                        </div>
                        <div className="field-group">
                          <label htmlFor="address-apt">{t('Suite / room', 'الشقة / الغرفة')}</label>
                          <input
                            id="address-apt"
                            value={address.apartment}
                            onChange={(e) => setAddress((a) => ({ ...a, apartment: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="field-group">
                        <label htmlFor="address-area">{t('District', 'المنطقة')} *</label>
                        <input
                          id="address-area"
                          value={address.area}
                          onChange={(e) => setAddress((a) => ({ ...a, area: e.target.value }))}
                          placeholder="West Bay, Lusail, The Pearl…"
                          required
                        />
                      </div>
                    </>
                  )}
                  <div className="field-group">
                    <label htmlFor="delivery-notes">{t('Delivery Notes', 'ملاحظات التوصيل')}</label>
                    <textarea
                      id="delivery-notes"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      rows={2}
                      placeholder={t('Gate code, landmark, etc.', 'كود البوابة، معلم مميز…')}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="occasion-notes">
                      {isHotelRoomDelivery
                        ? t('Occasion or special request', 'مناسبة أو طلب خاص')
                        : t('Occasion or room number', 'مناسبة أو رقم الغرفة')}
                    </label>
                    <textarea
                      id="occasion-notes"
                      value={occasionNotes}
                      onChange={(e) => setOccasionNotes(e.target.value)}
                      rows={2}
                      placeholder={t('Anniversary table, Room 1201…', 'طاولة ذكرى، غرفة 1201…')}
                    />
                  </div>
                </section>

                <div className="checkout-step-actions">
                  <button type="button" className="checkout-next-btn" onClick={() => validateStep1() && setCheckoutStep(2)}>
                    {t('Continue', 'متابعة')}
                  </button>
                </div>
              </>
            )}

            {checkoutStep === 2 && (
              <>
                <section className="form-section">
                  <h2 className="form-section-title">{t('Payment Method', 'طريقة الدفع')}</h2>
                  <div className="payment-options">
                    {availablePaymentMethods.map((method) => (
                      <button
                        key={method}
                        type="button"
                        className={`payment-option ${paymentMethod === method ? 'active' : ''}`}
                        onClick={() => setPaymentMethod(method)}
                      >
                        <span className="payment-label-text">
                          {t(
                            method === 'cash'
                              ? 'Cash on delivery'
                              : method === 'online'
                                ? 'Pay online with Stripe'
                                : 'Card on delivery',
                            method === 'cash'
                              ? 'نقداً عند الاستلام'
                              : method === 'online'
                                ? 'ادفع أونلاين عبر سترايب'
                                : 'بطاقة عند الاستلام'
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="form-section">
                  <h2 className="form-section-title">{t('Promo Code', 'رمز الخصم')}</h2>
                  {effectiveAppliedPromotion ? (
                    <div className="applied-promo">
                      <div className="applied-promo-info">
                        <span className="applied-promo-code">{effectiveAppliedPromotion.code}</span>
                        <span className="applied-promo-name">{language === 'ar' ? effectiveAppliedPromotion.name_ar : effectiveAppliedPromotion.name_en}</span>
                        <span className="applied-promo-discount">
                          {effectiveAppliedPromotion.discount_type === 'percentage'
                            ? `${effectiveAppliedPromotion.discount_value}% OFF`
                            : effectiveAppliedPromotion.discount_type === 'free_delivery'
                              ? t('Free Delivery', 'توصيل مجاني')
                              : `${currency} ${effectiveAppliedPromotion.discount_value} OFF`}
                        </span>
                      </div>
                      <button type="button" className="remove-promo-btn" onClick={removePromotion}>
                        {t('Remove', 'إزالة')}
                      </button>
                    </div>
                  ) : (
                    <div className="promo-input-group">
                      <input
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder={t('Enter promo code', 'أدخل رمز الخصم')}
                        disabled={applyingPromo}
                        onKeyDown={(e) => e.key === 'Enter' && applyPromoCode()}
                      />
                      <button type="button" className="apply-promo-btn" onClick={applyPromoCode} disabled={applyingPromo || !promoCode.trim()}>
                        {applyingPromo ? t('Applying…', 'جارٍ التطبيق…') : t('Apply', 'تطبيق')}
                      </button>
                    </div>
                  )}
                  {promoError && <p className="promo-error">{promoError}</p>}
                </section>

                <div className="checkout-step-actions split">
                  <button type="button" className="checkout-back-btn" onClick={() => setCheckoutStep(1)}>
                    {t('Back', 'رجوع')}
                  </button>
                  <button type="button" className="checkout-next-btn" onClick={() => setCheckoutStep(3)}>
                    {t('Continue', 'متابعة')}
                  </button>
                </div>
              </>
            )}

            {checkoutStep === 3 && (
              <>
                <section className="form-section trust-panel">
                  <h2 className="form-section-title">{t('Concierge & policies', 'السياسات والمساعدة')}</h2>
                  <p className="trust-line">
                    <strong>{t('Questions?', 'استفسارات؟')}</strong>{' '}
                    <a href={`tel:${restaurant.contact_phone}`}>{restaurant.contact_phone}</a>
                    {restaurant.social_whatsapp ? (
                      <>
                        {' · '}
                        <a href={restaurant.social_whatsapp} target="_blank" rel="noopener noreferrer">
                          WhatsApp
                        </a>
                      </>
                    ) : null}
                  </p>
                  {(restaurant.cancellation_policy_en || restaurant.cancellation_policy_ar) && (
                    <p className="policy-snippet">
                      {language === 'ar'
                        ? restaurant.cancellation_policy_ar ?? restaurant.cancellation_policy_en
                        : restaurant.cancellation_policy_en ?? restaurant.cancellation_policy_ar}
                    </p>
                  )}
                  <p className="prep-estimate">
                    {t(
                      'Estimated preparation begins once your order is confirmed by the kitchen.',
                      'يبدأ تقدير وقت التحضير بعد تأكيد المطبخ لطلبك.'
                    )}
                  </p>
                </section>

                <div className="checkout-step-actions split">
                  <button type="button" className="checkout-back-btn" onClick={() => setCheckoutStep(2)}>
                    {t('Back', 'رجوع')}
                  </button>
                </div>

                {error && <div className="form-error">{error}</div>}
              </>
            )}
          </div>

          <aside className="checkout-summary">
            <h2 className="form-section-title">{t('Order Summary', 'ملخص الطلب')}</h2>
            <div className="summary-items">
              {items.map((item, idx) => (
                <div key={`${item.product.id}-${idx}`} className="summary-item">
                  <span className="summary-item-qty">{item.quantity}×</span>
                  <span className="summary-item-name">{language === 'ar' ? item.product.name_ar : item.product.name_en}</span>
                  <span className="summary-item-price">
                    {currency} {item.lineTotal.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="summary-totals">
              <div className="total-row">
                <span>{t('Subtotal', 'المجموع الفرعي')}</span>
                <span>
                  {currency} {subtotalAmount.toFixed(2)}
                </span>
              </div>
              {comboSavingsAmount > 0 && (
                <div className="total-row discount">
                  <span>{t('Combo savings', 'توفير الكومبو')}</span>
                  <span>
                    − {currency} {comboSavingsAmount.toFixed(2)}
                  </span>
                </div>
              )}
              {totalDiscountAmount > 0 && (
                <div className="total-row discount">
                  <span>{t('Total discounts', 'إجمالي الخصومات')}</span>
                  <span>
                    − {currency} {totalDiscountAmount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="total-row">
                <span>{isHotelRoomDelivery ? t('Room delivery', 'توصيل الغرفة') : t('Delivery', 'التوصيل')}</span>
                <span>
                  {(() => {
                    const isFree = isHotelRoomDelivery || effectiveDeliveryFee === 0
                    const fee = effectiveDeliveryFee
                    return isFree ? t('Free', 'مجاني') : `${currency} ${fee.toFixed(2)}`
                  })()}
                </span>
              </div>
              <div className="total-row grand">
                <span>{t('Total', 'الإجمالي')}</span>
                <span>
                  {currency} {displayTotal.toFixed(2)}
                </span>
              </div>
            </div>
            {appliedCombos.length > 0 && (
              <div className="checkout-combo-box">
                <h3>{t('Applied combos', 'الكومبوهات المطبقة')}</h3>
                {appliedCombos.map((combo) => (
                  <div key={combo.combo_promotion_id} className="checkout-combo-row">
                    <span>
                      {combo.quantity}× {language === 'ar' ? combo.name_ar : combo.name_en}
                    </span>
                    <strong>− {currency} {combo.savings.toFixed(2)}</strong>
                  </div>
                ))}
              </div>
            )}
            {!isOrderable && <div className="form-error">{closedMessage}</div>}
            <button
              type="button"
              className="place-order-btn"
              onClick={placeOrder}
              disabled={loading || checkoutStep !== 3 || !isOrderable}
              aria-label={loading ? t('Placing order...', 'جاري تقديم الطلب...') : t('Place order', 'تقديم الطلب')}
              aria-busy={loading}
            >
              {loading ? (
                <span className="btn-loading">
                  <Spinner />
                  {t('Placing Order…', 'جارٍ تقديم الطلب…')}
                </span>
              ) : (
                t('Place Order', 'تقديم الطلب')
              )}
            </button>
            <p className="checkout-note">
              {t('You will receive a verification code to confirm your order.', 'ستتلقى رمز تحقق لتأكيد طلبك.')}
            </p>
          </aside>
        </div>
      </div>
      <style>{`
      .checkout-page { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 6rem; }
      .page-title { font-family: var(--font-display); font-size: clamp(1.9rem, 5vw, 2.2rem); font-weight: 300; margin-bottom: 1.25rem; }
      .checkout-steps {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 1.5rem;
      }
      .checkout-step {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 0.85rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: var(--surface-elevated);
        cursor: pointer;
        font-size: 0.78rem;
        color: var(--ink-soft);
        text-align: start;
        transition: border-color var(--transition), background var(--transition);
      }
      .checkout-step.current {
        border-color: var(--gold);
        background: rgba(184, 151, 90, 0.08);
        color: var(--ink);
      }
      .checkout-step.done {
        border-color: var(--success);
        color: var(--success);
      }
      .checkout-step-num {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--ink);
        color: var(--cream);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.7rem;
        font-weight: 700;
        flex-shrink: 0;
      }
      .checkout-step.done .checkout-step-num {
        background: var(--success);
      }
      .checkout-step-label {
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .checkout-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 340px); gap: 2rem; align-items: start; }
      @media (max-width: 860px) { .checkout-layout { grid-template-columns: 1fr; } }
      .checkout-step-actions { margin-top: 1rem; display: flex; justify-content: flex-end; }
      .checkout-step-actions.split { justify-content: space-between; gap: 0.75rem; }
      .checkout-next-btn {
        padding: 0.75rem 1.5rem;
        background: var(--ink);
        color: var(--cream);
        border-radius: var(--radius-sm);
        font-size: 0.9rem;
        font-weight: 500;
      }
      .checkout-next-btn:hover { background: var(--gold); }
      .checkout-back-btn {
        padding: 0.75rem 1.25rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        font-size: 0.88rem;
        color: var(--ink-soft);
        background: transparent;
      }
      .trust-panel .trust-line { font-size: 0.88rem; color: var(--ink); margin-bottom: 0.75rem; line-height: 1.6; }
      .trust-panel .trust-line a { color: var(--gold-dark); font-weight: 600; }
      .policy-snippet { font-size: 0.78rem; color: var(--ink-muted); line-height: 1.55; margin-bottom: 0.75rem; }
      .prep-estimate { font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
      .form-section { background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 1rem; }
      .form-section-title { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 1rem; }
      .checkout-mode-note { margin: -0.4rem 0 1rem; font-size: 0.76rem; color: var(--ink-muted); }
      .field-group { margin-bottom: 0.75rem; }
      .field-group label { display: block; font-size: 0.78rem; font-weight: 500; color: var(--ink-soft); margin-bottom: 0.35rem; }
      .field-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; }
      .payment-options { display: flex; gap: 0.75rem; }
      .payment-option { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; border: 1.5px solid var(--border); border-radius: var(--radius-md); font-size: 0.82rem; font-weight: 500; transition: all var(--transition); background: var(--surface); color: var(--ink); }
      .payment-option:hover { border-color: var(--border-strong); }
      .payment-option.active { border-color: var(--gold); background: rgba(184,151,90,0.06); }
      .payment-label-text { text-align: center; }
      .promo-input-group { display: flex; gap: 0.5rem; }
      .promo-input-group input { flex: 1; font-size: 0.875rem; font-weight: 500; letter-spacing: 0.04em; }
      .apply-promo-btn { padding: 0 1rem; background: var(--ink); color: var(--cream); border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 500; white-space: nowrap; transition: background var(--transition); }
      .apply-promo-btn:hover:not(:disabled) { background: var(--gold); }
      .apply-promo-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .applied-promo { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1rem; background: var(--success-muted); border: 1px solid var(--success-border); border-radius: var(--radius-sm); }
      .applied-promo-info { display: flex; flex-direction: column; gap: 0.2rem; }
      .applied-promo-code { font-size: 0.75rem; font-weight: 700; color: var(--success); letter-spacing: 0.08em; }
      .applied-promo-name { font-size: 0.85rem; color: var(--ink); }
      .applied-promo-discount { font-size: 0.875rem; font-weight: 600; color: var(--gold-dark); }
      .remove-promo-btn { font-size: 0.75rem; color: var(--ink-muted); padding: 0.3rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); transition: all var(--transition); background: transparent; }
      .remove-promo-btn:hover { border-color: var(--danger); color: var(--danger); }
      .promo-error { margin-top: 0.5rem; font-size: 0.78rem; color: var(--danger); }
      .form-error { background: var(--danger-muted); border: 1px solid var(--danger-border); border-radius: var(--radius-sm); padding: 0.75rem 1rem; font-size: 0.875rem; color: var(--danger); margin-top: 0.5rem; }
      .checkout-summary { background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.5rem; position: sticky; top: 120px; }
      .summary-items { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
      .summary-item { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.85rem; }
      .summary-item-qty { color: var(--ink-muted); flex-shrink: 0; }
      .summary-item-name { flex: 1; color: var(--ink); }
      .summary-item-price { color: var(--ink-soft); flex-shrink: 0; }
      .summary-totals { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem; }
      .total-row { display: flex; justify-content: space-between; font-size: 0.875rem; color: var(--ink-soft); }
      .total-row.discount { color: var(--success); }
      .total-row.grand { font-size: 1.05rem; font-weight: 700; color: var(--ink); padding-top: 0.6rem; border-top: 1px solid var(--border); margin-top: 0.25rem; }
      .checkout-combo-box { margin-bottom: 1rem; padding: 0.85rem 0.95rem; border-radius: var(--radius-md); background: rgba(184,151,90,0.08); border: 1px solid rgba(184,151,90,0.22); }
      .checkout-combo-box h3 { font-size: 0.74rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.55rem; color: var(--ink-soft); }
      .checkout-combo-row { display: flex; justify-content: space-between; gap: 0.75rem; font-size: 0.82rem; color: var(--ink-soft); }
      .checkout-combo-row + .checkout-combo-row { margin-top: 0.4rem; }
      .checkout-combo-row strong { color: var(--success); }
      .place-order-btn { width: 100%; padding: 1rem; background: var(--ink); color: var(--cream); border-radius: var(--radius-sm); font-size: 0.95rem; font-weight: 500; transition: background var(--transition); cursor: pointer; border: none; }
      .place-order-btn:hover:not(:disabled) { background: var(--gold); }
      .place-order-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .btn-loading { display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
      .checkout-note { margin-top: 0.75rem; font-size: 0.72rem; color: var(--ink-muted); text-align: center; line-height: 1.5; }

      @media (max-width: 860px) {
        .checkout-summary {
          position: static;
          top: auto;
        }
      }

      @media (max-width: 720px) {
        .checkout-page {
          padding: 1.5rem 1rem 4rem;
        }

        .checkout-step {
          padding: 0.75rem 0.8rem;
        }

        .field-row,
        .payment-options,
        .promo-input-group,
        .checkout-step-actions.split {
          grid-template-columns: 1fr;
          flex-direction: column;
        }

        .checkout-step-actions,
        .checkout-step-actions.split {
          align-items: stretch;
        }

        .checkout-next-btn,
        .checkout-back-btn,
        .apply-promo-btn {
          width: 100%;
          min-height: 44px;
        }

        .applied-promo,
        .summary-item,
        .checkout-combo-row,
        .total-row {
          flex-wrap: wrap;
        }
      }

      @media (max-width: 560px) {
        .checkout-steps {
          display: grid;
          grid-template-columns: 1fr;
        }

        .checkout-step {
          width: 100%;
        }

        .form-section,
        .checkout-summary {
          padding: 1.1rem;
        }

        .selected-promo,
        .applied-promo {
          align-items: flex-start;
        }

        .payment-option {
          align-items: flex-start;
          text-align: start;
        }
      }
    `}</style>
    </>
  )
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}
