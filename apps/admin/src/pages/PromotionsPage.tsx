// apps/admin/src/pages/PromotionsPage.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { asMaybeRow, asMutationArg, asMutationRowsArg, asRows } from '../lib/supabaseTypeWorkarounds'

interface Promotion {
  id: string; code: string | null; name_en: string; name_ar: string
  type: string; discount_value: number; discount_type: string
  min_order_value: number; max_discount_cap: number | null
  usage_limit: number | null; usage_count: number
  ai_rank_score: number; is_active: boolean; is_featured: boolean
  condition_type: string; conditions: any
  valid_from: string; valid_until: string | null | null
  valid_from_time: string | null; valid_until_time: string | null
}

interface PromotionPickerOption {
  id: string
  name_en: string
}

const EMPTY_PROMO = {
  code: '', name_en: '', name_ar: '', type: 'code',
  discount_value: 0, discount_type: 'fixed',
  min_order_value: 0, max_discount_cap: '', usage_limit: '', ai_rank_score: 0.5,
  is_active: true, is_featured: false, condition_type: 'none',
  valid_from: new Date().toISOString().slice(0, 16), valid_until: '',
  valid_from_time: '00:00', valid_until_time: '23:59',
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)
  const [form, setForm] = useState<{
    code: string; name_en: string; name_ar: string
    type: string; discount_value: number; discount_type: string
    min_order_value: number; max_discount_cap: string
    usage_limit: string; ai_rank_score: number
    is_active: boolean; is_featured: boolean; condition_type: string
    valid_from: string; valid_until: string | null
    valid_from_time: string; valid_until_time: string
  }>(EMPTY_PROMO)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<PromotionPickerOption[]>([])
  const [categories, setCategories] = useState<PromotionPickerOption[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  useEffect(() => { loadPromotions() }, [])

  useEffect(() => {
    if (showForm) {
      loadProductsAndCategories()
    }
  }, [showForm])

  async function loadProductsAndCategories() {
    const [prodsData, catsData] = await Promise.all([
      supabase.from('products').select('id, name_en').eq('is_available', true).order('name_en'),
      supabase.from('categories').select('id, name_en').eq('is_active', true).order('name_en')
    ])
    setProducts(asRows<PromotionPickerOption>(prodsData.data))
    setCategories(asRows<PromotionPickerOption>(catsData.data))
  }

  async function loadPromotions() {
    const { data } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false })
    setPromotions((data ?? []) as Promotion[])
    setLoading(false)
  }

  async function savePromotion() {
    setSaving(true)
    try {
      const conditions: any = {}
      if (form.condition_type === 'specific_products') {
        conditions.product_ids = selectedProducts
      } else if (form.condition_type === 'specific_categories') {
        conditions.category_ids = selectedCategories
      }

      const data = {
        code: form.code.toUpperCase() || null,
        name_en: form.name_en, name_ar: form.name_ar,
        type: form.type, discount_value: Number(form.discount_value),
        discount_type: form.discount_type,
        min_order_value: Number(form.min_order_value),
        max_discount_cap: form.max_discount_cap ? Number(form.max_discount_cap) : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        ai_rank_score: Number(form.ai_rank_score),
        is_active: form.is_active, is_featured: form.is_featured,
        condition_type: form.condition_type,
        conditions,
        valid_from: new Date(form.valid_from).toISOString(),
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
        valid_from_time: form.valid_from_time || null,
        valid_until_time: form.valid_until_time || null,
      }

      let promoId: string
      if (editingPromo) {
        await supabase.from('promotions').update(asMutationArg(data)).eq('id', editingPromo.id)
        promoId = editingPromo.id
      } else {
        const { data: newPromo } = await supabase
          .from('promotions')
          .insert(asMutationRowsArg([data]))
          .select('id')
          .single()
        if (!newPromo) throw new Error('Failed to create promotion')
        promoId = asMaybeRow<{ id: string }>(newPromo)?.id ?? ''
        if (!promoId) throw new Error('Failed to create promotion')
      }

      // Handle product associations
      await supabase.from('promotion_products').delete().eq('promotion_id', promoId)
      if (selectedProducts.length > 0) {
        const productAssociations = selectedProducts.map(productId => ({ 
          promotion_id: promoId, 
          product_id: productId 
        }))
        const { error: productError } = await supabase
          .from('promotion_products')
          .insert(asMutationRowsArg(productAssociations))
        if (productError) {
          console.error('Error loading product associations:', productError)
        }
      }

      // Handle category associations
      await supabase.from('promotion_categories').delete().eq('promotion_id', promoId)
      if (selectedCategories.length > 0) {
        const categoryAssociations = selectedCategories.map(categoryId => ({ 
          promotion_id: promoId, 
          category_id: categoryId 
        }))
        const { error: categoryError } = await supabase
          .from('promotion_categories')
          .insert(asMutationRowsArg(categoryAssociations))
        if (categoryError) {
          console.error('Error loading category associations:', categoryError)
        }
      }

      setShowForm(false); setEditingPromo(null); setForm(EMPTY_PROMO)
      setSelectedProducts([]); setSelectedCategories([])
      await loadPromotions()
    } finally { setSaving(false) }
  }

  async function toggleActive(promo: Promotion) {
    await supabase.from('promotions').update(asMutationArg({ is_active: !promo.is_active })).eq('id', promo.id)
    setPromotions((prev) => prev.map((p) => p.id === promo.id ? { ...p, is_active: !p.is_active } : p))
  }

  function openEdit(promo: Promotion) {
    setEditingPromo(promo)
    setForm({
      code: promo.code ?? '', name_en: promo.name_en, name_ar: promo.name_ar,
      type: promo.type, discount_value: promo.discount_value, discount_type: promo.discount_type,
      min_order_value: promo.min_order_value, max_discount_cap: promo.max_discount_cap?.toString() ?? '',
      usage_limit: promo.usage_limit?.toString() ?? '', ai_rank_score: promo.ai_rank_score,
      is_active: promo.is_active, is_featured: promo.is_featured, condition_type: promo.condition_type,
      valid_from: new Date(promo.valid_from).toISOString().slice(0, 16),
      valid_until: promo.valid_until ? new Date(promo.valid_until).toISOString().slice(0, 16) : '',
      valid_from_time: promo.valid_from_time || '00:00',
      valid_until_time: promo.valid_until_time || '23:59',
    })
    setShowForm(true)
    
    // Load existing selections for this promotion
    loadPromotionAssociations(promo.id)
  }

  async function loadPromotionAssociations(promotionId: string) {
    try {
      const [productData, categoryData] = await Promise.all([
        supabase.from('promotion_products').select('product_id').eq('promotion_id', promotionId),
        supabase.from('promotion_categories').select('category_id').eq('promotion_id', promotionId)
      ])
      
      const productIds = asRows<{ product_id: string }>(productData?.data).map((product) => product.product_id)
      const categoryIds = asRows<{ category_id: string }>(categoryData?.data).map((category) => category.category_id)
      
      setSelectedProducts(productIds)
      setSelectedCategories(categoryIds)
    } catch (error) {
      console.error('Failed to load promotion associations:', error)
      setSelectedProducts([])
      setSelectedCategories([])
    }
  }

  const active = promotions.filter((p) => p.is_active)
  const expired = promotions.filter((p) => p.valid_until && new Date(p.valid_until) < new Date())

  return (
    <div className="promos-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Promotions</h1>
          <p className="page-sub">{active.length} active · {expired.length} expired</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingPromo(null); setForm(EMPTY_PROMO); setShowForm(true) }}>
          + Create Promotion
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 72, background: 'var(--bg-3)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : promotions.length === 0 ? (
        <div className="empty-state"><span>◉</span><p>No promotions yet</p></div>
      ) : (
        <div className="promo-list">
          {promotions.map((promo) => {
            const isExpired = promo.valid_until && new Date(promo.valid_until) < new Date()
            const usagePct = promo.usage_limit ? (promo.usage_count / promo.usage_limit) * 100 : null
            return (
              <div key={promo.id} className={`promo-card ${!promo.is_active ? 'inactive' : ''} ${isExpired ? 'expired' : ''}`}>
                <div className="promo-card-header">
                  <div className="promo-card-left">
                    <div className="promo-badges">
                      {promo.code && <span className="promo-code mono">{promo.code}</span>}
                      <span className={`badge ${promo.type === 'ai_suggested' ? 'badge-dispatched' : promo.type === 'automatic' ? 'badge-confirmed' : 'badge-ready'}`}>
                        {promo.type}
                      </span>
                      {!promo.is_active && <span className="badge badge-cancelled">Inactive</span>}
                      {isExpired && <span className="badge badge-cancelled">Expired</span>}
                    </div>
                    <h3 className="promo-name">{promo.name_en}</h3>
                    <p className="promo-name-ar">{promo.name_ar}</p>
                  </div>
                  <div className="promo-card-right">
                    <div className="promo-discount">
                      {promo.discount_type === 'percentage'
                        ? `${promo.discount_value}% OFF`
                        : promo.discount_type === 'free_delivery'
                        ? 'Free Delivery'
                        : `QAR ${promo.discount_value} OFF`}
                    </div>
                    <div className="promo-ai-score">
                      <span>AI Score</span>
                      <div className="ai-score-bar">
                        <div style={{ width: `${promo.ai_rank_score * 100}%`, background: 'var(--gold)' }} />
                      </div>
                      <span className="mono">{(promo.ai_rank_score * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                <div className="promo-card-meta">
                  <span>Min order: QAR {promo.min_order_value.toFixed(0)}</span>
                  {promo.valid_until && <span>Expires: {new Date(promo.valid_until).toLocaleDateString()}</span>}
                  <div className="promo-usage">
                    <span>{promo.usage_count} uses {promo.usage_limit ? `/ ${promo.usage_limit}` : ''}</span>
                    {usagePct !== null && (
                      <div className="usage-bar">
                        <div style={{ width: `${Math.min(usagePct, 100)}%`, background: usagePct > 80 ? 'var(--red)' : 'var(--blue)' }} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="promo-card-actions">
                  <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => openEdit(promo)}>Edit</button>
                  <button className={`btn ${promo.is_active ? 'btn-danger' : 'btn-primary'}`} style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => toggleActive(promo)}>
                    {promo.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="promo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPromo ? 'Edit Promotion' : 'Create Promotion'}</h2>
              <button onClick={() => setShowForm(false)} style={{ width:28,height:28,borderRadius:6,color:'var(--text-muted)',fontSize:'0.8rem',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-cols">
                <div className="field-group"><label>Name (English) *</label><input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} /></div>
                <div className="field-group"><label>Name (Arabic)</label><input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} dir="rtl" /></div>
              </div>
              <div className="form-cols">
                <div className="field-group">
                  <label>Type</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="code">Code-based</option>
                    <option value="automatic">Automatic</option>
                    <option value="ai_suggested">AI Suggested</option>
                  </select>
                </div>
                {form.type === 'code' && (
                  <div className="field-group"><label>Promo Code</label><input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="WELCOME20" /></div>
                )}
              </div>
              <div className="form-cols">
                <div className="field-group">
                  <label>Condition Type</label>
                  <select value={form.condition_type} onChange={(e) => setForm((f) => ({ ...f, condition_type: e.target.value }))}>
                    <option value="none">No Conditions</option>
                    <option value="first_order">First Order Only</option>
                    <option value="min_order">Minimum Order Value</option>
                    <option value="specific_products">Specific Products</option>
                    <option value="specific_categories">Specific Categories</option>
                  </select>
                </div>
                <div className="field-group">
                  <label>Display as Banner</label>
                  <select value={form.is_featured ? 'true' : 'false'} onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.value === 'true' }))}>
                    <option value="false">No</option>
                    <option value="true">Yes - Show on Menu</option>
                  </select>
                </div>
              </div>

              {form.condition_type === 'specific_products' && (
                <div className="field-group">
                  <label>Select Products</label>
                  <div className="multi-select-grid">
                    {products.map((p) => (
                      <label key={p.id} className="multi-select-item">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProducts([...selectedProducts, p.id])
                            } else {
                              setSelectedProducts(selectedProducts.filter(id => id !== p.id))
                            }
                          }}
                        />
                        <span>{p.name_en}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.condition_type === 'specific_categories' && (
                <div className="field-group">
                  <label>Select Categories</label>
                  <div className="multi-select-grid">
                    {categories.map((c) => (
                      <label key={c.id} className="multi-select-item">
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(c.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories([...selectedCategories, c.id])
                            } else {
                              setSelectedCategories(selectedCategories.filter(id => id !== c.id))
                            }
                          }}
                        />
                        <span>{c.name_en}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-cols">
                <div className="field-group">
                  <label>Discount Type</label>
                  <select value={form.discount_type} onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}>
                    <option value="fixed">Fixed Amount (QAR)</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="free_delivery">Free Delivery</option>
                  </select>
                </div>
                <div className="field-group"><label>Discount Value</label><input type="number" min="0" step="0.1" value={form.discount_value} onChange={(e) => setForm((f) => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))} /></div>
              </div>
              <div className="form-cols">
                <div className="field-group"><label>Min Order Value (QAR)</label><input type="number" min="0" value={form.min_order_value} onChange={(e) => setForm((f) => ({ ...f, min_order_value: parseFloat(e.target.value) || 0 }))} /></div>
                <div className="field-group"><label>Max Discount Cap</label><input type="number" min="0" value={form.max_discount_cap} onChange={(e) => setForm((f) => ({ ...f, max_discount_cap: e.target.value }))} placeholder="No cap" /></div>
              </div>
              <div className="form-cols">
                <div className="field-group"><label>Usage Limit</label><input type="number" min="1" value={form.usage_limit} onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))} placeholder="Unlimited" /></div>
                <div className="field-group">
                  <label>AI Rank Score (0–1)</label>
                  <input type="range" min="0" max="1" step="0.05" value={form.ai_rank_score} onChange={(e) => setForm((f) => ({ ...f, ai_rank_score: parseFloat(e.target.value) }))} style={{ padding: 0, border: 'none', background: 'none', height: 'auto' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{form.ai_rank_score.toFixed(2)}</span>
                </div>
              </div>
              <div className="form-cols">
                <div className="field-group">
                  <label>Valid From</label>
                  <input
                    type="date"
                    value={form.valid_from?.slice(0, 10) || ''}
                    onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value + 'T00:00' }))}
                  />
                </div>
                <div className="field-group">
                  <label>Valid Until</label>
                  <input
                    type="date"
                    value={form.valid_until?.slice(0, 10) || ''}
                    onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value ? e.target.value + 'T23:59' : null }))}
                  />
                </div>
              </div>
              <div className="form-cols">
                <div className="field-group">
                  <label>Valid From Time</label>
                  <input
                    type="time"
                    value={form.valid_from_time || '00:00'}
                    onChange={(e) => setForm((f) => ({ ...f, valid_from_time: e.target.value }))}
                  />
                </div>
                <div className="field-group">
                  <label>Valid Until Time</label>
                  <input
                    type="time"
                    value={form.valid_until_time || '23:59'}
                    onChange={(e) => setForm((f) => ({ ...f, valid_until_time: e.target.value }))}
                  />
                </div>
              </div>
              <label className="toggle-label">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} style={{ width: 'auto' }} />
                <span>Active (visible to customers)</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePromotion} disabled={saving || !form.name_en}>
                {saving ? 'Saving…' : editingPromo ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .promos-page { animation: fadeIn 0.3s ease; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; }
        .page-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }
        .promo-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .promo-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1rem 1.25rem; }
        .promo-card.inactive { opacity: 0.6; }
        .promo-card.expired { border-color: rgba(239,68,68,0.2); }
        .promo-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.6rem; }
        .promo-card-left { flex: 1; }
        .promo-badges { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.35rem; }
        .promo-code { font-size: 0.8rem; font-weight: 700; color: var(--text); background: var(--bg-3); padding: 0.2rem 0.5rem; border-radius: 4px; letter-spacing: 0.08em; }
        .promo-name { font-size: 0.95rem; font-weight: 700; color: var(--text); }
        .promo-name-ar { font-size: 0.72rem; color: var(--text-muted); direction: rtl; }
        .promo-card-right { text-align: right; flex-shrink: 0; }
        .promo-discount { font-size: 1.1rem; font-weight: 800; color: var(--gold); font-family: var(--font-mono); margin-bottom: 0.5rem; }
        .promo-ai-score { display: flex; align-items: center; gap: 0.4rem; font-size: 0.62rem; color: var(--text-muted); }
        .ai-score-bar { width: 60px; height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden; }
        .ai-score-bar div { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
        .promo-card-meta { display: flex; align-items: center; gap: 1.5rem; font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.75rem; flex-wrap: wrap; }
        .promo-usage { display: flex; align-items: center; gap: 0.4rem; }
        .usage-bar { width: 60px; height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden; }
        .usage-bar div { height: 100%; border-radius: 2px; }
        .promo-card-actions { display: flex; gap: 0.35rem; }
        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 4rem; color: var(--text-muted); }
        .empty-state span { font-size: 2rem; }
        .modal-backdrop { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease; padding: 1rem; }
        .promo-modal { width: 560px; max-width: 100%; max-height: 90dvh; background: var(--bg-2); border: 1px solid var(--border-2); border-radius: var(--radius-lg); display: flex; flex-direction: column; animation: slideIn 0.25s ease; overflow: hidden; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .modal-header h2 { font-size: 1rem; font-weight: 700; }
        .modal-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.5rem; flex-shrink: 0; }
        .form-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        @media (max-width: 480px) { .form-cols { grid-template-columns: 1fr; } }
        .field-group label { display: block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem; }
        .toggle-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-soft); cursor: pointer; }
        .multi-select-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem; max-height: 200px; overflow-y: auto; padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius-sm); }
        .multi-select-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; cursor: pointer; padding: 0.3rem; border-radius: 4px; }
        .multi-select-item:hover { background: var(--bg-3); }
        .multi-select-item input { width: auto; }
      `}</style>
    </div>
  )
}
