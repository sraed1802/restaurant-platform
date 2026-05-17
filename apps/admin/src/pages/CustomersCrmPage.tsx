// apps/admin/src/pages/CustomersCrmPage.tsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import TableSkeleton from '../components/TableSkeleton'
import { asRpcArgs } from '../lib/supabaseTypeWorkarounds'

interface CustomerRow {
  id: string
  name: string | null
  email: string | null
  phone_e164: string | null
  total_orders: number
  last_order_at: string | null
  created_at: string
  marketing_opt_out?: boolean
  is_registered?: boolean
}

function customerDisplayName(row: CustomerRow): string {
  const name = row.name?.trim()
  if (name) return name
  if (row.is_registered) return 'Registered user'
  if (row.total_orders > 0) return 'Checkout guest'
  return 'Guest'
}

function customerSubtitle(row: CustomerRow): string {
  if (row.is_registered) return 'App account'
  if (row.total_orders > 0) return 'Ordered without account'
  return `Profile ${row.id.slice(0, 8).toUpperCase()}`
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone?.trim()) return '—'
  const trimmed = phone.trim()
  if (trimmed.startsWith('+')) return trimmed
  if (/^\d{8}$/.test(trimmed)) return `+974${trimmed}`
  return trimmed
}

interface PromotionRow {
  id: string
  code: string | null
  name_en: string
  name_ar: string
  discount_type: 'percentage' | 'fixed' | 'free_delivery'
  discount_value: number
  max_discount_cap: number | null
  min_order_value: number
  valid_until: string | null
}

interface PromoProductRow {
  product_id: string
  name_en: string
  name_ar: string
  base_price: number
  image_url: string | null
}

interface PromoProductSource {
  id: string
  name_en: string
  name_ar: string
  base_price: number
  image_url: string | null
}

interface RestaurantSettingsRow {
  restaurant_name_en: string
  restaurant_name_ar: string
  restaurant_tagline_en: string | null
  restaurant_tagline_ar: string | null
  logo_url: string | null
}

function toWaNumber(phone: string | null | undefined) {
  if (!phone) return ''
  return phone.replace(/[^\d]/g, '')
}

type CampaignLanguage = 'en' | 'ar'

function escapeHtml(input: string) {
  return input
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;')
}

function buildLuxuryEmailHtml(args: {
  language: CampaignLanguage
  subject: string
  headline: string
  body: string
  ctaText: string
  ctaUrl: string
  brandName: string
  brandTagline?: string | null
  logoUrl?: string | null
  unsubscribeUrl: string
  promoCode?: string
  promoLine?: string
  featured: PromoProductRow[]
}) {
  const dir = args.language === 'ar' ? 'rtl' : 'ltr'
  const font = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
  const serif = "Georgia, 'Times New Roman', Times, serif"
  const headline = escapeHtml(args.headline)
  const body = escapeHtml(args.body).split('\n').join('<br/>')
  const ctaText = escapeHtml(args.ctaText)
  const promoLine = args.promoLine ? escapeHtml(args.promoLine) : ''
  const promoCode = args.promoCode ? escapeHtml(args.promoCode) : ''
  const brandName = escapeHtml(args.brandName)
  const brandTagline = args.brandTagline ? escapeHtml(args.brandTagline) : ''
  const unsubscribeUrl = escapeHtml(args.unsubscribeUrl)

  const productCards = args.featured
    .slice(0, 3)
    .map((p) => {
      const name = args.language === 'ar' ? p.name_ar : p.name_en
      const img = p.image_url ? escapeHtml(p.image_url) : ''
      const cardLabel = args.language === 'ar' ? 'مختار' : 'Featured'
      return `
        <td style="padding:0; border:1px solid rgba(184,151,90,.20); border-radius:18px; background:rgba(255,255,255,.03); overflow:hidden;">
          ${
            img
              ? `<div style="position:relative;">
                   <img src="${img}" alt="${escapeHtml(name)}" width="100%" style="display:block; width:100%; height:170px; object-fit:cover;" />
                   <div style="position:absolute; left:0; right:0; top:0; height:100%; background:linear-gradient(180deg, rgba(7,9,16,.10) 0%, rgba(7,9,16,0) 35%, rgba(7,9,16,.92) 100%);"></div>
                 </div>`
              : `<div style="height:170px; background:radial-gradient(120% 120% at 25% 15%, rgba(184,151,90,.45), rgba(17,24,39,.18) 55%, rgba(11,14,20,1) 100%);"></div>`
          }
          <div style="padding:14px 14px 15px;">
            <div style="font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:#d7c39b; margin-bottom:6px;">${cardLabel}</div>
            <div style="font-size:15px; font-weight:900; color:#ffffff; margin-bottom:6px; line-height:1.25;">
              ${escapeHtml(name)}
            </div>
            <div style="font-size:13px; color:rgba(255,255,255,.78);">QAR ${p.base_price.toFixed(2)}</div>
          </div>
        </td>
      `
    })
    .join('\n')

  const featuredBlock =
    args.featured.length > 0
      ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;">
      <tr>
        <td style="font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.65); padding-bottom:10px;">
          ${args.language === 'ar' ? 'مختارات مخفّضة' : 'Discounted picks'}
        </td>
      </tr>
      <tr>
        <td>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              ${productCards}
            </tr>
          </table>
        </td>
      </tr>
    </table>`
      : ''

  return `<!doctype html>
<html lang="${args.language}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(args.subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#070910; font-family:${font};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070910; padding:30px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px; width:100%; border-radius:26px; overflow:hidden; border:1px solid rgba(184,151,90,.20); background:linear-gradient(145deg,#0f172a 0%, #070910 52%, #1a1310 100%); box-shadow: 0 22px 70px rgba(0,0,0,.62);">
            <tr>
              <td style="padding:22px 28px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <div style="font-size:11px; letter-spacing:.34em; text-transform:uppercase; color:rgba(255,255,255,.60);">
                        ${args.language === 'ar' ? 'دعوة خاصة' : 'Special invitation'}
                      </div>
                      <div style="margin-top:8px; font-size:15px; font-weight:900; letter-spacing:.16em; color:#ffffff; text-transform:uppercase;">
                        ${brandName}
                      </div>
                      ${brandTagline ? `<div style="margin-top:4px; font-size:12px; color:rgba(255,255,255,.62);">${brandTagline}</div>` : ''}
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      ${args.logoUrl ? `<img src="${escapeHtml(args.logoUrl)}" alt="${brandName}" style="height:48px; width:auto; display:block; border-radius:14px;" />` : ''}
                    </td>
                  </tr>
                </table>
 
                <div style="height:1px; background:linear-gradient(90deg, rgba(184,151,90,.08), rgba(255,255,255,.12), rgba(184,151,90,.08)); margin:16px 0 18px;"></div>
                <div style="font-size:11px; letter-spacing:.30em; text-transform:uppercase; color:rgba(255,255,255,.60);">
                  ${args.language === 'ar' ? 'عرض محدود' : 'Limited-time offer'}
                </div>
                <div style="margin-top:10px; font-family:${serif}; font-size:38px; line-height:1.05; font-weight:700; color:#ffffff;">
                  ${headline}
                </div>
                <div style="margin-top:12px; font-size:15px; line-height:1.78; color:rgba(255,255,255,.82);">
                  ${body}
                </div>

                ${(promoLine || promoCode)
                  ? `<div style="margin-top:16px; padding:14px 16px; border-radius:16px; background:rgba(184,151,90,.14); border:1px solid rgba(184,151,90,.25); color:#ffffff;">
                      <div style="font-size:14px; font-weight:700;">${promoLine}</div>
                      ${promoCode ? `<div style="margin-top:8px; font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:rgba(255,255,255,.85);">Code</div>
                      <div style="margin-top:2px; font-size:20px; font-weight:900; letter-spacing:.14em;">${promoCode}</div>` : ''}
                    </div>`
                  : ''}

                ${featuredBlock}

                <div style="margin-top:20px;">
                  <a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block; padding:12px 18px; border-radius:999px; background:#b8975a; color:#0b0e14; text-decoration:none; font-weight:950; letter-spacing:.08em;">
                    ${ctaText}
                  </a>
                  <span style="display:inline-block; margin-left:10px; font-size:12px; color:rgba(255,255,255,.62);">
                    ${args.language === 'ar' ? 'مُحضّر بعناية · توصيل سريع' : 'Chef-crafted · Fast delivery'}
                  </span>
                </div>

                <div style="margin-top:18px; font-size:12px; color:rgba(255,255,255,.55); line-height:1.6;">
                  ${args.language === 'ar'
                    ? `لإيقاف رسائل العروض، اضغط <a href="${unsubscribeUrl}" style="color:#d7c39b; text-decoration:underline;">إلغاء الاشتراك</a>.`
                    : `To stop promotional messages, click <a href="${unsubscribeUrl}" style="color:#d7c39b; text-decoration:underline;">Unsubscribe</a>.`}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export default function CustomersCrmPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [includeUnsubscribed, setIncludeUnsubscribed] = useState(false)

  const [campaignOpen, setCampaignOpen] = useState(false)
  const [campaignLang, setCampaignLang] = useState<CampaignLanguage>('en')
  const [promotions, setPromotions] = useState<PromotionRow[]>([])
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>('')
  const [promoProducts, setPromoProducts] = useState<PromoProductRow[]>([])
  const [restaurantSettings, setRestaurantSettings] = useState<RestaurantSettingsRow | null>(null)

  const [subject, setSubject] = useState('Your sign-in code')
  const [headline, setHeadline] = useState('A signature offer, for you')
  const [body, setBody] = useState('We’re delighted to share a limited-time offer—crafted for Doha evenings and delivered with care.')
  const [ctaText, setCtaText] = useState('View menu')
  const [ctaUrl, setCtaUrl] = useState('https://order.restaurant.qa/menu')

  useEffect(() => {
    loadCustomers()
    void loadPromotions()
    void loadRestaurantSettings()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    const { data, error } = await supabase.rpc('crm_list_customers', asRpcArgs({ p_limit: 2000 }))
    if (error) console.error('Failed to load customers:', error.message)
    setCustomers((data ?? []) as CustomerRow[])
    setLoading(false)
  }

  async function loadPromotions() {
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('promotions')
      .select('id, code, name_en, name_ar, discount_type, discount_value, max_discount_cap, min_order_value, valid_until')
      .eq('is_active', true)
      .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) console.error('Failed to load promotions:', error.message)
    setPromotions((data ?? []) as PromotionRow[])
  }
 
  async function loadRestaurantSettings() {
    const { data, error } = await supabase
      .from('restaurant_settings')
      .select('restaurant_name_en, restaurant_name_ar, restaurant_tagline_en, restaurant_tagline_ar, logo_url')
      .limit(1)
      .maybeSingle()
    if (error) console.error('Failed to load restaurant settings:', error.message)
    setRestaurantSettings((data ?? null) as RestaurantSettingsRow | null)
  }

  async function loadPromoProducts(promotionId: string) {
    if (!promotionId) {
      setPromoProducts([])
      return
    }
    const [linkedProductsResult, linkedCategoriesResult] = await Promise.all([
      supabase
        .from('promotion_products')
        .select('product_id')
        .eq('promotion_id', promotionId)
        .limit(20),
      supabase
        .from('promotion_categories')
        .select('category_id')
        .eq('promotion_id', promotionId)
        .limit(20),
    ])

    if (linkedProductsResult.error) {
      console.error('Failed to load promotion products:', linkedProductsResult.error.message)
      setPromoProducts([])
      return
    }

    if (linkedCategoriesResult.error) {
      console.error('Failed to load promotion categories:', linkedCategoriesResult.error.message)
      setPromoProducts([])
      return
    }

    type PromotionProductLinkRow = { product_id: string }
    const directProductIds = ((linkedProductsResult.data ?? []) as PromotionProductLinkRow[])
      .map((row) => row.product_id)
      .filter(Boolean)

    let directProducts: PromoProductRow[] = []

    if (directProductIds.length > 0) {
      const { data: directProductData, error: directProductsError } = await supabase
        .from('products')
        .select('id, name_en, name_ar, base_price, image_url')
        .in('id', directProductIds)
        .eq('is_available', true)
        .order('display_order')
        .limit(20)

      if (directProductsError) {
        console.error('Failed to load directly tagged promotion products:', directProductsError.message)
      } else {
        directProducts = ((directProductData ?? []) as PromoProductSource[]).map((product) => ({
          product_id: product.id,
          name_en: product.name_en,
          name_ar: product.name_ar,
          base_price: product.base_price,
          image_url: product.image_url,
        }))
      }
    }

    type PromotionCategoryLinkRow = { category_id: string }
    const categoryIds = ((linkedCategoriesResult.data ?? []) as PromotionCategoryLinkRow[]).map(
      (row) => row.category_id
    )
    let categoryProducts: PromoProductRow[] = []

    if (categoryIds.length > 0) {
      const { data: categoryProductData, error: categoryProductError } = await supabase
        .from('products')
        .select('id, name_en, name_ar, base_price, image_url')
        .in('category_id', categoryIds)
        .eq('is_available', true)
        .order('display_order')
        .limit(20)

      if (categoryProductError) {
        console.error('Failed to load promotion category products:', categoryProductError.message)
      } else {
        categoryProducts = ((categoryProductData ?? []) as PromoProductSource[]).map((product) => ({
          product_id: product.id,
          name_en: product.name_en,
          name_ar: product.name_ar,
          base_price: product.base_price,
          image_url: product.image_url,
        }))
      }
    }

    const mergedProducts = [...directProducts, ...categoryProducts].filter(
      (product, index, allProducts) =>
        allProducts.findIndex((candidate) => candidate.product_id === product.product_id) === index
    )

    setPromoProducts(mergedProducts)
  }

  const filtered = useMemo(() => {
    const base = includeUnsubscribed ? customers : customers.filter((c) => !c.marketing_opt_out)
    if (!search.trim()) return base
    const s = search.trim().toLowerCase()
    return base.filter((c) =>
      c.phone_e164?.includes(search.trim()) ||
      c.id.toLowerCase().includes(s) ||
      (c.name ?? '').toLowerCase().includes(s) ||
      (c.email ?? '').toLowerCase().includes(s)
    )
  }, [customers, search, includeUnsubscribed])

  const selectedCustomers = useMemo(() => filtered.filter((c) => selectedIds[c.id]), [filtered, selectedIds])
  const selectedEmails = useMemo(
    () => selectedCustomers.map((c) => c.email).filter((e): e is string => typeof e === 'string' && e.includes('@')),
    [selectedCustomers]
  )
  const selectedPhones = useMemo(
    () => selectedCustomers.map((c) => c.phone_e164).filter((p): p is string => Boolean(p && p.trim())),
    [selectedCustomers]
  )

  const selectedPromotion = promotions.find((p) => p.id === selectedPromotionId) ?? null
  const promoLine = useMemo(() => {
    if (!selectedPromotion) return ''
    if (selectedPromotion.discount_type === 'percentage') return campaignLang === 'ar' ? `خصم ${selectedPromotion.discount_value}% لفترة محدودة` : `${selectedPromotion.discount_value}% off for a limited time`
    if (selectedPromotion.discount_type === 'fixed') return campaignLang === 'ar' ? `خصم بقيمة ${selectedPromotion.discount_value} ر.ق` : `QAR ${selectedPromotion.discount_value} off`
    return campaignLang === 'ar' ? 'توصيل مجاني لفترة محدودة' : 'Free delivery for a limited time'
  }, [selectedPromotion, campaignLang])

  /** WhatsApp is plain text only — use structure + Unicode for “design”. Keep length sane for wa.me URLs (~2k). */
  const whatsappPlainText = useMemo(() => {
    const brand =
      campaignLang === 'ar'
        ? restaurantSettings?.restaurant_name_ar ?? 'المطعم'
        : restaurantSettings?.restaurant_name_en ?? 'The Restaurant'
    const line = '━━━━━━━━━━━━━━━━━━━━'
    const dishes = promoProducts.slice(0, 6).map((p) => {
      const n = campaignLang === 'ar' ? p.name_ar : p.name_en
      return `  • ${n} — QAR ${p.base_price.toFixed(2)}`
    })
    const more =
      promoProducts.length > 6
        ? campaignLang === 'ar'
          ? `\n  … +${promoProducts.length - 6} أطباق أخرى في الرابط`
          : `\n  … +${promoProducts.length - 6} more on the menu link`
        : ''
    const promoCodeTrimmed = selectedPromotion?.code?.trim() ?? ''
    const promoBlock =
      selectedPromotion && promoLine
        ? campaignLang === 'ar'
          ? `\n🎁 ${promoLine}${
              promoCodeTrimmed
                ? `\n🔑 الكود: *${promoCodeTrimmed}*`
                : `\n✅ يُطبّق تلقائياً عند الطلب (لا يوجد كود)`
            }`
          : `\n🎁 ${promoLine}${
              promoCodeTrimmed
                ? `\n🔑 Code: *${promoCodeTrimmed}*`
                : `\n✅ Applied automatically at checkout (no code)`
            }`
        : ''
    const dishBlock =
      dishes.length > 0
        ? campaignLang === 'ar'
          ? `\n\n✨ مختارات العرض\n${dishes.join('\n')}${more}`
          : `\n\n✨ Featured picks\n${dishes.join('\n')}${more}`
        : ''
    const footer =
      campaignLang === 'ar'
        ? `\n\n▶️ اطلب الآن\n${ctaUrl}\n\nرد بـ STOP لإيقاف العروض.`
        : `\n\n▶️ Order now\n${ctaUrl}\n\nReply STOP to opt out of promos.`

    let msg = `${line}\n🍽️ *${brand}*\n${line}\n\n✨ *${headline}*\n\n${body}${promoBlock}${dishBlock}${footer}`
    const max = 1600
    if (msg.length > max) {
      const cut = msg.slice(0, max - 40)
      msg = `${cut}\n\n… ${campaignLang === 'ar' ? '(انظر الرابط)' : '(see link)'} ${ctaUrl}`
    }
    return msg
  }, [
    campaignLang,
    restaurantSettings,
    headline,
    body,
    selectedPromotion,
    promoLine,
    promoProducts,
    ctaUrl,
  ])

  const waMsg = useMemo(() => encodeURIComponent(whatsappPlainText), [whatsappPlainText])

  const emailHtml = useMemo(
    () =>
      buildLuxuryEmailHtml({
        language: campaignLang,
        subject,
        headline,
        body,
        ctaText,
        ctaUrl,
        brandName:
          campaignLang === 'ar'
            ? restaurantSettings?.restaurant_name_ar ?? 'المطعم'
            : restaurantSettings?.restaurant_name_en ?? 'The Restaurant',
        brandTagline:
          campaignLang === 'ar'
            ? restaurantSettings?.restaurant_tagline_ar ?? null
            : restaurantSettings?.restaurant_tagline_en ?? null,
        logoUrl: restaurantSettings?.logo_url ?? null,
        unsubscribeUrl: `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/marketing-unsubscribe`,
        promoCode: selectedPromotion?.code?.trim() || undefined,
        promoLine: selectedPromotion ? promoLine : undefined,
        featured: promoProducts,
      }),
    [campaignLang, subject, headline, body, ctaText, ctaUrl, selectedPromotion, promoLine, promoProducts, restaurantSettings]
  )

  return (
    <div className="crm-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customer CRM</h1>
          <p className="page-sub">
            {filtered.length} customers · Select customers and compose a campaign (free: copy HTML + WhatsApp links)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={loadCustomers} disabled={loading}>
            Refresh
          </button>
          <button className="btn btn-gold" onClick={() => setCampaignOpen(true)} disabled={selectedCustomers.length === 0}>
            Compose campaign ({selectedCustomers.length})
          </button>
        </div>
      </div>

      <div className="crm-tools">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, phone, or id…"
          className="crm-search"
        />
        <button
          className="btn btn-ghost"
          onClick={() => {
            const next: Record<string, boolean> = {}
            for (const c of filtered) next[c.id] = true
            setSelectedIds(next)
          }}
          disabled={filtered.length === 0}
        >
          Select all
        </button>
        <button className="btn btn-ghost" onClick={() => setSelectedIds({})} disabled={selectedCustomers.length === 0}>
          Clear
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={includeUnsubscribed} onChange={(e) => setIncludeUnsubscribed(e.target.checked)} />
          Include unsubscribed
        </label>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedCustomers.length === filtered.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const next: Record<string, boolean> = {}
                        for (const c of filtered) next[c.id] = true
                        setSelectedIds(next)
                      } else {
                        setSelectedIds({})
                      }
                    }}
                    aria-label="Select all"
                  />
                </th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Orders</th>
                <th>Last order</th>
                <th>Opt-out</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const wa = toWaNumber(c.phone_e164)
                return (
                  <tr key={c.id}>
                    <td data-label="Select">
                      <input
                        type="checkbox"
                        checked={!!selectedIds[c.id]}
                        onChange={(e) => setSelectedIds((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                        aria-label={`Select ${customerDisplayName(c)}`}
                      />
                    </td>
                    <td data-label="Customer">
                      <div className="customer-cell">
                        <span className="customer-name">{customerDisplayName(c)}</span>
                        <span className="customer-meta">{customerSubtitle(c)}</span>
                      </div>
                    </td>
                    <td data-label="Phone" className="mono">{formatPhoneDisplay(c.phone_e164)}</td>
                    <td data-label="Email">{c.email ?? '—'}</td>
                    <td data-label="Orders" className="mono">{c.total_orders}</td>
                    <td data-label="Last order" className="mono">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString() : '—'}</td>
                    <td data-label="Opt-out">{c.marketing_opt_out ? 'Unsubscribed' : '—'}</td>
                    <td data-label="Actions">
                      <div className="action-row">
                        {c.email ? (
                          <a className="btn btn-ghost" href={`mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\n' + ctaUrl)}`}>
                            Email
                          </a>
                        ) : (
                          <span className="btn btn-ghost disabled" aria-disabled>
                            Email
                          </span>
                        )}
                        {wa ? (
                          <a
                            className="btn btn-ghost"
                            href={`https://wa.me/${wa}?text=${waMsg}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        ) : (
                          <span className="btn btn-ghost disabled" aria-disabled>
                            WhatsApp
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {campaignOpen && (
        <div className="modal-backdrop" onClick={() => setCampaignOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Campaign composer</h2>
                <p className="modal-sub">
                  Selected: <b>{selectedCustomers.length}</b> · Emails: <b>{selectedEmails.length}</b> · Phones: <b>{selectedPhones.length}</b>
                </p>
              </div>
              <button className="btn btn-ghost" onClick={() => setCampaignOpen(false)}>Close</button>
            </div>

            <div className="modal-grid">
              <div className="panel">
                <div className="field-row">
                  <label>Language</label>
                  <select value={campaignLang} onChange={(e) => setCampaignLang(e.target.value as CampaignLanguage)}>
                    <option value="en">English</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
                <div className="field-row">
                  <label>Promotion (active)</label>
                  <select
                    className="crm-promo-select"
                    value={selectedPromotionId}
                    onChange={(e) => {
                      const id = e.target.value
                      setSelectedPromotionId(id)
                      void loadPromoProducts(id)
                    }}
                  >
                    <option value="">None</option>
                    {promotions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.code?.trim() || p.name_en) ?? p.id.slice(0, 8)} · {p.discount_type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-row">
                  <label>Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="field-row">
                  <label>Headline</label>
                  <input value={headline} onChange={(e) => setHeadline(e.target.value)} />
                </div>
                <div className="field-row">
                  <label>Body</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
                </div>
                <div className="field-row">
                  <label>CTA text</label>
                  <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
                </div>
                <div className="field-row">
                  <label>CTA URL</label>
                  <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
                </div>

                <div className="composer-actions">
                  <button
                    className="btn btn-gold"
                    onClick={async () => {
                      await navigator.clipboard.writeText(emailHtml)
                    }}
                  >
                    Copy email HTML
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      const blob = new Blob([emailHtml], { type: 'text/html;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      window.open(url, '_blank', 'noopener,noreferrer')
                      // Best-effort cleanup
                      setTimeout(() => URL.revokeObjectURL(url), 60_000)
                    }}
                  >
                    Open HTML preview
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      const blob = new Blob([emailHtml], { type: 'text/html;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `campaign-${new Date().toISOString().slice(0, 10)}.html`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      setTimeout(() => URL.revokeObjectURL(url), 10_000)
                    }}
                  >
                    Download HTML
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      const text = whatsappPlainText
                      await navigator.clipboard.writeText(text)
                    }}
                  >
                    Copy WhatsApp message
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      // Opens default email client with BCC list (plain-text). HTML should be pasted manually.
                      const bcc = selectedEmails.slice(0, 50).join(',')
                      const codeLine =
                        selectedPromotion?.code?.trim() ? `Code: ${selectedPromotion.code.trim()}\n` : ''
                      const href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\n' + codeLine + ctaUrl)}`
                      window.location.href = href
                    }}
                    disabled={selectedEmails.length === 0}
                  >
                    Open email client (BCC)
                  </button>
                </div>

                <p className="hint">
                  Notes: bulk sending via WhatsApp/email APIs costs money. This page stays free by generating a premium HTML flyer and deep-links
                  (copy/paste into your mail tool, or use your email client BCC for small batches).
                </p>
              </div>

              <div className="panel">
                <div className="preview-head">
                  <span className="preview-title">Preview</span>
                  {selectedPromotion ? (
                    <span className="pill">
                      Promo: {selectedPromotion.code?.trim() || selectedPromotion.name_en}
                    </span>
                  ) : (
                    <span className="pill">No promo</span>
                  )}
                  {promoProducts.length > 0 ? <span className="pill">{promoProducts.length} discounted items</span> : <span className="pill">No items</span>}
                </div>
                <div className="preview" dangerouslySetInnerHTML={{ __html: emailHtml }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .crm-tools { display: flex; gap: 0.75rem; margin-bottom: 1rem; align-items: center; flex-wrap: wrap; }
        .crm-search {
          flex: 1;
          min-width: 240px;
          padding: 0.65rem 0.85rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-2);
          color: var(--text);
          font-size: 0.9rem;
        }
        .customer-cell { display: flex; flex-direction: column; gap: 0.15rem; }
        .customer-name { font-weight: 700; line-height: 1.25; }
        .customer-meta { font-size: 0.72rem; color: var(--text-muted); }
        .table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
        .action-row { display: flex; gap: 0.5rem; align-items: center; }
        .btn.disabled { opacity: 0.4; pointer-events: none; }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 50;
        }
        .modal {
          width: min(1100px, 100%);
          max-height: 90dvh;
          overflow: auto;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1rem;
        }
        .modal-header { display:flex; justify-content: space-between; align-items:center; gap: 1rem; margin-bottom: 0.75rem; }
        .modal-title { margin: 0; }
        .modal-sub { margin: 0.25rem 0 0; color: var(--text-muted); font-size: 0.82rem; }
        .modal-grid { display:grid; grid-template-columns: 1fr 1.2fr; gap: 1rem; }
        .panel { border: 1px solid var(--border); border-radius: 12px; padding: 0.85rem; background: var(--bg-2); }
        .field-row { display:flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
        .field-row label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .field-row input, .field-row textarea, .field-row select {
          padding: 0.6rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg-card);
          color: var(--text);
        }
        .field-row select,
        .crm-promo-select {
          color-scheme: dark;
        }
        .field-row select option,
        .crm-promo-select option {
          background-color: #141925;
          color: #e2e8f0;
        }
        .composer-actions { display:flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
        .hint { margin-top: 0.75rem; font-size: 0.78rem; color: var(--text-muted); line-height: 1.5; }
        .preview-head { display:flex; gap: 0.5rem; align-items:center; margin-bottom: 0.6rem; }
        .preview-title { font-weight: 800; }
        .pill { font-size: 0.72rem; color: var(--text-muted); border: 1px solid var(--border); padding: 0.18rem 0.5rem; border-radius: 999px; }
        .preview { border-radius: 12px; overflow: hidden; background: #0b0e14; border: 1px solid rgba(184,151,90,.15); }
        @media (max-width: 760px) {
          .crm-tools {
            flex-direction: column;
            align-items: stretch;
          }
          .crm-search {
            min-width: 0;
            width: 100%;
          }
          .table-wrap {
            border: none;
            overflow: visible;
          }
          .table,
          .table tbody {
            display: block;
          }
          .table thead {
            display: none;
          }
          .table tr {
            display: block;
            background: var(--bg-2);
            border: 1px solid var(--border);
            border-radius: 12px;
            margin-bottom: 0.8rem;
            padding: 0.2rem 0;
          }
          .table td {
            display: grid;
            grid-template-columns: 92px minmax(0, 1fr);
            gap: 0.75rem;
            align-items: start;
          }
          .table td::before {
            content: attr(data-label);
            font-size: 0.62rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--text-muted);
          }
          .table td[data-label="Actions"] {
            grid-template-columns: 1fr;
          }
          .action-row {
            flex-wrap: wrap;
          }
          .action-row .btn {
            width: 100%;
            justify-content: center;
          }
          .modal {
            padding: 0.85rem;
          }
          .modal-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .preview-head {
            flex-wrap: wrap;
          }
        }
        @media (max-width: 960px) {
          .modal-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

