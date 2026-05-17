import { useEffect, useMemo, useState } from 'react'
import ImageUpload from '../components/ImageUpload'
import {
  listComboCatalogCategories,
  createComboPromotion,
  deleteComboPromotion,
  fetchComboPromotionById,
  listComboCatalogProducts,
  listComboPromotions,
  toggleComboPromotion,
  updateComboPromotion,
  type ComboCatalogCategory,
  type ComboCatalogProduct,
  type ComboItemRole,
  type ComboPromotionMutation,
  type ComboPromotionRecord,
} from '../services/comboPromotions'

type ComboItemDraft = {
  category_id: string
  product_id: string
  item_role: ComboItemRole
  quantity: number
  display_order: number
}

type ComboFormState = {
  name_en: string
  name_ar: string
  headline_en: string
  headline_ar: string
  description_en: string
  description_ar: string
  promo_price: number
  image_url: string
  model_asset_url: string
  badge_text_en: string
  badge_text_ar: string
  accent_color: string
  secondary_color: string
  starts_at: string
  ends_at: string
  is_active: boolean
  is_featured: boolean
  display_order: number
  items: ComboItemDraft[]
}

const EMPTY_FORM: ComboFormState = {
  name_en: '',
  name_ar: '',
  headline_en: '',
  headline_ar: '',
  description_en: '',
  description_ar: '',
  promo_price: 0,
  image_url: '',
  model_asset_url: '',
  badge_text_en: '',
  badge_text_ar: '',
  accent_color: '#B8975A',
  secondary_color: '#6D28D9',
  starts_at: '',
  ends_at: '',
  is_active: true,
  is_featured: true,
  display_order: 0,
  items: [],
}

const ROLE_OPTIONS: Array<{ value: ComboItemRole; label: string }> = [
  { value: 'main', label: 'Main' },
  { value: 'side', label: 'Side' },
  { value: 'drink', label: 'Drink' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'optional_drink', label: 'Optional drink' },
]

function toDateTimeInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : ''
}

function fromDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

function toMutationInput(
  form: ComboFormState,
  originalPrice: number
): ComboPromotionMutation {
  return {
    name_en: form.name_en.trim(),
    name_ar: form.name_ar.trim(),
    headline_en: form.headline_en.trim() || null,
    headline_ar: form.headline_ar.trim() || null,
    description_en: form.description_en.trim() || null,
    description_ar: form.description_ar.trim() || null,
    promo_price: Number(form.promo_price),
    original_price: originalPrice,
    image_url: form.image_url.trim() || null,
    model_asset_url: form.model_asset_url.trim() || null,
    badge_text_en: form.badge_text_en.trim() || null,
    badge_text_ar: form.badge_text_ar.trim() || null,
    accent_color: form.accent_color || null,
    secondary_color: form.secondary_color || null,
    starts_at: fromDateTimeInput(form.starts_at),
    ends_at: fromDateTimeInput(form.ends_at),
    is_active: form.is_active,
    is_featured: form.is_featured,
    display_order: Number(form.display_order),
    items: form.items.map((item, index) => ({
      product_id: item.product_id,
      item_role: item.item_role,
      quantity: Number(item.quantity),
      display_order: index,
    })),
  }
}

function hydrateForm(combo: ComboPromotionRecord): ComboFormState {
  return {
    name_en: combo.name_en,
    name_ar: combo.name_ar,
    headline_en: combo.headline_en ?? '',
    headline_ar: combo.headline_ar ?? '',
    description_en: combo.description_en ?? '',
    description_ar: combo.description_ar ?? '',
    promo_price: combo.promo_price,
    image_url: combo.image_url ?? '',
    model_asset_url: combo.model_asset_url ?? '',
    badge_text_en: combo.badge_text_en ?? '',
    badge_text_ar: combo.badge_text_ar ?? '',
    accent_color: combo.accent_color ?? '#B8975A',
    secondary_color: combo.secondary_color ?? '#6D28D9',
    starts_at: toDateTimeInput(combo.starts_at),
    ends_at: toDateTimeInput(combo.ends_at),
    is_active: combo.is_active,
    is_featured: combo.is_featured,
    display_order: combo.display_order,
    items: combo.items.map((item, index) => ({
      category_id: item.product?.category_id ?? item.product?.category?.id ?? '',
      product_id: item.product_id,
      item_role: item.item_role,
      quantity: item.quantity,
      display_order: index,
    })),
  }
}

function mergeCatalogWithComboItems(
  catalog: ComboCatalogProduct[],
  combo: ComboPromotionRecord
): ComboCatalogProduct[] {
  const merged = new Map(catalog.map((product) => [product.id, product]))
  for (const item of combo.items) {
    if (item.product && !merged.has(item.product.id)) {
      merged.set(item.product.id, item.product)
    }
  }
  return [...merged.values()].sort((a, b) => a.name_en.localeCompare(b.name_en))
}

export default function ComboPromotionsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [combos, setCombos] = useState<ComboPromotionRecord[]>([])
  const [categories, setCategories] = useState<ComboCatalogCategory[]>([])
  const [products, setProducts] = useState<ComboCatalogProduct[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingCombo, setEditingCombo] = useState<ComboPromotionRecord | null>(null)
  const [form, setForm] = useState<ComboFormState>(EMPTY_FORM)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [comboRows, categoryRows, productRows] = await Promise.all([
        listComboPromotions(),
        listComboCatalogCategories(),
        listComboCatalogProducts(),
      ])
      setCombos(comboRows)
      setCategories(categoryRows)
      setProducts(productRows)
    } catch (error) {
      console.error('Failed to load combo promotions:', error)
    } finally {
      setLoading(false)
    }
  }

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  )

  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [categories]
  )

  const originalPrice = useMemo(
    () =>
      form.items.reduce((sum, item) => {
        const product = productMap.get(item.product_id)
        return sum + (product?.base_price ?? 0) * item.quantity
      }, 0),
    [form.items, productMap]
  )

  const savings = Math.max(0, originalPrice - form.promo_price)

  function openCreate() {
    setEditingCombo(null)
    setForm({ ...EMPTY_FORM, display_order: combos.length })
    setShowForm(true)
  }

  async function openEdit(combo: ComboPromotionRecord) {
    setEditingCombo(combo)
    setForm(hydrateForm(combo))
    setShowForm(true)
    try {
      const fresh = await fetchComboPromotionById(combo.id)
      const record = fresh ?? combo
      setEditingCombo(record)
      setProducts((current) => mergeCatalogWithComboItems(current, record))
      setForm(hydrateForm(record))
    } catch (error) {
      console.error('Failed to reload combo for edit:', error)
    }
  }

  function closeForm() {
    setShowForm(false)
    setEditingCombo(null)
    setForm(EMPTY_FORM)
  }

  function addItemRow() {
    const firstCategoryId = categories[0]?.id ?? ''
    const firstProduct = products.find((product) => product.category_id === firstCategoryId) ?? products[0]
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          category_id: firstCategoryId || firstProduct?.category_id || '',
          product_id: firstProduct?.id ?? '',
          item_role: 'main',
          quantity: 1,
          display_order: current.items.length,
        },
      ],
    }))
  }

  function updateItemRow(index: number, patch: Partial<ComboItemDraft>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  function updateItemCategory(index: number, categoryId: string) {
    const categoryProducts = products.filter((product) => product.category_id === categoryId)

    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              category_id: categoryId,
              product_id: categoryProducts.some((product) => product.id === item.product_id)
                ? item.product_id
                : (categoryProducts[0]?.id ?? ''),
            }
          : item
      ),
    }))
  }

  function removeItemRow(index: number) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  async function saveCombo() {
    if (!form.name_en.trim() || form.items.length === 0 || form.promo_price <= 0) return

    setSaving(true)
    try {
      const input = toMutationInput(form, originalPrice)
      if (editingCombo) {
        await updateComboPromotion(editingCombo.id, input)
      } else {
        await createComboPromotion(input)
      }
      closeForm()
      await loadData()
    } catch (error) {
      console.error('Failed to save combo promotion:', error)
      alert('Failed to save combo promotion.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(combo: ComboPromotionRecord) {
    try {
      await toggleComboPromotion(combo.id, !combo.is_active)
      setCombos((current) =>
        current.map((item) =>
          item.id === combo.id ? { ...item, is_active: !combo.is_active } : item
        )
      )
    } catch (error) {
      console.error('Failed to toggle combo promotion:', error)
    }
  }

  async function handleDelete(combo: ComboPromotionRecord) {
    if (!confirm(`Delete "${combo.name_en}"?`)) return

    try {
      await deleteComboPromotion(combo.id)
      setCombos((current) => current.filter((item) => item.id !== combo.id))
    } catch (error) {
      console.error('Failed to delete combo promotion:', error)
      alert('Failed to delete combo promotion.')
    }
  }

  return (
    <div className="combo-admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Combo Promotions</h1>
          <p className="page-sub">
            Fixed-price bundles for meals and meal-plus-drink offers.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + Create Combo
        </button>
      </div>

      {loading ? (
        <div className="combo-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="combo-skeleton" />
          ))}
        </div>
      ) : combos.length === 0 ? (
        <div className="empty-state">
          <span>◌</span>
          <p>No combo promotions yet</p>
          <button className="btn btn-ghost" onClick={openCreate}>
            Create your first combo
          </button>
        </div>
      ) : (
        <div className="combo-grid">
          {combos.map((combo) => {
            const comboSavings = Math.max(0, combo.original_price - combo.promo_price)
            const hasDrink = combo.items.some(
              (item) => item.item_role === 'drink' || item.item_role === 'optional_drink'
            )

            return (
              <article
                key={combo.id}
                className={`combo-card ${combo.is_active ? '' : 'inactive'}`}
                style={{
                  ['--combo-accent' as string]: combo.accent_color ?? '#B8975A',
                  ['--combo-secondary' as string]: combo.secondary_color ?? '#6D28D9',
                }}
              >
                <div className="combo-card-media">
                  {combo.image_url ? (
                    <img src={combo.image_url} alt={combo.name_en} />
                  ) : (
                    <div className="combo-card-fallback">{hasDrink ? 'Meal + Drink' : 'Combo Meal'}</div>
                  )}
                </div>
                <div className="combo-card-body">
                  <div className="combo-card-badges">
                    <span className="combo-badge">
                      {combo.badge_text_en ?? (hasDrink ? 'Meal + drink' : 'Meal only')}
                    </span>
                    {!combo.is_active && <span className="badge badge-cancelled">Inactive</span>}
                    {combo.is_featured && <span className="badge badge-confirmed">Featured</span>}
                  </div>

                  <h3 className="combo-card-title">{combo.name_en}</h3>
                  <p className="combo-card-subtitle">{combo.headline_en ?? combo.description_en ?? 'Bundle ready for the menu spotlight.'}</p>

                  <div className="combo-card-price">
                    <strong>QAR {combo.promo_price.toFixed(2)}</strong>
                    <span>QAR {combo.original_price.toFixed(2)}</span>
                    <em>Save QAR {comboSavings.toFixed(2)}</em>
                  </div>

                  <div className="combo-card-items">
                    {combo.items.map((item) => (
                      <span key={item.id} className="combo-chip">
                        {item.quantity}x {item.product?.name_en ?? 'Menu item'}
                      </span>
                    ))}
                  </div>

                  <div className="combo-card-actions">
                    <button className="btn btn-ghost" onClick={() => openEdit(combo)}>
                      Edit
                    </button>
                    <button
                      className={`btn ${combo.is_active ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() => handleToggle(combo)}
                    >
                      {combo.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => handleDelete(combo)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="combo-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingCombo ? 'Edit combo promotion' : 'Create combo promotion'}</h2>
                <p>Build a fixed-price bundle and choose the items that must be in the cart.</p>
              </div>
              <button className="modal-close" onClick={closeForm}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="field-group">
                  <label>Name (English)</label>
                  <input
                    value={form.name_en}
                    onChange={(event) => setForm((current) => ({ ...current, name_en: event.target.value }))}
                  />
                </div>
                <div className="field-group">
                  <label>Name (Arabic)</label>
                  <input
                    dir="rtl"
                    value={form.name_ar}
                    onChange={(event) => setForm((current) => ({ ...current, name_ar: event.target.value }))}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label>Headline (English)</label>
                  <input
                    value={form.headline_en}
                    onChange={(event) => setForm((current) => ({ ...current, headline_en: event.target.value }))}
                  />
                </div>
                <div className="field-group">
                  <label>Headline (Arabic)</label>
                  <input
                    dir="rtl"
                    value={form.headline_ar}
                    onChange={(event) => setForm((current) => ({ ...current, headline_ar: event.target.value }))}
                  />
                </div>
              </div>

              <div className="field-group">
                <label>Description (English)</label>
                <textarea
                  rows={3}
                  value={form.description_en}
                  onChange={(event) => setForm((current) => ({ ...current, description_en: event.target.value }))}
                />
              </div>

              <div className="field-group">
                <label>Description (Arabic)</label>
                <textarea
                  rows={3}
                  dir="rtl"
                  value={form.description_ar}
                  onChange={(event) => setForm((current) => ({ ...current, description_ar: event.target.value }))}
                />
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label>Promo price (QAR)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.promo_price}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        promo_price: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="field-group">
                  <label>Original value</label>
                  <div className="readonly-stat">QAR {originalPrice.toFixed(2)}</div>
                </div>
              </div>

              <div className="combo-metric-strip">
                <div>
                  <span>Bundle value</span>
                  <strong>QAR {originalPrice.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Promo price</span>
                  <strong>QAR {form.promo_price.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Customer savings</span>
                  <strong>QAR {savings.toFixed(2)}</strong>
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label>Badge (English)</label>
                  <input
                    value={form.badge_text_en}
                    onChange={(event) => setForm((current) => ({ ...current, badge_text_en: event.target.value }))}
                  />
                </div>
                <div className="field-group">
                  <label>Badge (Arabic)</label>
                  <input
                    dir="rtl"
                    value={form.badge_text_ar}
                    onChange={(event) => setForm((current) => ({ ...current, badge_text_ar: event.target.value }))}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label>Accent color</label>
                  <input
                    type="color"
                    value={form.accent_color}
                    onChange={(event) => setForm((current) => ({ ...current, accent_color: event.target.value }))}
                  />
                </div>
                <div className="field-group">
                  <label>Secondary color</label>
                  <input
                    type="color"
                    value={form.secondary_color}
                    onChange={(event) => setForm((current) => ({ ...current, secondary_color: event.target.value }))}
                  />
                </div>
              </div>

              <ImageUpload
                label="Combo card image"
                value={form.image_url}
                onChange={(url) => setForm((current) => ({ ...current, image_url: url }))}
              />

              <div className="field-group">
                <label>3D model asset URL (optional)</label>
                <input
                  value={form.model_asset_url}
                  onChange={(event) => setForm((current) => ({ ...current, model_asset_url: event.target.value }))}
                />
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label>Starts at</label>
                  <input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(event) => setForm((current) => ({ ...current, starts_at: event.target.value }))}
                  />
                </div>
                <div className="field-group">
                  <label>Ends at</label>
                  <input
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(event) => setForm((current) => ({ ...current, ends_at: event.target.value }))}
                  />
                </div>
              </div>

              <div className="form-grid">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                  />
                  <span>Active</span>
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={form.is_featured}
                    onChange={(event) => setForm((current) => ({ ...current, is_featured: event.target.checked }))}
                  />
                  <span>Featured on menu</span>
                </label>
              </div>

              <div className="field-group">
                <label>Display order</label>
                <input
                  type="number"
                  min="0"
                  value={form.display_order}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      display_order: Number(event.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="items-builder">
                <div className="items-builder-head">
                  <div>
                    <h3>Included items</h3>
                    <p>Choose the exact products that must be present for the bundle price to apply.</p>
                  </div>
                  <button className="btn btn-ghost" onClick={addItemRow}>
                    + Add Item
                  </button>
                </div>

                {form.items.length === 0 ? (
                  <div className="empty-inline">Add at least one product to define the combo.</div>
                ) : (
                  <div className="items-builder-list">
                    {form.items.map((item, index) => {
                      const categoryProducts = item.category_id
                        ? products.filter((product) => product.category_id === item.category_id)
                        : products
                      const selectedProduct = productMap.get(item.product_id)
                      const filteredProducts =
                        selectedProduct &&
                        !categoryProducts.some((product) => product.id === selectedProduct.id)
                          ? [selectedProduct, ...categoryProducts]
                          : categoryProducts

                      return (
                      <div key={`${item.product_id}-${index}`} className="combo-item-row">
                        <select
                          value={item.category_id}
                          onChange={(event) => updateItemCategory(index, event.target.value)}
                        >
                          <option value="">Select category</option>
                          {categoryOptions.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name_en}
                            </option>
                          ))}
                        </select>

                        <select
                          value={item.product_id}
                          onChange={(event) =>
                            updateItemRow(index, {
                              product_id: event.target.value,
                              category_id: productMap.get(event.target.value)?.category_id ?? item.category_id,
                            })
                          }
                        >
                          <option value="">Select product</option>
                          {filteredProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name_en}
                            </option>
                          ))}
                        </select>

                        <select
                          value={item.item_role}
                          onChange={(event) =>
                            updateItemRow(index, { item_role: event.target.value as ComboItemRole })
                          }
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) =>
                            updateItemRow(index, {
                              quantity: Math.max(1, Number(event.target.value) || 1),
                            })
                          }
                        />

                        <button className="btn btn-ghost" onClick={() => removeItemRow(index)}>
                          Remove
                        </button>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeForm}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveCombo}
                disabled={saving || !form.name_en.trim() || form.items.length === 0}
              >
                {saving ? 'Saving…' : editingCombo ? 'Save Changes' : 'Create Combo'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .combo-admin-page { animation: fadeIn 0.25s ease; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.25rem; }
        .page-title { font-size: 1.45rem; font-weight: 700; }
        .page-sub { color: var(--text-muted); font-size: 0.78rem; margin-top: 0.2rem; }
        .combo-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); }
        .combo-skeleton { height: 320px; border-radius: 20px; background: var(--bg-3); animation: pulse 1.5s infinite; }
        .combo-card {
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--combo-accent) 22%, var(--border));
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--combo-secondary) 18%, transparent), transparent 36%),
            linear-gradient(160deg, rgba(255,255,255,0.04), transparent 35%),
            var(--bg-card);
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
        }
        .combo-card.inactive { opacity: 0.58; }
        .combo-card-media { aspect-ratio: 16 / 10; background: var(--bg-2); }
        .combo-card-media img,
        .combo-card-fallback {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: grid;
          place-items: center;
        }
        .combo-card-fallback {
          background: linear-gradient(135deg, color-mix(in srgb, var(--combo-accent) 22%, transparent), color-mix(in srgb, var(--combo-secondary) 18%, transparent));
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .combo-card-body { padding: 1rem; }
        .combo-card-badges { display: flex; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
        .combo-badge {
          padding: 0.3rem 0.65rem;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 700;
          background: color-mix(in srgb, var(--combo-accent) 18%, transparent);
          color: var(--text);
        }
        .combo-card-title { font-size: 1.12rem; font-weight: 700; margin-bottom: 0.25rem; }
        .combo-card-subtitle { color: var(--text-muted); font-size: 0.82rem; line-height: 1.5; min-height: 2.6rem; }
        .combo-card-price { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; margin: 0.9rem 0; }
        .combo-card-price strong { font-size: 1.25rem; color: var(--gold); }
        .combo-card-price span { text-decoration: line-through; color: var(--text-muted); }
        .combo-card-price em { font-style: normal; color: var(--green); font-weight: 700; }
        .combo-card-items { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 0.95rem; }
        .combo-chip {
          padding: 0.38rem 0.62rem;
          border-radius: 999px;
          font-size: 0.74rem;
          background: var(--bg-3);
          border: 1px solid var(--border);
        }
        .combo-card-actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 4rem 1rem;
          border-radius: 20px;
          border: 1px dashed var(--border-2);
          color: var(--text-muted);
        }
        .empty-state span { font-size: 2rem; }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 400;
          background: rgba(0,0,0,0.72);
          padding: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .combo-modal {
          width: min(880px, 100%);
          max-height: 92dvh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-radius: 22px;
          background: var(--bg-2);
          border: 1px solid var(--border-2);
          box-shadow: 0 32px 90px rgba(0, 0, 0, 0.35);
        }
        .modal-header,
        .modal-footer {
          padding: 1rem 1.2rem;
          border-bottom: 1px solid var(--border);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .modal-header h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 0.2rem; }
        .modal-header p { font-size: 0.78rem; color: var(--text-muted); }
        .modal-close {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--bg-3);
          color: var(--text-muted);
          display: grid;
          place-items: center;
        }
        .modal-body {
          padding: 1.1rem 1.2rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .modal-footer {
          border-top: 1px solid var(--border);
          border-bottom: none;
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        .form-grid { display: grid; gap: 0.85rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }
        .field-group label {
          display: block;
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
          color: var(--text-muted);
          margin-bottom: 0.35rem;
        }
        .readonly-stat {
          min-height: 42px;
          display: flex;
          align-items: center;
          padding: 0.7rem 0.85rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          font-weight: 700;
        }
        .combo-metric-strip {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        @media (max-width: 720px) { .combo-metric-strip { grid-template-columns: 1fr; } }
        .combo-metric-strip > div {
          padding: 0.85rem 0.95rem;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--bg-card);
        }
        .combo-metric-strip span {
          display: block;
          font-size: 0.68rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 0.35rem;
        }
        .combo-metric-strip strong { font-size: 1rem; }
        .toggle-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.88rem;
          color: var(--text-soft);
        }
        .toggle-label input { width: auto; }
        .items-builder {
          border-radius: 18px;
          padding: 1rem;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.02);
        }
        .items-builder-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 0.9rem;
        }
        .items-builder-head h3 { font-size: 0.95rem; font-weight: 700; margin-bottom: 0.2rem; }
        .items-builder-head p,
        .empty-inline {
          font-size: 0.76rem;
          color: var(--text-muted);
        }
        .items-builder-list { display: flex; flex-direction: column; gap: 0.7rem; }
        .combo-item-row {
          display: grid;
          gap: 0.55rem;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.8fr) minmax(0, 1fr) 90px auto;
        }
        @media (max-width: 720px) {
          .combo-item-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
