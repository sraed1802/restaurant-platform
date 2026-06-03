// apps/admin/src/pages/MenuEditorPage.tsx
import { useState, useEffect, useRef, type ChangeEvent, type DragEvent } from 'react'
import { supabase } from '../lib/supabase'
import ImageUpload from '../components/ImageUpload'
import { asMutationArg, asMutationRowsArg } from '../lib/supabaseTypeWorkarounds'
import { getSupabaseFunctionErrorMessage } from '../lib/supabaseFunctionErrors'
import {
  downloadCategoryTemplate,
  downloadModifierGroupTemplate,
  importCategoriesCsv,
  importModifierGroupsCsv,
  type MenuCsvImportSummary,
} from '../services/menuCsv'
import { persistCategoryDisplayOrder, reorderCategoriesById } from '../services/menuCategories'

type StaffRole = 'admin' | 'manager' | 'supervisor' | null

interface MenuEditorPageProps {
  staffRole: StaffRole
}

interface Category {
  id: string
  name_en: string
  name_ar: string
  description_en: string | null
  description_ar: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
}
interface Product {
  id: string; category_id: string; name_en: string; name_ar: string
  description_en: string | null; description_ar: string | null
  base_price: number; image_url: string | null; is_available: boolean
  is_featured: boolean; prep_time_minutes: number; calories: number | null
  display_order: number
}

interface ModifierGroup {
  id: string
  name_en: string
  name_ar: string
  selection_type: 'single' | 'multiple'
  min_selections: number
  max_selections: number
  is_required: boolean
  display_order: number
}

interface ImportFeedback {
  tone: 'success' | 'error'
  text: string
}

const EMPTY_PRODUCT = {
  name_en: '', name_ar: '', description_en: '', description_ar: '',
  base_price: 0, image_url: '', is_available: true, is_featured: false,
  prep_time_minutes: 15, calories: '', display_order: 0, category_id: '',
}

function summarizeImport(kind: 'categories' | 'modifier_groups', summary: MenuCsvImportSummary): string {
  const label = kind === 'categories' ? 'categories' : 'modifier groups'
  return `Imported ${summary.created + summary.updated} ${label}: ${summary.created} created, ${summary.updated} updated.`
}

export default function MenuEditorPage({ staffRole }: MenuEditorPageProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null)
  const [uploadingTarget, setUploadingTarget] = useState<'categories' | 'modifier_groups' | null>(null)
  const categoryUploadRef = useRef<HTMLInputElement | null>(null)
  const modifierGroupUploadRef = useRef<HTMLInputElement | null>(null)
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null)
  const [categoryOrderSaving, setCategoryOrderSaving] = useState(false)
  const categoriesBeforeDragRef = useRef<Category[]>([])
  const categoriesRef = useRef(categories)
  const categoryDragCommitRef = useRef(false)

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  useEffect(() => { loadMenu() }, [])

  async function loadMenu() {
    setLoading(true)
    try {
      const [catRes, prodRes, groupRes] = await Promise.all([
        supabase.from('categories').select('*').order('display_order'),
        supabase.from('products').select('*').order('display_order'),
        supabase.from('modifier_groups').select('*').order('display_order'),
      ])

      const cats = (catRes.data ?? []) as Category[]
      setCategories(cats)
      setProducts((prodRes.data ?? []) as Product[])
      setModifierGroups((groupRes.data ?? []) as ModifierGroup[])
      if (cats.length > 0 && !cats.some((cat) => cat.id === selectedCat)) {
        setSelectedCat(cats[0].id)
      }
    } catch (error) {
      console.error('Failed to load menu data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveProduct() {
    if (!productForm.name_en || !productForm.category_id) return
    setSaving(true)
    try {
      const data = {
        ...productForm,
        base_price: Number(productForm.base_price),
        calories: productForm.calories ? Number(productForm.calories) : null,
        display_order: Number(productForm.display_order),
        image_url: productForm.image_url || null,
        description_en: productForm.description_en || null,
        description_ar: productForm.description_ar || null,
      }
      if (editingProduct) {
        const { error } = await supabase.from('products').update(asMutationArg(data)).eq('id', editingProduct.id)
        if (error) { alert('Failed to update product: ' + error.message); throw error; }
      } else {
        const { error } = await supabase.from('products').insert(asMutationRowsArg([data]))
        if (error) { alert('Failed to create product: ' + error.message); throw error; }
      }
      setShowProductForm(false)
      setEditingProduct(null)
      setProductForm(EMPTY_PRODUCT)
      await loadMenu()
    } finally {
      setSaving(false)
    }
  }

  async function toggleAvailability(product: Product) {
    await supabase.from('products').update(asMutationArg({ is_available: !product.is_available })).eq('id', product.id)
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_available: !p.is_available } : p))
  }

  async function toggleFeatured(product: Product) {
    await supabase.from('products').update(asMutationArg({ is_featured: !product.is_featured })).eq('id', product.id)
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_featured: !p.is_featured } : p))
  }

  async function deleteProduct(productId: string) {
    if (!confirm('Delete this product? This cannot be undone.')) return
    await supabase.from('products').delete().eq('id', productId)
    setProducts((prev) => prev.filter((p) => p.id !== productId))
  }

  async function toggleCategoryActive(cat: Category) {
    await supabase.from('categories').update(asMutationArg({ is_active: !cat.is_active })).eq('id', cat.id)
    setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, is_active: !c.is_active } : c))
  }

  function handleCategoryDragStart(event: DragEvent, categoryId: string) {
    categoryDragCommitRef.current = false
    categoriesBeforeDragRef.current = categoriesRef.current
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', categoryId)
    setDraggingCategoryId(categoryId)
  }

  function handleCategoryDragOver(event: DragEvent, hoverId: string) {
    event.preventDefault()
    if (!draggingCategoryId || draggingCategoryId === hoverId) return
    setCategories((prev) => reorderCategoriesById(prev, draggingCategoryId, hoverId))
  }

  async function handleCategoryDragEnd() {
    if (categoryDragCommitRef.current) return
    categoryDragCommitRef.current = true

    const dragId = draggingCategoryId
    setDraggingCategoryId(null)
    if (!dragId) return

    const before = categoriesBeforeDragRef.current
    const after = categoriesRef.current
    const orderChanged =
      before.length !== after.length ||
      before.some((cat, index) => cat.id !== after[index]?.id)

    if (!orderChanged) return

    setCategoryOrderSaving(true)
    try {
      await persistCategoryDisplayOrder(after.map((cat) => cat.id))
      setCategories((prev) => prev.map((cat, index) => ({ ...cat, display_order: index })))
      setImportFeedback({
        tone: 'success',
        text: 'Category order saved. The guest menu will show categories in this sequence.',
      })
    } catch (error) {
      console.error('Failed to save category order:', error)
      setCategories(before)
      setImportFeedback({
        tone: 'error',
        text: 'Could not save category order. Changes were reverted.',
      })
    } finally {
      setCategoryOrderSaving(false)
      categoriesBeforeDragRef.current = []
    }
  }

  function handleCategoryTemplateDownload() {
    downloadCategoryTemplate(
      categories.map((category) => ({
        system_id: category.id,
        name_en: category.name_en,
        name_ar: category.name_ar,
        description_en: category.description_en,
        description_ar: category.description_ar,
        image_url: category.image_url,
        display_order: category.display_order,
        is_active: category.is_active,
      }))
    )
    setImportFeedback({
      tone: 'success',
      text: 'Downloaded the categories CSV template with the current system IDs already filled in.',
    })
  }

  function handleModifierGroupTemplateDownload() {
    downloadModifierGroupTemplate(
      modifierGroups.map((group) => ({
        system_id: group.id,
        name_en: group.name_en,
        name_ar: group.name_ar,
        selection_type: group.selection_type,
        min_selections: group.min_selections,
        max_selections: group.max_selections,
        is_required: group.is_required,
        display_order: group.display_order,
      }))
    )
    setImportFeedback({
      tone: 'success',
      text: 'Downloaded the modifier groups CSV template with the current system IDs already filled in.',
    })
  }

  async function handleCsvUpload(kind: 'categories' | 'modifier_groups', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploadingTarget(kind)
    setImportFeedback(null)

    try {
      const csvText = await file.text()
      const summary =
        kind === 'categories'
          ? await importCategoriesCsv(csvText)
          : await importModifierGroupsCsv(csvText)

      setImportFeedback({
        tone: 'success',
        text: summarizeImport(kind, summary),
      })
      await loadMenu()
    } catch (error) {
      setImportFeedback({
        tone: 'error',
        text: await getSupabaseFunctionErrorMessage(
          error,
          kind === 'categories'
            ? 'Failed to import categories CSV.'
            : 'Failed to import modifier groups CSV.'
        ),
      })
    } finally {
      setUploadingTarget(null)
    }
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product)
    setProductForm({
      name_en: product.name_en, name_ar: product.name_ar,
      description_en: product.description_en ?? '', description_ar: product.description_ar ?? '',
      base_price: product.base_price, image_url: product.image_url ?? '',
      is_available: product.is_available, is_featured: product.is_featured,
      prep_time_minutes: product.prep_time_minutes, calories: product.calories?.toString() ?? '',
      display_order: product.display_order, category_id: product.category_id,
    })
    setShowProductForm(true)
  }

  const catProducts = products.filter((p) => {
    const inCat = selectedCat ? p.category_id === selectedCat : true
    const matchSearch = !searchTerm || p.name_en.toLowerCase().includes(searchTerm.toLowerCase()) || p.name_ar.includes(searchTerm)
    return inCat && matchSearch
  })

  const selectedCatObj = categories.find((c) => c.id === selectedCat)

  return (
    <div className="menu-editor">
      <div className="page-header">
        <div>
          <h1 className="page-title">Menu Editor</h1>
          <p className="page-sub">{products.length} products · {categories.length} categories · {modifierGroups.length} modifier groups</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingProduct(null); setProductForm({ ...EMPTY_PRODUCT, category_id: selectedCat }); setShowProductForm(true) }}>
          + Add Product
        </button>
      </div>

      {staffRole === 'admin' && (
        <section className="bulk-menu-tools">
          <div className="bulk-menu-tools-head">
            <div>
              <h2 className="bulk-menu-tools-title">CSV Bulk Update</h2>
              <p className="bulk-menu-tools-sub">
                Download the live template, edit it in Excel or Google Sheets, then upload it here. Existing rows keep their
                `system_id` automatically, and new rows can leave `system_id` blank so the system generates it.
              </p>
            </div>
            <span className="bulk-menu-badge">Admin only</span>
          </div>

          {importFeedback && (
            <div className={`bulk-menu-feedback ${importFeedback.tone}`}>
              {importFeedback.text}
            </div>
          )}

          <div className="bulk-menu-grid">
            <article className="bulk-menu-card">
              <div>
                <h3>Categories CSV</h3>
                <p>Update category names, descriptions, images, ordering, and active status.</p>
              </div>
              <div className="bulk-menu-actions">
                <button className="btn btn-ghost" type="button" onClick={handleCategoryTemplateDownload}>
                  Download Template
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => categoryUploadRef.current?.click()}
                  disabled={uploadingTarget !== null}
                >
                  {uploadingTarget === 'categories' ? 'Uploading…' : 'Upload CSV'}
                </button>
              </div>
            </article>

            <article className="bulk-menu-card">
              <div>
                <h3>Modifier Groups CSV</h3>
                <p>Update option groups like size and extras without editing UUIDs manually.</p>
              </div>
              <div className="bulk-menu-actions">
                <button className="btn btn-ghost" type="button" onClick={handleModifierGroupTemplateDownload}>
                  Download Template
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => modifierGroupUploadRef.current?.click()}
                  disabled={uploadingTarget !== null}
                >
                  {uploadingTarget === 'modifier_groups' ? 'Uploading…' : 'Upload CSV'}
                </button>
              </div>
            </article>
          </div>

          <input
            ref={categoryUploadRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              void handleCsvUpload('categories', event)
            }}
          />
          <input
            ref={modifierGroupUploadRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              void handleCsvUpload('modifier_groups', event)
            }}
          />
        </section>
      )}

      <div className="editor-layout">
        {/* Category Sidebar */}
        <aside className="cat-sidebar">
          <div className="cat-sidebar-header">
            <span className="sidebar-section-label">Categories</span>
            <p className="cat-sidebar-hint">
              {categoryOrderSaving
                ? 'Saving order…'
                : 'Drag to set guest menu order (top → bottom)'}
            </p>
          </div>
          {loading ? (
            <div className="cat-skeleton-list">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="cat-skeleton" />
              ))}
            </div>
          ) : (
            <div className="cat-list">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`cat-item ${selectedCat === cat.id ? 'active' : ''} ${!cat.is_active ? 'inactive' : ''} ${draggingCategoryId === cat.id ? 'dragging' : ''}`}
                  onDragOver={(event) => handleCategoryDragOver(event, cat.id)}
                  onDrop={(event) => {
                    event.preventDefault()
                    void handleCategoryDragEnd()
                  }}
                >
                  <span
                    className="cat-drag-handle"
                    draggable={!categoryOrderSaving}
                    title="Drag to reorder"
                    aria-label={`Reorder ${cat.name_en}`}
                    onDragStart={(event) => handleCategoryDragStart(event, cat.id)}
                    onDragEnd={() => {
                      void handleCategoryDragEnd()
                    }}
                  >
                    ⋮⋮
                  </span>
                  <button
                    type="button"
                    className="cat-item-select"
                    onClick={() => setSelectedCat(cat.id)}
                  >
                    <span className="cat-item-name">{cat.name_en}</span>
                    <span className="cat-item-count">
                      {products.filter((p) => p.category_id === cat.id).length}
                    </span>
                    {!cat.is_active && <span className="cat-inactive-badge">Hidden</span>}
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Product List */}
        <div className="product-panel">
          <div className="product-panel-header">
            {selectedCatObj && (
              <div className="cat-title-row">
                <div>
                  <h2 className="cat-panel-title">{selectedCatObj.name_en}</h2>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{selectedCatObj.name_ar}</p>
                </div>
                <button
                  className={`btn ${selectedCatObj.is_active ? 'btn-ghost' : 'btn-primary'}`}
                  style={{ fontSize: '0.72rem' }}
                  onClick={() => toggleCategoryActive(selectedCatObj)}
                >
                  {selectedCatObj.is_active ? 'Hide Category' : 'Show Category'}
                </button>
              </div>
            )}
            <input
              className="search-input"
              placeholder="Search products…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ marginTop: '0.75rem' }}
            />
          </div>

          {loading ? (
            <div className="product-list">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="product-row-skeleton" />)}
            </div>
          ) : catProducts.length === 0 ? (
            <div className="empty-state">
              <span>◧</span>
              <p>No products in this category</p>
              <button className="btn btn-ghost" onClick={() => { setProductForm({ ...EMPTY_PRODUCT, category_id: selectedCat }); setShowProductForm(true) }}>
                Add first product
              </button>
            </div>
          ) : (
            <div className="product-list">
              {catProducts.map((product) => (
                <div key={product.id} className={`product-row ${!product.is_available ? 'unavailable' : ''}`}>
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name_en} className="product-thumb" />
                  ) : (
                    <div className="product-thumb-placeholder">🍽</div>
                  )}
                  <div className="product-row-info">
                    <div className="product-row-title">
                      <span className="product-row-name">{product.name_en}</span>
                      {product.is_featured && <span className="featured-badge">✦ Featured</span>}
                      {!product.is_available && <span className="unavailable-badge">Unavailable</span>}
                    </div>
                    <span className="product-row-name-ar">{product.name_ar}</span>
                    <div className="product-row-meta">
                      <span className="product-price mono">QAR {product.base_price.toFixed(2)}</span>
                      <span className="product-prep">⏱ {product.prep_time_minutes}m</span>
                      {product.calories && <span className="product-cal">{product.calories} kcal</span>}
                    </div>
                  </div>
                  <div className="product-row-actions">
                    <button
                      className={`toggle-btn ${product.is_available ? 'on' : 'off'}`}
                      onClick={() => toggleAvailability(product)}
                      title={product.is_available ? 'Mark unavailable' : 'Mark available'}
                    >
                      {product.is_available ? '●' : '○'}
                    </button>
                    <button
                      className={`star-btn ${product.is_featured ? 'starred' : ''}`}
                      onClick={() => toggleFeatured(product)}
                      title={product.is_featured ? 'Remove from featured' : 'Add to featured'}
                    >
                      ✦
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }} onClick={() => openEditProduct(product)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }} onClick={() => deleteProduct(product.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Form Modal */}
      {showProductForm && (
        <div className="modal-backdrop" onClick={() => setShowProductForm(false)}>
          <div className="product-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => setShowProductForm(false)} className="sl-close">✕</button>
            </div>
            <div className="product-form-body">
              <div className="form-cols">
                <div className="field-group">
                  <label>Name (English) *</label>
                  <input value={productForm.name_en} onChange={(e) => setProductForm((f) => ({ ...f, name_en: e.target.value }))} placeholder="Product name in English" />
                </div>
                <div className="field-group">
                  <label>Name (Arabic) *</label>
                  <input value={productForm.name_ar} onChange={(e) => setProductForm((f) => ({ ...f, name_ar: e.target.value }))} placeholder="اسم المنتج بالعربية" dir="rtl" />
                </div>
              </div>
              <div className="form-cols">
                <div className="field-group">
                  <label>Description (English)</label>
                  <textarea value={productForm.description_en} onChange={(e) => setProductForm((f) => ({ ...f, description_en: e.target.value }))} rows={2} />
                </div>
                <div className="field-group">
                  <label>Description (Arabic)</label>
                  <textarea value={productForm.description_ar} onChange={(e) => setProductForm((f) => ({ ...f, description_ar: e.target.value }))} rows={2} dir="rtl" />
                </div>
              </div>
              <div className="form-cols-3">
                <div className="field-group">
                  <label>Price (QAR) *</label>
                  <input type="number" step="0.001" min="0" value={productForm.base_price} onChange={(e) => setProductForm((f) => ({ ...f, base_price: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="field-group">
                  <label>Prep Time (min)</label>
                  <input type="number" min="1" value={productForm.prep_time_minutes} onChange={(e) => setProductForm((f) => ({ ...f, prep_time_minutes: parseInt(e.target.value) || 15 }))} />
                </div>
                <div className="field-group">
                  <label>Calories</label>
                  <input type="number" min="0" value={productForm.calories} onChange={(e) => setProductForm((f) => ({ ...f, calories: e.target.value }))} placeholder="Optional" />
                </div>
              </div>
              <div className="field-group">
                <label>Category *</label>
                <select value={productForm.category_id} onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}>
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_en}</option>
                  ))}
                </select>
              </div>
              <ImageUpload
                value={productForm.image_url}
                onChange={(url) => setProductForm((f) => ({ ...f, image_url: url }))}
                label="Product Image"
                compressMaxDimension={1280}
              />
              <div className="toggle-row">
                <label className="toggle-label">
                  <input type="checkbox" checked={productForm.is_available} onChange={(e) => setProductForm((f) => ({ ...f, is_available: e.target.checked }))} />
                  <span>Available for ordering</span>
                </label>
                <label className="toggle-label">
                  <input type="checkbox" checked={productForm.is_featured} onChange={(e) => setProductForm((f) => ({ ...f, is_featured: e.target.checked }))} />
                  <span>Featured (AI boosted)</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowProductForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProduct} disabled={saving || !productForm.name_en || !productForm.category_id}>
                {saving ? 'Saving…' : editingProduct ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .menu-editor { animation: fadeIn 0.3s ease; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; gap: 0.75rem; flex-wrap: wrap; }
        .page-title { font-size: 1.4rem; font-weight: 700; }
        .page-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }
        .bulk-menu-tools {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1rem 1.1rem;
          margin-bottom: 1rem;
        }
        .bulk-menu-tools-head {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          align-items: flex-start;
          margin-bottom: 0.9rem;
        }
        .bulk-menu-tools-title { font-size: 0.95rem; font-weight: 700; margin-bottom: 0.2rem; }
        .bulk-menu-tools-sub { max-width: 780px; font-size: 0.74rem; line-height: 1.55; color: var(--text-muted); }
        .bulk-menu-badge {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--gold);
          background: var(--gold-dim);
          border: 1px solid rgba(201, 167, 97, 0.3);
          border-radius: 999px;
          padding: 0.35rem 0.6rem;
        }
        .bulk-menu-feedback {
          border-radius: 10px;
          padding: 0.7rem 0.8rem;
          font-size: 0.78rem;
          margin-bottom: 0.9rem;
        }
        .bulk-menu-feedback.success {
          background: rgba(26, 127, 55, 0.12);
          border: 1px solid rgba(46, 160, 67, 0.3);
          color: #9be9a8;
        }
        .bulk-menu-feedback.error {
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid rgba(248, 81, 73, 0.28);
          color: #ffb3ad;
        }
        .bulk-menu-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .bulk-menu-card {
          border: 1px solid var(--border);
          background: var(--bg-2);
          border-radius: 14px;
          padding: 0.95rem;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }
        .bulk-menu-card h3 { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.25rem; }
        .bulk-menu-card p { font-size: 0.72rem; line-height: 1.5; color: var(--text-muted); }
        .bulk-menu-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }

        .editor-layout { display: grid; grid-template-columns: 200px 1fr; gap: 1rem; align-items: start; }
        @media (max-width: 768px) { .editor-layout { grid-template-columns: 1fr; } }

        .cat-sidebar { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; position: sticky; top: 1rem; }
        .cat-sidebar-header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
        .cat-sidebar-hint { margin-top: 0.35rem; font-size: 0.65rem; line-height: 1.4; color: var(--text-muted); }
        .sidebar-section-label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
        .cat-list { display: flex; flex-direction: column; }
        .cat-item { display: flex; align-items: stretch; gap: 0; border-bottom: 1px solid var(--border); transition: background var(--transition), opacity var(--transition); }
        .cat-item:last-child { border-bottom: none; }
        .cat-item:hover { background: var(--bg-3); }
        .cat-item.active { background: var(--bg-3); border-left: 2px solid var(--gold); }
        .cat-item.inactive { opacity: 0.5; }
        .cat-item.dragging { opacity: 0.65; }
        .cat-drag-handle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          flex-shrink: 0;
          cursor: grab;
          color: var(--text-muted);
          font-size: 0.7rem;
          letter-spacing: -0.12em;
          user-select: none;
          touch-action: none;
        }
        .cat-drag-handle:active { cursor: grabbing; }
        .cat-item-select {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 1rem 0.65rem 0.25rem;
          text-align: left;
          min-width: 0;
        }
        .cat-item-name { flex: 1; font-size: 0.8rem; font-weight: 500; color: var(--text); }
        .cat-item-count { font-size: 0.62rem; font-family: var(--font-mono); color: var(--text-muted); background: var(--bg-2); padding: 0.1rem 0.3rem; border-radius: 3px; }
        .cat-inactive-badge { font-size: 0.6rem; color: var(--amber); background: var(--amber-dim); padding: 0.1rem 0.3rem; border-radius: 3px; }
        .cat-skeleton-list { display: flex; flex-direction: column; gap: 4px; padding: 8px; }
        .cat-skeleton { height: 36px; background: var(--bg-3); border-radius: 6px; animation: pulse 1.5s infinite; }

        .product-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
        .product-panel-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
        .cat-title-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .cat-panel-title { font-size: 1rem; font-weight: 700; }
        .search-input { font-size: 0.78rem; }
        .product-list { display: flex; flex-direction: column; }
        .product-row { display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--border); transition: background var(--transition); }
        .product-row:last-child { border-bottom: none; }
        .product-row:hover { background: var(--bg-3); }
        .product-row.unavailable { opacity: 0.55; }
        .product-thumb { width: 52px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
        .product-thumb-placeholder { width: 52px; height: 40px; border-radius: 6px; background: var(--bg-3); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; }
        .product-row-info { flex: 1; min-width: 0; }
        .product-row-title { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.15rem; }
        .product-row-name { font-size: 0.875rem; font-weight: 600; color: var(--text); }
        .product-row-name-ar { font-size: 0.72rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem; }
        .featured-badge { font-size: 0.6rem; background: var(--gold-dim); color: var(--gold); padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 700; }
        .unavailable-badge { font-size: 0.6rem; background: var(--red-dim); color: var(--red); padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 700; }
        .product-row-meta { display: flex; gap: 0.75rem; font-size: 0.7rem; color: var(--text-muted); }
        .product-price { color: var(--text); font-weight: 600; }
        .product-row-actions { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
        .toggle-btn { width: 28px; height: 28px; border-radius: 50%; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; transition: all var(--transition); }
        .toggle-btn.on { color: var(--green); }
        .toggle-btn.off { color: var(--text-muted); }
        .star-btn { width: 28px; height: 28px; border-radius: 50%; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; color: var(--text-muted); transition: all var(--transition); }
        .star-btn.starred { color: var(--gold); }
        .product-row-skeleton { height: 64px; margin: 4px 8px; background: var(--bg-3); border-radius: 8px; animation: pulse 1.5s infinite; }

        .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 4rem; color: var(--text-muted); }
        .empty-state span { font-size: 2rem; }
        .empty-state p { font-size: 0.875rem; }

        .modal-backdrop { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.2s ease; padding: 1rem; }
        .product-modal { width: 660px; max-width: 100%; max-height: 90dvh; background: var(--bg-2); border: 1px solid var(--border-2); border-radius: var(--radius-lg); display: flex; flex-direction: column; animation: slideIn 0.25s ease; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .modal-header h2 { font-size: 1rem; font-weight: 700; }
        .product-form-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; overflow-y: auto; flex: 1; }
        .form-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .form-cols-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
        @media (max-width: 480px) { .form-cols, .form-cols-3 { grid-template-columns: 1fr; } }
        .field-group label { display: block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.35rem; }
        .toggle-row { display: flex; gap: 1.5rem; flex-wrap: wrap; }
        .toggle-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-soft); cursor: pointer; }
        .toggle-label input[type="checkbox"] { width: auto; }
        .modal-footer { padding: 1rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.5rem; flex-shrink: 0; }
        .sl-close { width: 28px; height: 28px; border-radius: 6px; color: var(--text-muted); font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
        .sl-close:hover { background: var(--bg-3); }
        @media (max-width: 768px) {
          .bulk-menu-grid {
            grid-template-columns: 1fr;
          }
          .bulk-menu-card {
            flex-direction: column;
          }
          .bulk-menu-actions {
            width: 100%;
            justify-content: stretch;
          }
          .bulk-menu-actions .btn {
            flex: 1;
          }
          .cat-sidebar {
            position: static;
          }
          .cat-list {
            flex-direction: row;
            overflow-x: auto;
            padding: 0.5rem;
            gap: 0.5rem;
          }
          .cat-item {
            min-width: 190px;
            border: 1px solid var(--border);
            border-radius: 10px;
            flex-shrink: 0;
          }
          .cat-item-select {
            padding: 0.65rem 0.75rem 0.65rem 0.15rem;
          }
          .cat-item:last-child {
            border-bottom: 1px solid var(--border);
          }
          .cat-title-row {
            flex-direction: column;
            gap: 0.75rem;
          }
          .product-row {
            flex-direction: column;
            align-items: stretch;
          }
          .product-row-title,
          .product-row-meta,
          .product-row-actions {
            flex-wrap: wrap;
          }
          .product-row-actions {
            width: 100%;
          }
        }
        @media (max-width: 560px) {
          .product-panel-header,
          .product-row,
          .product-form-body,
          .modal-header,
          .modal-footer {
            padding-inline: 1rem;
          }
          .product-thumb,
          .product-thumb-placeholder {
            width: 100%;
            height: 160px;
          }
          .product-row-actions .btn {
            flex: 1;
            min-width: 120px;
          }
          .modal-footer {
            flex-direction: column-reverse;
          }
          .modal-footer .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
