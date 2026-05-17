// apps/admin/src/pages/SettingsPage.tsx
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFeatureFlag, useTenantScope } from '@rms/platform'
import { supabase } from '../lib/supabase'
import ImageUpload from '../components/ImageUpload'
import ColorPicker from '../components/ColorPicker'
import SettingsTabNav from '../components/settings/SettingsTabNav'
import {
  DEFAULT_PAYMENT_GATEWAY_SETTINGS,
  getPaymentGatewaySettings,
  updatePaymentGatewaySettings,
  type PaymentGatewaySettings,
} from '../services/paymentGatewaySettings'
import {
  DEFAULT_OPERATOR_NOTIFICATION_SETTINGS,
  getOperatorNotificationSettings,
  parseRecipientList,
  updateOperatorNotificationSettings,
  type OperatorNotificationSettings,
} from '../services/operatorNotifications'
import {
  DEFAULT_ORDER_AVAILABILITY_SETTINGS,
  createEmptyOrderAvailabilityOverride,
  getOrderAvailabilitySettings,
  updateOrderAvailabilitySettings,
  type OrderAvailabilityOverride,
  type OrderAvailabilitySettings as OrderAvailabilityConfig,
  type OrderAvailabilityStatus,
} from '../services/orderAvailability'
import {
  DEFAULT_RESTAURANT_SETTINGS,
  getRestaurantSettings,
  updateRestaurantSettings,
  type RestaurantSettingsFormValues,
} from '../services/restaurantSettings'
import {
  getDeliveryFeeConfig,
  getFreeDeliveryConfig,
  updateDeliveryFeeConfig,
  updateFreeDeliveryConfig,
} from '../services/storeConfiguration'
import {
  DEFAULT_FULFILLMENT_SETTINGS,
  getFulfillmentSettings,
  updateFulfillmentSettings,
} from '../services/fulfillmentSettings'
import {
  getHotelGuestRosterSummary,
  lookupHotelGuestByRoom,
  parseHotelGuestRosterCsv,
  replaceHotelGuestRoster,
  type HotelGuestRosterEntry,
  type HotelGuestRosterSummary,
} from '../services/hotelGuestRoster'
import { guestAppPreviewSrc, resolveCustomerOrigin } from '../lib/customerOrigin'

const FONT_PRESETS: { label: string; font_family: string; heading_font: string }[] = [
  {
    label: 'Fine dining · Cormorant + DM Sans',
    font_family: "'DM Sans', system-ui, sans-serif",
    heading_font: "'Cormorant Garamond', Georgia, serif",
  },
  {
    label: 'Brasserie · Playfair + Inter',
    font_family: 'Inter, system-ui, sans-serif',
    heading_font: "'Playfair Display', serif",
  },
  {
    label: 'Minimal · Source Sans + Libre',
    font_family: "'Source Sans 3', system-ui, sans-serif",
    heading_font: "'Libre Baskerville', serif",
  },
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEGRAM_CHAT_ID_PATTERN = /^-?\d{5,20}$/
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function timeInputValue(value: string): string {
  return value.slice(0, 5)
}

function toStoredTimeValue(value: string, fallback: string): string {
  const normalized = value.trim()
  if (!normalized) return fallback
  return normalized.length === 5 ? `${normalized}:00` : normalized
}

function toDateTimeLocalValue(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function toIsoDateTimeValue(value: string, fallback: string): string {
  if (!value.trim()) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

type StaffRole = 'admin' | 'manager' | 'supervisor'
type SettingsTabId = 'branding' | 'ordering' | 'payments' | 'notifications' | 'security'

interface SettingsPageProps {
  staffRole?: StaffRole | null
}

export default function SettingsPage({ staffRole }: SettingsPageProps) {
  const queryClient = useQueryClient()
  const tenantScope = useTenantScope()
  const stripeFeatureFlagEnabled = useFeatureFlag('stripePayments')
  const hotelRoomDeliveryEnabled = useFeatureFlag('hotelRoomDelivery')
  const [activeTab, setActiveTab] = useState<SettingsTabId>('branding')
  const [deliveryFee, setDeliveryFee] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [freeDelivery, setFreeDelivery] = useState<boolean>(false)
  const [restaurantSettings, setRestaurantSettings] = useState<RestaurantSettingsFormValues>(DEFAULT_RESTAURANT_SETTINGS)
  const [savingRestaurant, setSavingRestaurant] = useState(false)
  const [operatorNotificationSettings, setOperatorNotificationSettings] = useState<OperatorNotificationSettings>(
    DEFAULT_OPERATOR_NOTIFICATION_SETTINGS
  )
  const [operatorNotificationsLoading, setOperatorNotificationsLoading] = useState(true)
  const [operatorNotificationsSaving, setOperatorNotificationsSaving] = useState(false)
  const [operatorNotificationsVisible, setOperatorNotificationsVisible] = useState(false)
  const [operatorCanEdit, setOperatorCanEdit] = useState(false)
  const [telegramTokenConfigured, setTelegramTokenConfigured] = useState(false)
  const [telegramTokenInput, setTelegramTokenInput] = useState('')
  const [paymentGatewaySettings, setPaymentGatewaySettings] = useState<PaymentGatewaySettings>(
    DEFAULT_PAYMENT_GATEWAY_SETTINGS
  )
  const [paymentGatewayLoading, setPaymentGatewayLoading] = useState(true)
  const [paymentGatewaySaving, setPaymentGatewaySaving] = useState(false)
  const [paymentGatewayVisible, setPaymentGatewayVisible] = useState(false)
  const [paymentGatewayCanEdit, setPaymentGatewayCanEdit] = useState(false)
  const [paymentGatewayError, setPaymentGatewayError] = useState<string | null>(null)
  const [orderAvailabilitySettings, setOrderAvailabilitySettings] = useState<OrderAvailabilityConfig>(
    DEFAULT_ORDER_AVAILABILITY_SETTINGS
  )
  const [orderAvailabilityStatus, setOrderAvailabilityStatus] = useState<OrderAvailabilityStatus | null>(null)
  const [orderAvailabilityLoading, setOrderAvailabilityLoading] = useState(true)
  const [orderAvailabilitySaving, setOrderAvailabilitySaving] = useState(false)
  const [orderAvailabilityVisible, setOrderAvailabilityVisible] = useState(false)
  const [orderAvailabilityCanEdit, setOrderAvailabilityCanEdit] = useState(false)
  const [orderAvailabilityError, setOrderAvailabilityError] = useState<string | null>(null)
  const [fulfillmentSettings, setFulfillmentSettings] = useState(DEFAULT_FULFILLMENT_SETTINGS)
  const [fulfillmentLoading, setFulfillmentLoading] = useState(hotelRoomDeliveryEnabled)
  const [fulfillmentSaving, setFulfillmentSaving] = useState(false)
  const [fulfillmentVisible, setFulfillmentVisible] = useState(hotelRoomDeliveryEnabled)
  const [fulfillmentCanEdit, setFulfillmentCanEdit] = useState(false)
  const [fulfillmentError, setFulfillmentError] = useState<string | null>(null)
  const [guestRosterSummary, setGuestRosterSummary] = useState<HotelGuestRosterSummary | null>(null)
  const [guestRosterLoading, setGuestRosterLoading] = useState(false)
  const [guestRosterUploading, setGuestRosterUploading] = useState(false)
  const [guestRosterError, setGuestRosterError] = useState<string | null>(null)
  const [guestRosterLookupRoom, setGuestRosterLookupRoom] = useState('')
  const [guestRosterLookupLoading, setGuestRosterLookupLoading] = useState(false)
  const [guestRosterLookupResults, setGuestRosterLookupResults] = useState<HotelGuestRosterEntry[]>([])

  useEffect(() => {
    loadSettings()
    loadFreeDeliverySetting()
    loadRestaurantSettings()
  }, [])

  useEffect(() => {
    if (staffRole !== 'admin') {
      setOperatorNotificationsVisible(false)
      setOperatorCanEdit(false)
      setOperatorNotificationsLoading(false)
      return
    }

    loadOperatorNotifications()
  }, [staffRole])

  useEffect(() => {
    if (staffRole !== 'admin' && staffRole !== 'manager') {
      setPaymentGatewayVisible(false)
      setPaymentGatewayCanEdit(false)
      setPaymentGatewayError(null)
      setPaymentGatewayLoading(false)
      return
    }

    setPaymentGatewayVisible(true)
    setPaymentGatewayCanEdit(staffRole === 'admin')
    void loadPaymentGatewayConfiguration()
  }, [staffRole])

  useEffect(() => {
    if (staffRole !== 'admin' && staffRole !== 'manager') {
      setOrderAvailabilityVisible(false)
      setOrderAvailabilityCanEdit(false)
      setOrderAvailabilityError(null)
      setOrderAvailabilityLoading(false)
      return
    }

    setOrderAvailabilityVisible(true)
    setOrderAvailabilityCanEdit(staffRole === 'admin')
    void loadOrderAvailabilityConfiguration()
  }, [staffRole, tenantScope.scopeKey])

  useEffect(() => {
    if (!hotelRoomDeliveryEnabled) {
      setFulfillmentVisible(false)
      setFulfillmentCanEdit(false)
      setFulfillmentLoading(false)
      setGuestRosterSummary(null)
      return
    }

    if (staffRole !== 'admin' && staffRole !== 'manager') {
      setFulfillmentVisible(false)
      setFulfillmentCanEdit(false)
      setFulfillmentLoading(false)
      setGuestRosterSummary(null)
      return
    }

    setFulfillmentVisible(true)
    setFulfillmentCanEdit(staffRole === 'admin')
    void loadFulfillmentConfiguration()
  }, [hotelRoomDeliveryEnabled, staffRole, tenantScope.scopeKey])

  const availableTabs: Array<{ id: SettingsTabId; label: string; description: string }> = [
    { id: 'branding', label: 'Branding', description: 'Identity, contact, theme, and guest-facing content' },
    { id: 'ordering', label: 'Ordering', description: 'Delivery, fulfillment mode, and availability' },
    ...(paymentGatewayVisible
      ? [{ id: 'payments' as const, label: 'Payments', description: 'Stripe checkout configuration' }]
      : []),
    ...(operatorNotificationsVisible
      ? [{ id: 'notifications' as const, label: 'Notifications', description: 'Operator email and Telegram alerts' }]
      : []),
    { id: 'security', label: 'Security', description: 'Password and account protection' },
  ]

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id ?? 'branding')
    }
  }, [activeTab, availableTabs])

  async function loadRestaurantSettings() {
    try {
      const settings = await getRestaurantSettings()
      setRestaurantSettings(settings)
    } catch (err) {
      console.error('Error loading restaurant settings:', err)
    }
  }

  async function loadOperatorNotifications() {
    setOperatorNotificationsLoading(true)
    try {
      const response = await getOperatorNotificationSettings()
      setOperatorNotificationSettings(response.settings)
      setTelegramTokenConfigured(response.telegram_token_configured)
      setOperatorCanEdit(response.can_edit)
      setOperatorNotificationsVisible(response.can_view)
    } catch (err) {
      console.error('Error loading operator notification settings:', err)
      setOperatorNotificationsVisible(false)
    } finally {
      setOperatorNotificationsLoading(false)
    }
  }

  async function loadPaymentGatewayConfiguration() {
    setPaymentGatewayLoading(true)
    setPaymentGatewayError(null)
    try {
      const response = await getPaymentGatewaySettings()
      setPaymentGatewaySettings(response.settings)
      setPaymentGatewayCanEdit(response.can_edit)
      setPaymentGatewayVisible(response.can_view)
    } catch (err) {
      console.error('Error loading payment gateway settings:', err)
      setPaymentGatewayVisible(true)
      setPaymentGatewayCanEdit(staffRole === 'admin')
      setPaymentGatewayError(
        'Payment gateway settings could not be loaded. Deploy the `manage-payment-gateway-settings` edge function to enable live configuration.'
      )
    } finally {
      setPaymentGatewayLoading(false)
    }
  }

  async function loadOrderAvailabilityConfiguration() {
    setOrderAvailabilityLoading(true)
    setOrderAvailabilityError(null)
    try {
      const response = await getOrderAvailabilitySettings(tenantScope)
      setOrderAvailabilitySettings(response.settings)
      setOrderAvailabilityStatus(response.status)
      setOrderAvailabilityCanEdit(response.can_edit)
      setOrderAvailabilityVisible(response.can_view)
    } catch (err) {
      console.error('Error loading order availability settings:', err)
      setOrderAvailabilityVisible(true)
      setOrderAvailabilityCanEdit(staffRole === 'admin')
      setOrderAvailabilityError(
        'Order availability settings could not be loaded. Deploy the `manage-order-availability` edge function to enable live configuration.'
      )
    } finally {
      setOrderAvailabilityLoading(false)
    }
  }

  async function loadFulfillmentConfiguration() {
    setFulfillmentLoading(true)
    setFulfillmentError(null)
    try {
      const response = await getFulfillmentSettings(tenantScope)
      setFulfillmentSettings(response.settings)
      setFulfillmentCanEdit(response.can_edit)
      setFulfillmentVisible(response.can_view)

      if (response.settings.fulfillment_mode === 'hotel_room_delivery') {
        await loadGuestRosterSummary()
      } else {
        setGuestRosterSummary(null)
        setGuestRosterError(null)
        setGuestRosterLookupResults([])
      }
    } catch (err) {
      console.error('Error loading fulfillment settings:', err)
      setFulfillmentVisible(true)
      setFulfillmentCanEdit(staffRole === 'admin')
      setFulfillmentError(
        'Fulfillment settings could not be loaded. Deploy the `manage-fulfillment-settings` edge function to enable hotel room delivery configuration.'
      )
    } finally {
      setFulfillmentLoading(false)
    }
  }

  async function loadGuestRosterSummary() {
    setGuestRosterLoading(true)
    setGuestRosterError(null)
    try {
      const summary = await getHotelGuestRosterSummary(tenantScope)
      setGuestRosterSummary(summary)
    } catch (err) {
      console.error('Error loading hotel guest roster summary:', err)
      setGuestRosterError(
        err instanceof Error ? err.message : 'Hotel guest roster could not be loaded.'
      )
    } finally {
      setGuestRosterLoading(false)
    }
  }

  async function loadSettings() {
    try {
      const fee = await getDeliveryFeeConfig()
      setDeliveryFee(fee)
    } catch (err) {
      console.error('Error loading settings:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadFreeDeliverySetting() {
    try {
      const isEnabled = await getFreeDeliveryConfig()
      setFreeDelivery(isEnabled)
    } catch (err) {
      console.error('Error loading free delivery setting:', err)
    }
  }

  async function saveDeliveryFee() {
    setSaving(true)
    setMessage(null)
    
    try {
      await updateDeliveryFeeConfig(Number(deliveryFee))
      setMessage({ text: 'Delivery fee saved successfully', type: 'success' })
    } catch (err) {
      setMessage({ text: 'Error saving delivery fee', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleFreeDelivery() {
    setSaving(true)
    setMessage(null)
    
    try {
      const newValue = !freeDelivery
      await updateFreeDeliveryConfig(newValue)
      setMessage({ text: `Free delivery ${newValue ? 'enabled' : 'disabled'}`, type: 'success' })
      setFreeDelivery(newValue)
    } catch (err) {
      console.error('Error toggling free delivery:', err)
      setMessage({ text: 'Error toggling free delivery', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function updatePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ text: 'Passwords do not match', type: 'error' })
      return
    }
    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword })
    if (error) {
      setMessage({ text: error.message, type: 'error' })
    } else {
      setMessage({ text: 'Password updated successfully', type: 'success' })
      setPasswordForm({ newPassword: '', confirmPassword: '' })
    }
    setPasswordLoading(false)
  }

  async function saveRestaurantSettings() {
    setSavingRestaurant(true)
    setMessage(null)
    
    try {
      const savedSettings = await updateRestaurantSettings(restaurantSettings)
      setRestaurantSettings(savedSettings)
      void queryClient.invalidateQueries({ queryKey: ['public_restaurant_branding'] })
      void queryClient.invalidateQueries({ queryKey: ['restaurant_settings'] })
      setMessage({ text: 'Restaurant settings saved successfully', type: 'success' })
    } catch (err) {
      console.error('Error saving restaurant settings:', err)
      setMessage({ text: 'Error saving restaurant settings', type: 'error' })
    } finally {
      setSavingRestaurant(false)
    }
  }

  async function saveOperatorNotifications(clearTelegramToken = false) {
    const invalidEmails = operatorNotificationSettings.email_recipients.filter(
      (recipient) => !EMAIL_PATTERN.test(recipient)
    )
    if (invalidEmails.length > 0) {
      setMessage({ text: `Invalid email recipients: ${invalidEmails.join(', ')}`, type: 'error' })
      return
    }

    const invalidChatIds = operatorNotificationSettings.telegram_chat_ids.filter(
      (chatId) => !TELEGRAM_CHAT_ID_PATTERN.test(chatId)
    )
    if (invalidChatIds.length > 0) {
      setMessage({ text: `Invalid Telegram chat IDs: ${invalidChatIds.join(', ')}`, type: 'error' })
      return
    }

    if (clearTelegramToken && operatorNotificationSettings.telegram_enabled) {
      setMessage({ text: 'Disable Telegram notifications before clearing the Telegram token.', type: 'error' })
      return
    }

    setOperatorNotificationsSaving(true)
    setMessage(null)

    try {
      const response = await updateOperatorNotificationSettings({
        settings: operatorNotificationSettings,
        telegram_bot_token: clearTelegramToken ? undefined : (telegramTokenInput.trim() || undefined),
        clear_telegram_token: clearTelegramToken,
      })

      setOperatorNotificationSettings(response.settings)
      setTelegramTokenConfigured(response.telegram_token_configured)
      setOperatorCanEdit(response.can_edit)
      setTelegramTokenInput('')
      setMessage({
        text: clearTelegramToken ? 'Telegram token reset successfully' : 'Operator notification settings saved successfully',
        type: 'success',
      })
    } catch (err) {
      console.error('Error saving operator notifications:', err)
      setMessage({
        text: err instanceof Error ? err.message : 'Error saving operator notification settings',
        type: 'error',
      })
    } finally {
      setOperatorNotificationsSaving(false)
    }
  }

  async function savePaymentGatewayConfiguration() {
    setPaymentGatewaySaving(true)
    setMessage(null)
    setPaymentGatewayError(null)

    try {
      const response = await updatePaymentGatewaySettings({
        settings: paymentGatewaySettings,
      })
      setPaymentGatewaySettings(response.settings)
      setPaymentGatewayCanEdit(response.can_edit)
      setPaymentGatewayVisible(response.can_view)
      setMessage({ text: 'Payment gateway settings saved successfully', type: 'success' })
    } catch (err) {
      console.error('Error saving payment gateway settings:', err)
      setPaymentGatewayError(
        err instanceof Error
          ? err.message
          : 'Payment gateway settings could not be saved.'
      )
      setMessage({
        text: err instanceof Error ? err.message : 'Error saving payment gateway settings',
        type: 'error',
      })
    } finally {
      setPaymentGatewaySaving(false)
    }
  }

  async function saveOrderAvailabilityConfiguration() {
    if (!orderAvailabilitySettings.timezone.trim()) {
      setMessage({ text: 'Timezone is required for order availability settings.', type: 'error' })
      return
    }

    for (const window of orderAvailabilitySettings.weekly_windows) {
      if (!window.is_enabled) continue
      if (window.closes_at <= window.opens_at) {
        setMessage({
          text: `${WEEKDAY_LABELS[window.day_of_week]} close time must be after open time.`,
          type: 'error',
        })
        return
      }
    }

    for (const override of orderAvailabilitySettings.overrides) {
      if (!override.starts_at || !override.ends_at) {
        setMessage({ text: 'Every override requires a start and end date-time.', type: 'error' })
        return
      }

      if (new Date(override.ends_at).getTime() <= new Date(override.starts_at).getTime()) {
        setMessage({ text: 'Override end date-time must be after the start date-time.', type: 'error' })
        return
      }
    }

    setOrderAvailabilitySaving(true)
    setMessage(null)
    setOrderAvailabilityError(null)

    try {
      const response = await updateOrderAvailabilitySettings({
        scope: tenantScope,
        settings: orderAvailabilitySettings,
      })
      setOrderAvailabilitySettings(response.settings)
      setOrderAvailabilityStatus(response.status)
      setOrderAvailabilityCanEdit(response.can_edit)
      setOrderAvailabilityVisible(response.can_view)
      setMessage({ text: 'Order availability settings saved successfully', type: 'success' })
    } catch (err) {
      console.error('Error saving order availability settings:', err)
      const messageText =
        err instanceof Error ? err.message : 'Order availability settings could not be saved.'
      setOrderAvailabilityError(messageText)
      setMessage({ text: messageText, type: 'error' })
    } finally {
      setOrderAvailabilitySaving(false)
    }
  }

  async function saveFulfillmentConfiguration() {
    setFulfillmentSaving(true)
    setMessage(null)
    setFulfillmentError(null)

    try {
      const response = await updateFulfillmentSettings({
        scope: tenantScope,
        settings: fulfillmentSettings,
      })
      setFulfillmentSettings(response.settings)
      setFulfillmentCanEdit(response.can_edit)
      setFulfillmentVisible(response.can_view)
      setMessage({ text: 'Fulfillment settings saved successfully', type: 'success' })

      if (response.settings.fulfillment_mode === 'hotel_room_delivery') {
        await loadGuestRosterSummary()
      } else {
        setGuestRosterSummary(null)
        setGuestRosterLookupResults([])
      }
    } catch (err) {
      console.error('Error saving fulfillment settings:', err)
      const messageText =
        err instanceof Error ? err.message : 'Fulfillment settings could not be saved.'
      setFulfillmentError(messageText)
      setMessage({ text: messageText, type: 'error' })
    } finally {
      setFulfillmentSaving(false)
    }
  }

  async function uploadGuestRoster(file: File | null) {
    if (!file) return

    setGuestRosterUploading(true)
    setGuestRosterError(null)
    setMessage(null)

    try {
      const csvText = await file.text()
      const rows = parseHotelGuestRosterCsv(csvText)
      const summary = await replaceHotelGuestRoster({
        scope: tenantScope,
        rows,
        sourceFileName: file.name,
      })
      setGuestRosterSummary(summary)
      setGuestRosterLookupResults([])
      setMessage({
        text: `Replaced the previous guest roster with ${summary.entry_count} entries.`,
        type: 'success',
      })
    } catch (err) {
      console.error('Error uploading hotel guest roster:', err)
      const messageText = err instanceof Error ? err.message : 'Hotel guest roster upload failed.'
      setGuestRosterError(messageText)
      setMessage({ text: messageText, type: 'error' })
    } finally {
      setGuestRosterUploading(false)
    }
  }

  async function lookupGuestRoster() {
    if (!guestRosterLookupRoom.trim()) {
      setGuestRosterLookupResults([])
      return
    }

    setGuestRosterLookupLoading(true)
    setGuestRosterError(null)
    try {
      const entries = await lookupHotelGuestByRoom({
        scope: tenantScope,
        roomNumber: guestRosterLookupRoom.trim(),
      })
      setGuestRosterLookupResults(entries)
    } catch (err) {
      console.error('Error looking up hotel guest roster:', err)
      setGuestRosterError(err instanceof Error ? err.message : 'Guest lookup failed.')
      setGuestRosterLookupResults([])
    } finally {
      setGuestRosterLookupLoading(false)
    }
  }

  function describeOrderAvailabilityStatus(status: OrderAvailabilityStatus | null): string {
    if (!status) return 'No live availability preview yet.'
    if (status.is_open_now) {
      switch (status.reason) {
        case 'force_open':
          return 'Open now via manual force-open override.'
        case 'override_open':
          return 'Open now via an active date override.'
        default:
          return 'Open now according to the current schedule.'
      }
    }

    const nextOpenLabel = status.next_open_at
      ? ` Next open: ${new Date(status.next_open_at).toLocaleString()}.`
      : ''

    switch (status.reason) {
      case 'force_closed':
        return `Closed now via manual force-closed override.${nextOpenLabel}`
      case 'override_closed':
        return `Closed now due to an active date override.${nextOpenLabel}`
      default:
        return `Closed now outside scheduled hours.${nextOpenLabel}`
    }
  }

  function updateWeeklyWindow(
    dayOfWeek: number,
    updater: (current: typeof orderAvailabilitySettings.weekly_windows[number]) => typeof orderAvailabilitySettings.weekly_windows[number]
  ) {
    setOrderAvailabilitySettings((current) => ({
      ...current,
      weekly_windows: current.weekly_windows.map((window) =>
        window.day_of_week === dayOfWeek ? updater(window) : window
      ),
    }))
  }

  function updateOverrideAt(index: number, updater: (current: OrderAvailabilityOverride) => OrderAvailabilityOverride) {
    setOrderAvailabilitySettings((current) => ({
      ...current,
      overrides: current.overrides.map((override, overrideIndex) =>
        overrideIndex === index ? updater(override) : override
      ),
    }))
  }

  return (
    <div className="settings-page">
      <h1 className="page-title">Settings</h1>
      
      {message && (
        <div className={`message-banner ${message.type}`}>
          {message.text}
        </div>
      )}

      <SettingsTabNav
        tabs={availableTabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as SettingsTabId)}
      />

      <div className="settings-grid">
        {activeTab === 'branding' && (
        <>
        {/* Restaurant Settings */}
        <section className="settings-section" style={{ gridColumn: '1 / -1' }}>
          <h2 className="section-title">Restaurant Branding & Contact</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            <div className="field-group" style={{ gridColumn: '1 / -1' }}>
              <label>Restaurant Logo</label>
              {restaurantSettings.logo_url && (
                <div style={{ marginBottom: '1rem' }}>
                  <img 
                    src={restaurantSettings.logo_url} 
                    alt="Restaurant Logo" 
                    style={{ maxWidth: '150px', maxHeight: '150px', objectFit: 'contain' }}
                  />
                </div>
              )}
              <ImageUpload
                value={restaurantSettings.logo_url}
                onChange={(url) => setRestaurantSettings(s => ({ ...s, logo_url: url }))}
                label="Restaurant Logo"
                bucket="menu"
              />
            </div>

            <div className="field-group" style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.75rem' }}>
                Installed apps and native loading
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
                These assets apply to the customer, admin, and driver Android shells (welcome screen, boot loading, and
                admin sidebar). Launcher icon and app display name on the home screen are still set at build time in
                Android; in-app titles and loading copy follow the values below.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1.25rem',
                }}
              >
                <div className="field-group">
                  <label>Admin sidebar logo</label>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Top-left in the admin app. Falls back to the main restaurant logo if empty.
                  </p>
                  <ImageUpload
                    value={restaurantSettings.admin_shell_logo_url}
                    onChange={(url) => setRestaurantSettings((s) => ({ ...s, admin_shell_logo_url: url || null }))}
                    label="Upload admin shell logo"
                    bucket="menu"
                  />
                </div>
                <div className="field-group">
                  <label>Customer welcome wordmark</label>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Shown on the customer app welcome screen (prefer horizontal / transparent PNG).
                  </p>
                  <ImageUpload
                    value={restaurantSettings.welcome_logo_url}
                    onChange={(url) => setRestaurantSettings((s) => ({ ...s, welcome_logo_url: url || null }))}
                    label="Upload welcome logo"
                    bucket="menu"
                  />
                </div>
                <div className="field-group">
                  <label>Native loading image</label>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Splash-style graphic while the WebView loads (all apps). Falls back to the main logo.
                  </p>
                  <ImageUpload
                    value={restaurantSettings.loading_logo_url}
                    onChange={(url) => setRestaurantSettings((s) => ({ ...s, loading_logo_url: url || null }))}
                    label="Upload loading image"
                    bucket="menu"
                  />
                </div>
                <div className="field-group">
                  <label>Driver app logo</label>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Shown while the driver app boots. Falls back to the loading image, then the main logo.
                  </p>
                  <ImageUpload
                    value={restaurantSettings.driver_shell_logo_url}
                    onChange={(url) => setRestaurantSettings((s) => ({ ...s, driver_shell_logo_url: url || null }))}
                    label="Upload driver logo"
                    bucket="menu"
                  />
                </div>
                <div className="field-group">
                  <label>Native loading text (English)</label>
                  <input
                    type="text"
                    value={restaurantSettings.native_loading_text_en ?? ''}
                    onChange={(e) =>
                      setRestaurantSettings((s) => ({ ...s, native_loading_text_en: e.target.value || null }))
                    }
                    placeholder="e.g. Preparing your experience…"
                  />
                </div>
                <div className="field-group">
                  <label>Native loading text (Arabic)</label>
                  <input
                    type="text"
                    value={restaurantSettings.native_loading_text_ar ?? ''}
                    onChange={(e) =>
                      setRestaurantSettings((s) => ({ ...s, native_loading_text_ar: e.target.value || null }))
                    }
                    placeholder="اختياري"
                  />
                </div>
              </div>
            </div>
            
            <div className="field-group">
              <label>Restaurant Name (English)</label>
              <input 
                type="text"
                value={restaurantSettings.restaurant_name_en}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, restaurant_name_en: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Restaurant Name (Arabic)</label>
              <input 
                type="text"
                value={restaurantSettings.restaurant_name_ar}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, restaurant_name_ar: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Tagline (English)</label>
              <input 
                type="text"
                value={restaurantSettings.restaurant_tagline_en}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, restaurant_tagline_en: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Tagline (Arabic)</label>
              <input 
                type="text"
                value={restaurantSettings.restaurant_tagline_ar}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, restaurant_tagline_ar: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Contact Phone</label>
              <input 
                type="tel"
                value={restaurantSettings.contact_phone}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, contact_phone: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Contact Email</label>
              <input 
                type="email"
                value={restaurantSettings.contact_email}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, contact_email: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Address (English)</label>
              <input 
                type="text"
                value={restaurantSettings.contact_address_en || ''}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, contact_address_en: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Address (Arabic)</label>
              <input 
                type="text"
                value={restaurantSettings.contact_address_ar || ''}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, contact_address_ar: e.target.value }))}
              />
            </div>
            
            <div className="field-group">
              <label>Currency Code</label>
              <input 
                type="text"
                value={restaurantSettings.currency_code}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, currency_code: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>Guest experience</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={restaurantSettings.enable_service_dine_in}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, enable_service_dine_in: e.target.checked }))}
                />
                Dine-in
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={restaurantSettings.enable_service_takeaway}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, enable_service_takeaway: e.target.checked }))}
                />
                Takeaway
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={restaurantSettings.enable_service_delivery}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, enable_service_delivery: e.target.checked }))}
                />
                Delivery
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div className="field-group">
                <label>Hero title (English)</label>
                <input
                  type="text"
                  value={restaurantSettings.hero_title_en ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, hero_title_en: e.target.value || null }))}
                  placeholder="Optional — overrides restaurant name on menu hero"
                />
              </div>
              <div className="field-group">
                <label>Hero title (Arabic)</label>
                <input
                  type="text"
                  value={restaurantSettings.hero_title_ar ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, hero_title_ar: e.target.value || null }))}
                />
              </div>
              <div className="field-group">
                <label>Hero subtitle (English)</label>
                <input
                  type="text"
                  value={restaurantSettings.hero_subtitle_en ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, hero_subtitle_en: e.target.value || null }))}
                />
              </div>
              <div className="field-group">
                <label>Hero subtitle (Arabic)</label>
                <input
                  type="text"
                  value={restaurantSettings.hero_subtitle_ar ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, hero_subtitle_ar: e.target.value || null }))}
                />
              </div>
              <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                <label>Hero image</label>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Use a wide landscape image (roughly 21:9). It appears above the menu as editorial hero art.
                </p>
                <ImageUpload
                  value={restaurantSettings.hero_image_url}
                  onChange={(url) => setRestaurantSettings((s) => ({ ...s, hero_image_url: url || null }))}
                  label="Upload hero image"
                  bucket="menu"
                />
              </div>
              <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                <label>Cancellation policy (English)</label>
                <textarea
                  rows={2}
                  value={restaurantSettings.cancellation_policy_en ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, cancellation_policy_en: e.target.value || null }))}
                  placeholder="Shown on checkout confirmation step"
                />
              </div>
              <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                <label>Cancellation policy (Arabic)</label>
                <textarea
                  rows={2}
                  value={restaurantSettings.cancellation_policy_ar ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, cancellation_policy_ar: e.target.value || null }))}
                />
              </div>
              <div className="field-group">
                <label>Meta description (English)</label>
                <textarea
                  rows={2}
                  value={restaurantSettings.meta_description_en ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, meta_description_en: e.target.value || null }))}
                  placeholder="SEO / sharing description"
                />
              </div>
              <div className="field-group">
                <label>Meta description (Arabic)</label>
                <textarea
                  rows={2}
                  value={restaurantSettings.meta_description_ar ?? ''}
                  onChange={(e) => setRestaurantSettings((s) => ({ ...s, meta_description_ar: e.target.value || null }))}
                />
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>Social Media Links</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="field-group">
                <label>Facebook</label>
                <input 
                  type="url"
                  value={restaurantSettings.social_facebook || ''}
                  onChange={(e) => setRestaurantSettings(s => ({ ...s, social_facebook: e.target.value }))}
                />
              </div>
              
              <div className="field-group">
                <label>Instagram</label>
                <input 
                  type="url"
                  value={restaurantSettings.social_instagram || ''}
                  onChange={(e) => setRestaurantSettings(s => ({ ...s, social_instagram: e.target.value }))}
                />
              </div>
              
              <div className="field-group">
                <label>Twitter</label>
                <input 
                  type="url"
                  value={restaurantSettings.social_twitter || ''}
                  onChange={(e) => setRestaurantSettings(s => ({ ...s, social_twitter: e.target.value }))}
                />
              </div>
              
              <div className="field-group">
                <label>WhatsApp</label>
                <input 
                  type="url"
                  value={restaurantSettings.social_whatsapp || ''}
                  onChange={(e) => setRestaurantSettings(s => ({ ...s, social_whatsapp: e.target.value }))}
                />
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>Delivery Banner</h3>
            <div className="field-group">
              <label className="toggle-label">
                <span>Show Delivery Banner</span>
                <div className="toggle-switch">
                  <input 
                    type="checkbox"
                    checked={restaurantSettings.delivery_banner_enabled}
                    onChange={(e) => setRestaurantSettings(s => ({ ...s, delivery_banner_enabled: e.target.checked }))}
                  />
                  <span className="toggle-slider"></span>
                </div>
              </label>
            </div>
            
            {restaurantSettings.delivery_banner_enabled && (
              <>
                <div className="field-group">
                  <label>Banner Text (English)</label>
                  <input 
                    type="text"
                    value={restaurantSettings.delivery_banner_text_en || ''}
                    onChange={(e) => setRestaurantSettings(s => ({ ...s, delivery_banner_text_en: e.target.value }))}
                  />
                </div>
                
                <div className="field-group">
                  <label>Banner Text (Arabic)</label>
                  <input 
                    type="text"
                    value={restaurantSettings.delivery_banner_text_ar || ''}
                    onChange={(e) => setRestaurantSettings(s => ({ ...s, delivery_banner_text_ar: e.target.value }))}
                  />
                </div>
                
                <div className="field-group">
                  <label>Delivery Threshold</label>
                  <input 
                    type="number"
                    value={restaurantSettings.delivery_threshold}
                    onChange={(e) => setRestaurantSettings(s => ({ ...s, delivery_threshold: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </>
            )}
          </div>
          
          <div className="button-group" style={{ marginTop: '1.5rem' }}>
            <button className="btn btn-primary" onClick={saveRestaurantSettings} disabled={savingRestaurant}>
              {savingRestaurant ? 'Saving...' : 'Save Restaurant Settings'}
            </button>
          </div>
        </section>

        {/* Color Scheme */}
        <section className="settings-section" style={{ gridColumn: '1 / -1' }}>
          <h2 className="section-title">Color Scheme & Fonts</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            <ColorPicker
              label="Primary Color"
              value={restaurantSettings.primary_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, primary_color: color }))}
              placeholder="#b8975a"
            />
            
            <ColorPicker
              label="Secondary Color"
              value={restaurantSettings.secondary_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, secondary_color: color }))}
              placeholder="#d4a574"
            />
            
            <ColorPicker
              label="Accent Color"
              value={restaurantSettings.accent_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, accent_color: color }))}
              placeholder="#c19a6b"
            />
            
            <ColorPicker
              label="Background Color"
              value={restaurantSettings.background_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, background_color: color }))}
              placeholder="#faf8f4"
            />
            
            <ColorPicker
              label="Surface Color"
              value={restaurantSettings.surface_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, surface_color: color }))}
              placeholder="#ffffff"
            />
            
            <ColorPicker
              label="Text Color"
              value={restaurantSettings.text_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, text_color: color }))}
              placeholder="#2c1810"
            />
            
            <ColorPicker
              label="Text Muted Color"
              value={restaurantSettings.text_muted_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, text_muted_color: color }))}
              placeholder="#6b5d54"
            />
            
            <ColorPicker
              label="Border Color"
              value={restaurantSettings.border_color}
              onChange={(color) => setRestaurantSettings(s => ({ ...s, border_color: color }))}
              placeholder="#e5ddd5"
            />

            <p style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
              For accessibility, pair text colors with enough contrast against background and surface (aim for WCAG AA).
            </p>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Font presets
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {FONT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.72rem' }}
                    onClick={() =>
                      setRestaurantSettings((s) => ({
                        ...s,
                        font_family: p.font_family,
                        heading_font: p.heading_font,
                      }))
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="field-group">
              <label>Font Family</label>
              <select 
                value={restaurantSettings.font_family}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, font_family: e.target.value }))}
              >
                <option value="Inter, system-ui, sans-serif">Inter</option>
                <option value="Roboto, system-ui, sans-serif">Roboto</option>
                <option value="Open Sans, system-ui, sans-serif">Open Sans</option>
                <option value="Lato, system-ui, sans-serif">Lato</option>
                <option value="Montserrat, system-ui, sans-serif">Montserrat</option>
                <option value="'DM Sans', system-ui, sans-serif">DM Sans</option>
              </select>
            </div>
            
            <div className="field-group">
              <label>Heading Font</label>
              <select 
                value={restaurantSettings.heading_font}
                onChange={(e) => setRestaurantSettings(s => ({ ...s, heading_font: e.target.value }))}
              >
                <option value="Playfair Display, serif">Playfair Display</option>
                <option value="Roboto Slab, serif">Roboto Slab</option>
                <option value="Merriweather, serif">Merriweather</option>
                <option value="Oswald, sans-serif">Oswald</option>
                <option value="Bebas Neue, cursive">Bebas Neue</option>
                <option value="'Cormorant Garamond', Georgia, serif">Cormorant Garamond</option>
              </select>
            </div>
          </div>
          
          <div className="button-group" style={{ marginTop: '1.5rem' }}>
            <button className="btn btn-primary" onClick={saveRestaurantSettings} disabled={savingRestaurant}>
              {savingRestaurant ? 'Saving...' : 'Save Color Scheme'}
            </button>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Guest app preview</h3>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Run <code>npm run dev:customer</code> so this iframe can load the guest app. Preview URL:{' '}
              <code>{resolveCustomerOrigin()}</code> (from <code>apps/admin/.env</code> — set{' '}
              <code>VITE_CUSTOMER_ORIGIN</code> or <code>VITE_SITE_URL</code> to the same value as{' '}
              <code>VITE_SITE_URL</code> in <code>apps/customer/.env</code>).
            </p>
            <iframe
              title="Guest ordering preview"
              src={guestAppPreviewSrc()}
              style={{
                width: '100%',
                height: 560,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-2)',
              }}
            />
          </div>
        </section>
        </>
        )}

        {/* System Config */}
        {activeTab === 'ordering' && (
        <>
        <section className="settings-section">
          <h2 className="section-title">Store Configuration</h2>
          <div className="field-group">
            <label>Delivery Fee (QAR)</label>
            <input 
              type="number" 
              step="0.01"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
              disabled={freeDelivery}
            />
          </div>
          <div className="field-group">
            <label className="toggle-label">
              <span>Free Delivery</span>
              <div className="toggle-switch">
                <input 
                  type="checkbox"
                  checked={freeDelivery}
                  onChange={toggleFreeDelivery}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <p className="toggle-description">
              Enable to waive delivery fees and show "Free Delivery" at checkout
            </p>
          </div>
          <div className="button-group">
            <button className="btn btn-primary" onClick={saveDeliveryFee} disabled={saving || loading || freeDelivery}>
              {saving ? 'Saving...' : 'Save Delivery Fee'}
            </button>
            <button className="btn btn-secondary" onClick={toggleFreeDelivery} disabled={saving || loading}>
              {saving ? 'Saving...' : (freeDelivery ? 'Disable Free Delivery' : 'Enable Free Delivery')}
            </button>
          </div>
        </section>

        {fulfillmentVisible && (
        <section className="settings-section" style={{ gridColumn: '1 / -1' }}>
          <h2 className="section-title">Delivery Mode</h2>
          <p className="section-note">
            Choose how this property fulfills delivery orders. Outside delivery keeps the current address and driver
            workflow. Hotel room delivery simplifies checkout to guest name and room number, then lets operations
            complete orders without assigning a driver.
          </p>

          {fulfillmentError && (
            <div className="info-banner">
              {fulfillmentError}
            </div>
          )}

          {fulfillmentLoading ? (
            <div className="loading-state">Loading fulfillment settings...</div>
          ) : (
            <>
              {!hotelRoomDeliveryEnabled && (
                <div className="info-banner">
                  Hotel room delivery is disabled by the app feature flag, so guests will continue using outside
                  delivery until the feature is enabled at runtime.
                </div>
              )}

              <div className="field-group">
                <label>Fulfillment mode</label>
                <select
                  value={fulfillmentSettings.fulfillment_mode}
                  disabled={!fulfillmentCanEdit || fulfillmentSaving || !hotelRoomDeliveryEnabled}
                  onChange={(e) =>
                    setFulfillmentSettings({
                      fulfillment_mode: e.target.value === 'hotel_room_delivery'
                        ? 'hotel_room_delivery'
                        : 'outside_delivery',
                    })
                  }
                >
                  <option value="outside_delivery">Outside delivery</option>
                  <option value="hotel_room_delivery">Hotel room delivery</option>
                </select>
                <p className="field-hint">
                  This setting is property-scoped through the active tenant context and is structured so per-order mode
                  selection can be added later.
                </p>
              </div>

              <div className="button-group">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={saveFulfillmentConfiguration}
                  disabled={!fulfillmentCanEdit || fulfillmentSaving || !hotelRoomDeliveryEnabled}
                >
                  {fulfillmentSaving ? 'Saving...' : 'Save Delivery Mode'}
                </button>
              </div>

              {fulfillmentSettings.fulfillment_mode === 'hotel_room_delivery' && (
                <div className="guest-roster-panel">
                  <div className="guest-roster-header">
                    <div>
                      <h3 className="guest-roster-title">Hotel guest roster</h3>
                      <p className="field-hint" style={{ marginTop: '0.2rem' }}>
                        Upload a CSV so operations can quickly match room numbers with guest records on the backend.
                        Required columns: <code>room_number</code> and <code>guest_name</code>.
                      </p>
                    </div>
                    <div className="guest-roster-meta">
                      <span className={`status-pill ${guestRosterSummary?.entry_count ? 'configured' : 'missing'}`}>
                        {guestRosterSummary?.entry_count ? `${guestRosterSummary.entry_count} guests` : 'No roster uploaded'}
                      </span>
                    </div>
                  </div>

                  {guestRosterError && (
                    <div className="info-banner" style={{ marginBottom: '1rem' }}>
                      {guestRosterError}
                    </div>
                  )}

                  <div className="guest-roster-grid">
                    <div className="field-group">
                      <label>Upload guest list CSV</label>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        disabled={!fulfillmentCanEdit || guestRosterUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          void uploadGuestRoster(file)
                          e.currentTarget.value = ''
                        }}
                      />
                      <p className="field-hint">
                        Uploading a new file replaces the current roster for this property.
                      </p>
                    </div>

                    <div className="field-group">
                      <label>Lookup room number</label>
                      <div className="guest-roster-lookup">
                        <input
                          type="text"
                          value={guestRosterLookupRoom}
                          onChange={(e) => setGuestRosterLookupRoom(e.target.value)}
                          placeholder="e.g. 2104"
                        />
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={lookupGuestRoster}
                          disabled={guestRosterLookupLoading}
                        >
                          {guestRosterLookupLoading ? 'Searching...' : 'Find Guest'}
                        </button>
                      </div>
                      <p className="field-hint">
                        Use this to confirm guest details when a room delivery order comes in.
                      </p>
                    </div>
                  </div>

                  {guestRosterLoading ? (
                    <div className="loading-state">Loading guest roster summary...</div>
                  ) : guestRosterSummary && (
                    <div className="info-banner" style={{ marginBottom: '1rem' }}>
                      {guestRosterSummary.entry_count > 0 ? (
                        <>
                          Latest roster upload:{' '}
                          <strong>{guestRosterSummary.last_source_file_name ?? 'Unnamed CSV'}</strong>
                          {guestRosterSummary.last_uploaded_at && (
                            <> on {new Date(guestRosterSummary.last_uploaded_at).toLocaleString()}</>
                          )}
                        </>
                      ) : (
                        'No guest roster has been uploaded for this property yet.'
                      )}
                    </div>
                  )}

                  {guestRosterLookupResults.length > 0 && (
                    <div className="guest-roster-results">
                      {guestRosterLookupResults.map((entry) => (
                        <div key={entry.id} className="guest-roster-result-card">
                          <strong>{entry.guest_name}</strong>
                          <span>Room {entry.room_number}</span>
                          {entry.phone && <span>{entry.phone}</span>}
                          {entry.email && <span>{entry.email}</span>}
                          {(entry.check_in_date || entry.check_out_date) && (
                            <span>
                              {entry.check_in_date ?? 'Open'} to {entry.check_out_date ?? 'Open'}
                            </span>
                          )}
                          {entry.notes && <span>{entry.notes}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {guestRosterLookupRoom.trim() && !guestRosterLookupLoading && guestRosterLookupResults.length === 0 && !guestRosterError && (
                    <p className="field-hint">No guest roster entry was found for that room number.</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
        )}

        </>
        )}

        {activeTab === 'payments' && paymentGatewayVisible && (
        <section className="settings-section">
          <h2 className="section-title">Payment Gateway</h2>
          <p className="section-note">
            Control whether Stripe-hosted checkout is available to guests. This setting governs the
            <strong> online payment</strong> option; card-on-delivery and cash flows stay unchanged.
          </p>

          {paymentGatewayError && (
            <div className="info-banner">
              {paymentGatewayError}
            </div>
          )}

          {!stripeFeatureFlagEnabled && (
            <div className="info-banner">
              Stripe checkout is still gated by the app feature flag. Saving this configuration prepares the admin
              runtime setting, but guests will not see online payment until the feature flag is enabled too.
            </div>
          )}

          {paymentGatewayLoading ? (
            <div className="loading-state">Loading payment gateway settings...</div>
          ) : (
            <>
              <div className="field-group">
                <label className="toggle-label">
                  <span>Enable Stripe checkout</span>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={paymentGatewaySettings.stripe_enabled}
                      disabled={!paymentGatewayCanEdit || paymentGatewaySaving}
                      onChange={(e) =>
                        setPaymentGatewaySettings((current) => ({
                          ...current,
                          stripe_enabled: e.target.checked,
                        }))
                      }
                    />
                    <span className="toggle-slider"></span>
                  </div>
                </label>
                <p className="toggle-description">
                  When disabled, the customer checkout page hides online payment and the order API rejects Stripe
                  checkout attempts.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div className="field-group">
                  <label>Stripe mode</label>
                  <select
                    value={paymentGatewaySettings.stripe_mode}
                    disabled={!paymentGatewayCanEdit || paymentGatewaySaving}
                    onChange={(e) =>
                      setPaymentGatewaySettings((current) => ({
                        ...current,
                        stripe_mode: e.target.value === 'live' ? 'live' : 'test',
                      }))
                    }
                  >
                    <option value="test">Test</option>
                    <option value="live">Live</option>
                  </select>
                  <p className="field-hint">
                    Informational for now, so future rollout can distinguish test and production Stripe credentials.
                  </p>
                </div>

                <div className="field-group">
                  <label>Checkout label</label>
                  <input
                    type="text"
                    value={paymentGatewaySettings.checkout_label}
                    disabled={!paymentGatewayCanEdit || paymentGatewaySaving}
                    onChange={(e) =>
                      setPaymentGatewaySettings((current) => ({
                        ...current,
                        checkout_label: e.target.value,
                      }))
                    }
                    placeholder="Pay online with Stripe"
                  />
                  <p className="field-hint">
                    Saved for future storefront customization and gateway management.
                  </p>
                </div>
              </div>

              {!paymentGatewayCanEdit && (
                <p className="field-hint" style={{ marginTop: '0.75rem' }}>
                  Only admin users can update payment gateway settings.
                </p>
              )}

              <div className="button-group">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={savePaymentGatewayConfiguration}
                  disabled={!paymentGatewayCanEdit || paymentGatewaySaving}
                >
                  {paymentGatewaySaving ? 'Saving...' : 'Save Payment Gateway Settings'}
                </button>
              </div>
            </>
          )}
        </section>
        )}

        {activeTab === 'ordering' && (
        <>
        {orderAvailabilityVisible && (
        <section className="settings-section" style={{ gridColumn: '1 / -1' }}>
          <h2 className="section-title">Order Availability</h2>
          <p className="section-note">
            Control whether this property accepts orders right now, follows a recurring weekly schedule, or uses
            one-off date overrides for closures and special opening windows.
          </p>

          {orderAvailabilityError && (
            <div className="info-banner">
              {orderAvailabilityError}
            </div>
          )}

          {orderAvailabilityStatus && (
            <div className="info-banner" style={{ marginBottom: '1rem' }}>
              <strong>{orderAvailabilityStatus.is_open_now ? 'Open now.' : 'Closed now.'}</strong>{' '}
              {describeOrderAvailabilityStatus(orderAvailabilityStatus)}
            </div>
          )}

          {orderAvailabilityLoading ? (
            <div className="loading-state">Loading order availability settings...</div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div className="field-group">
                  <label>Availability mode</label>
                  <select
                    value={orderAvailabilitySettings.manual_mode}
                    disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                    onChange={(e) =>
                      setOrderAvailabilitySettings((current) => ({
                        ...current,
                        manual_mode: e.target.value === 'scheduled' || e.target.value === 'force_closed'
                          ? e.target.value
                          : 'force_open',
                      }))
                    }
                  >
                    <option value="force_open">Force Open</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="force_closed">Force Closed</option>
                  </select>
                  <p className="field-hint">
                    Force open/closed overrides the weekly schedule until you switch back to scheduled mode.
                  </p>
                </div>

                <div className="field-group">
                  <label>Timezone</label>
                  <input
                    type="text"
                    value={orderAvailabilitySettings.timezone}
                    disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                    onChange={(e) =>
                      setOrderAvailabilitySettings((current) => ({
                        ...current,
                        timezone: e.target.value,
                      }))
                    }
                    placeholder="Asia/Qatar"
                  />
                  <p className="field-hint">Use an IANA timezone name such as `Asia/Qatar`.</p>
                </div>

                <div className="field-group">
                  <label>Closure message (English)</label>
                  <textarea
                    rows={2}
                    value={orderAvailabilitySettings.closure_message_en ?? ''}
                    disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                    onChange={(e) =>
                      setOrderAvailabilitySettings((current) => ({
                        ...current,
                        closure_message_en: e.target.value,
                      }))
                    }
                    placeholder="Orders are currently closed."
                  />
                </div>

                <div className="field-group">
                  <label>Closure message (Arabic)</label>
                  <textarea
                    rows={2}
                    value={orderAvailabilitySettings.closure_message_ar ?? ''}
                    disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                    onChange={(e) =>
                      setOrderAvailabilitySettings((current) => ({
                        ...current,
                        closure_message_ar: e.target.value,
                      }))
                    }
                    placeholder="الطلبات مغلقة حالياً."
                  />
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>Weekly schedule</h3>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {orderAvailabilitySettings.weekly_windows.map((window) => (
                    <div
                      key={window.day_of_week}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(120px, 160px) minmax(0, 1fr) minmax(0, 1fr)',
                        gap: '0.75rem',
                        alignItems: 'end',
                      }}
                    >
                      <label className="toggle-label" style={{ marginBottom: 0 }}>
                        <span>{WEEKDAY_LABELS[window.day_of_week]}</span>
                        <div className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={window.is_enabled}
                            disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                            onChange={(e) =>
                              updateWeeklyWindow(window.day_of_week, (current) => ({
                                ...current,
                                is_enabled: e.target.checked,
                              }))
                            }
                          />
                          <span className="toggle-slider"></span>
                        </div>
                      </label>

                      <div className="field-group" style={{ marginBottom: 0 }}>
                        <label>Opens</label>
                        <input
                          type="time"
                          value={timeInputValue(window.opens_at)}
                          disabled={!window.is_enabled || !orderAvailabilityCanEdit || orderAvailabilitySaving}
                          onChange={(e) =>
                            updateWeeklyWindow(window.day_of_week, (current) => ({
                              ...current,
                              opens_at: toStoredTimeValue(e.target.value, current.opens_at),
                            }))
                          }
                        />
                      </div>

                      <div className="field-group" style={{ marginBottom: 0 }}>
                        <label>Closes</label>
                        <input
                          type="time"
                          value={timeInputValue(window.closes_at)}
                          disabled={!window.is_enabled || !orderAvailabilityCanEdit || orderAvailabilitySaving}
                          onChange={(e) =>
                            updateWeeklyWindow(window.day_of_week, (current) => ({
                              ...current,
                              closes_at: toStoredTimeValue(e.target.value, current.closes_at),
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>Date overrides</h3>
                    <p className="field-hint" style={{ margin: 0 }}>
                      Add temporary closures or temporary openings for specific dates and times.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                    onClick={() =>
                      setOrderAvailabilitySettings((current) => ({
                        ...current,
                        overrides: [...current.overrides, createEmptyOrderAvailabilityOverride()],
                      }))
                    }
                  >
                    Add Override
                  </button>
                </div>

                {orderAvailabilitySettings.overrides.length === 0 ? (
                  <p className="field-hint">No date overrides configured yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {orderAvailabilitySettings.overrides.map((override, index) => (
                      <div
                        key={`${override.id ?? 'new'}-${index}`}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '1rem',
                          background: 'var(--surface-elevated)',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: '1rem',
                          }}
                        >
                          <div className="field-group">
                            <label>Label</label>
                            <input
                              type="text"
                              value={override.label ?? ''}
                              disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                              onChange={(e) =>
                                updateOverrideAt(index, (current) => ({
                                  ...current,
                                  label: e.target.value,
                                }))
                              }
                              placeholder="Holiday closure"
                            />
                          </div>

                          <div className="field-group">
                            <label>Mode</label>
                            <select
                              value={override.mode}
                              disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                              onChange={(e) =>
                                updateOverrideAt(index, (current) => ({
                                  ...current,
                                  mode: e.target.value === 'open' ? 'open' : 'closed',
                                }))
                              }
                            >
                              <option value="closed">Closed</option>
                              <option value="open">Open</option>
                            </select>
                          </div>

                          <div className="field-group">
                            <label>Starts at</label>
                            <input
                              type="datetime-local"
                              value={toDateTimeLocalValue(override.starts_at)}
                              disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                              onChange={(e) =>
                                updateOverrideAt(index, (current) => ({
                                  ...current,
                                  starts_at: toIsoDateTimeValue(e.target.value, current.starts_at),
                                }))
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label>Ends at</label>
                            <input
                              type="datetime-local"
                              value={toDateTimeLocalValue(override.ends_at)}
                              disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                              onChange={(e) =>
                                updateOverrideAt(index, (current) => ({
                                  ...current,
                                  ends_at: toIsoDateTimeValue(e.target.value, current.ends_at),
                                }))
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label>Message (English)</label>
                            <textarea
                              rows={2}
                              value={override.message_en ?? ''}
                              disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                              onChange={(e) =>
                                updateOverrideAt(index, (current) => ({
                                  ...current,
                                  message_en: e.target.value,
                                }))
                              }
                              placeholder="Closed for private event"
                            />
                          </div>

                          <div className="field-group">
                            <label>Message (Arabic)</label>
                            <textarea
                              rows={2}
                              value={override.message_ar ?? ''}
                              disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                              onChange={(e) =>
                                updateOverrideAt(index, (current) => ({
                                  ...current,
                                  message_ar: e.target.value,
                                }))
                              }
                              placeholder="مغلق لفعالية خاصة"
                            />
                          </div>
                        </div>

                        <div className="button-group" style={{ marginTop: '0.75rem' }}>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                            onClick={() =>
                              setOrderAvailabilitySettings((current) => ({
                                ...current,
                                overrides: current.overrides.filter((_, overrideIndex) => overrideIndex !== index),
                              }))
                            }
                          >
                            Remove Override
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!orderAvailabilityCanEdit && (
                <p className="field-hint" style={{ marginTop: '0.75rem' }}>
                  Only admin users can update order availability settings.
                </p>
              )}

              <div className="button-group">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={saveOrderAvailabilityConfiguration}
                  disabled={!orderAvailabilityCanEdit || orderAvailabilitySaving}
                >
                  {orderAvailabilitySaving ? 'Saving...' : 'Save Order Availability'}
                </button>
              </div>
            </>
          )}
        </section>
        )}
        </>
        )}

        {activeTab === 'notifications' && operatorNotificationsVisible && (
        <section className="settings-section" style={{ gridColumn: '1 / -1' }}>
          <h2 className="section-title">Operator Notifications</h2>
          <p className="section-note">
            Admin and manager staff receive in-app order alerts automatically. Email and Telegram delivery use the
            configured recipient lists below, but only admins can view and manage this configuration.
          </p>

          {operatorNotificationsLoading ? (
            <div className="loading-state">Loading operator notification settings...</div>
          ) : (
            <>
              <div className="operator-settings-grid">
                <div className="field-group">
                  <label className="toggle-label">
                    <span>Notify on order received</span>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={operatorNotificationSettings.notify_on_order_created}
                        disabled={!operatorCanEdit || operatorNotificationsSaving}
                        onChange={(e) =>
                          setOperatorNotificationSettings((current) => ({
                            ...current,
                            notify_on_order_created: e.target.checked,
                          }))
                        }
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </label>
                </div>

                <div className="field-group">
                  <label className="toggle-label">
                    <span>Notify on order cancelled</span>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={operatorNotificationSettings.notify_on_order_cancelled}
                        disabled={!operatorCanEdit || operatorNotificationsSaving}
                        onChange={(e) =>
                          setOperatorNotificationSettings((current) => ({
                            ...current,
                            notify_on_order_cancelled: e.target.checked,
                          }))
                        }
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </label>
                </div>

                <div className="field-group">
                  <label className="toggle-label">
                    <span>Email delivery</span>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={operatorNotificationSettings.email_enabled}
                        disabled={!operatorCanEdit || operatorNotificationsSaving}
                        onChange={(e) =>
                          setOperatorNotificationSettings((current) => ({
                            ...current,
                            email_enabled: e.target.checked,
                          }))
                        }
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </label>
                  <textarea
                    rows={4}
                    value={operatorNotificationSettings.email_recipients.join('\n')}
                    disabled={!operatorCanEdit || operatorNotificationsSaving}
                    onChange={(e) =>
                      setOperatorNotificationSettings((current) => ({
                        ...current,
                        email_recipients: parseRecipientList(e.target.value.toLowerCase()),
                      }))
                    }
                    placeholder={'ops@example.com\nmanager@example.com'}
                  />
                  <p className="field-hint">Add one email per line or separate them with commas.</p>
                </div>

                <div className="field-group">
                  <label className="toggle-label">
                    <span>Telegram delivery</span>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={operatorNotificationSettings.telegram_enabled}
                        disabled={!operatorCanEdit || operatorNotificationsSaving}
                        onChange={(e) =>
                          setOperatorNotificationSettings((current) => ({
                            ...current,
                            telegram_enabled: e.target.checked,
                          }))
                        }
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </label>
                  <textarea
                    rows={4}
                    value={operatorNotificationSettings.telegram_chat_ids.join('\n')}
                    disabled={!operatorCanEdit || operatorNotificationsSaving}
                    onChange={(e) =>
                      setOperatorNotificationSettings((current) => ({
                        ...current,
                        telegram_chat_ids: parseRecipientList(e.target.value),
                      }))
                    }
                    placeholder={'-1001234567890\n123456789'}
                  />
                  <p className="field-hint">Use numeric chat IDs only. One per line or comma separated.</p>
                </div>
              </div>

              <div className="operator-token-panel">
                <div className="operator-token-header">
                  <div>
                    <h3 className="operator-token-title">Telegram bot token</h3>
                    <p className="field-hint" style={{ marginTop: '0.2rem' }}>
                      The token is stored in a private encrypted secrets table and never saved in plaintext in public tables.
                    </p>
                  </div>
                  <span className={`status-pill ${telegramTokenConfigured ? 'configured' : 'missing'}`}>
                    {telegramTokenConfigured ? 'Configured' : 'Not configured'}
                  </span>
                </div>

                <form
                  className="operator-token-actions"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveOperatorNotifications(false)
                  }}
                >
                  <input type="text" name="username" autoComplete="username" value="operator-notifications" readOnly hidden />
                  <input
                    type="password"
                    name="telegram_token"
                    autoComplete="new-password"
                    value={telegramTokenInput}
                    disabled={!operatorCanEdit || operatorNotificationsSaving}
                    onChange={(e) => setTelegramTokenInput(e.target.value)}
                    placeholder={telegramTokenConfigured ? 'Enter a new token to replace the current one' : 'Enter Telegram bot token'}
                  />

                  <div className="button-group">
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={!operatorCanEdit || operatorNotificationsSaving}
                    >
                      {operatorNotificationsSaving ? 'Saving...' : 'Save Operator Notifications'}
                    </button>
                    {telegramTokenConfigured && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        disabled={!operatorCanEdit || operatorNotificationsSaving}
                        onClick={() => saveOperatorNotifications(true)}
                      >
                        Reset Telegram Token
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </>
          )}
        </section>
        )}

        {/* Profile / Password */}
        {activeTab === 'security' && (
        <section className="settings-section">
          <h2 className="section-title">Account Security</h2>
          <form onSubmit={(e) => { e.preventDefault(); updatePassword(); }}>
            <input type="text" name="username" autoComplete="username" value="account-security" readOnly hidden />
            <div className="field-group">
              <label>New Password</label>
              <input 
                type="password" 
                name="new_password"
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
              />
            </div>
            <div className="field-group">
              <label>Confirm Password</label>
              <input 
                type="password" 
                name="confirm_password"
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={passwordLoading || !passwordForm.newPassword}>
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>
        )}
      </div>

      <style>{`
        .settings-page { max-width: 100%; }
        .settings-tab-nav { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
        .settings-tab-button { display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; padding: 0.95rem 1rem; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--bg-card); text-align: left; transition: border-color var(--transition), background var(--transition), transform var(--transition); cursor: pointer; }
        .settings-tab-button:hover { border-color: var(--border-2); background: var(--bg-2); }
        .settings-tab-button.active { border-color: rgba(59,130,246,0.35); background: rgba(59,130,246,0.08); }
        .settings-tab-label { font-size: 0.84rem; font-weight: 700; color: var(--text); }
        .settings-tab-description { font-size: 0.72rem; color: var(--text-muted); line-height: 1.45; }
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem; }
        @media (max-width: 640px) { .settings-grid { grid-template-columns: 1fr; } }
        .settings-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.5rem; }
        .section-title { font-size: 0.9rem; font-weight: 700; margin-bottom: 1.25rem; color: var(--text); }
        .section-note { font-size: 0.76rem; color: var(--text-muted); margin: -0.35rem 0 1rem; }
        .message-banner { padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; font-size: 0.82rem; font-weight: 500; }
        .message-banner.success { background: var(--green-dim); color: var(--green); border: 1px solid rgba(34,197,94,0.2); }
        .message-banner.error { background: var(--red-dim); color: var(--red); border: 1px solid rgba(239,68,68,0.2); }
        .info-banner { padding: 0.75rem 1rem; border-radius: var(--radius-md); margin-bottom: 1rem; font-size: 0.76rem; background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.24); color: var(--blue); }
        
        .toggle-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .toggle-switch { position: relative; width: 50px; height: 24px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border); transition: 0.4s; border-radius: 24px; }
        .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.4s; border-radius: 50%; }
        .toggle-switch input:checked + .toggle-slider { background-color: var(--primary); }
        .toggle-switch input:checked + .toggle-slider:before { transform: translateX(26px); }
        .toggle-description { font-size: 0.75rem; color: var(--text-dim); margin-top: 0.25rem; margin-bottom: 0; }
        .field-hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.4rem; margin-bottom: 0; }
        .button-group { display: flex; gap: 0.75rem; margin-top: 1rem; }
        .btn-secondary { background: var(--bg-secondary); color: var(--text); border: 1px solid var(--border); }
        .btn-secondary:hover { background: var(--bg-hover); }
        input:disabled { opacity: 0.6; cursor: not-allowed; }
        .operator-settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem 1.25rem; }
        .operator-token-panel { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border); }
        .operator-token-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
        .operator-token-title { font-size: 0.84rem; font-weight: 700; margin: 0; }
        .operator-token-actions { display: grid; gap: 0.85rem; }
        .status-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 116px; padding: 0.4rem 0.7rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; }
        .status-pill.configured { background: var(--green-dim); color: var(--green); border: 1px solid rgba(34,197,94,0.22); }
        .status-pill.missing { background: var(--red-dim); color: var(--red); border: 1px solid rgba(239,68,68,0.22); }
        .guest-roster-panel { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); display: grid; gap: 1rem; }
        .guest-roster-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
        .guest-roster-title { font-size: 0.84rem; font-weight: 700; margin: 0; }
        .guest-roster-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
        .guest-roster-lookup { display: flex; gap: 0.6rem; align-items: center; }
        .guest-roster-lookup > input { flex: 1; }
        .guest-roster-results { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .guest-roster-result-card { display: grid; gap: 0.2rem; padding: 0.9rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-2); font-size: 0.76rem; color: var(--text-soft); }
        .guest-roster-result-card strong { color: var(--text); font-size: 0.82rem; }
        @media (max-width: 768px) {
          .settings-section {
            padding: 1rem;
          }
          .settings-tab-nav {
            grid-template-columns: 1fr;
          }
          .operator-token-header {
            flex-direction: column;
          }
          .guest-roster-header,
          .guest-roster-lookup {
            flex-direction: column;
            align-items: stretch;
          }
          .button-group {
            flex-direction: column;
          }
          .button-group .btn,
          .button-group button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
