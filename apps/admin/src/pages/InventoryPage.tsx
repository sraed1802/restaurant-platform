// apps/admin/src/pages/InventoryPage.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, Category } from '../types'
import { asMutationArg, asRpcArgs, asRows } from '../lib/supabaseTypeWorkarounds'

interface ProductWithStock extends Product {
  stock_level: number
  low_stock_threshold: number
  stock_unit: string
  is_stock_tracked: boolean
  last_stock_update: string
  categories?: { name_en: string; name_ar: string } | null
}

interface InventoryTransaction {
  id: string
  product_id: string
  transaction_type: string
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reason: string | null
  created_at: string
  product: {
    name_en: string
    name_ar: string
  }
  staff: {
    name: string
  } | null
}

interface LowStockAlert {
  id: string
  product_id: string
  current_stock: number
  threshold: number
  is_resolved: boolean
  created_at: string
  product: {
    name_en: string
    name_ar: string
  }
}

export default function InventoryPage() {
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [alerts, setAlerts] = useState<LowStockAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [showStockModal, setShowStockModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStock | null>(null)
  const [stockUpdate, setStockUpdate] = useState({
    quantity: 0,
    type: 'adjustment' as 'purchase' | 'sale' | 'adjustment' | 'waste' | 'return',
    reason: '',
    notes: ''
  })

  useEffect(() => {
    loadInventoryData()
  }, [])

  async function loadInventoryData() {
    setLoading(true)
    try {
      // Load products with stock info
      const { data: productsData } = await supabase
        .from('products')
        .select(`
          *,
          categories(name_en, name_ar)
        `)
        .order('name_en')

      setProducts(asRows<ProductWithStock>(productsData))

      // Load recent transactions
      const { data: transactionsData } = await supabase
        .from('inventory_transactions')
        .select(`
          *,
          product:products(name_en, name_ar),
          staff:staff(name)
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      setTransactions(asRows<InventoryTransaction>(transactionsData))

      // Load low stock alerts
      const { data: alertsData } = await supabase
        .from('low_stock_alerts')
        .select(`
          *,
          product:products(name_en, name_ar)
        `)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })

      setAlerts(asRows<LowStockAlert>(alertsData))
    } catch (error) {
      console.error('Failed to load inventory data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStockUpdate = async () => {
    if (!selectedProduct) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      const { error } = await supabase.rpc('update_product_stock', asRpcArgs({
        p_product_id: selectedProduct.id,
        p_quantity_change: stockUpdate.quantity,
        p_transaction_type: stockUpdate.type,
        p_reason: stockUpdate.reason,
        p_staff_id: user?.id,
        p_notes: stockUpdate.notes
      }))

      if (error) throw error

      setShowStockModal(false)
      setSelectedProduct(null)
      setStockUpdate({ quantity: 0, type: 'adjustment', reason: '', notes: '' })
      loadInventoryData()
    } catch (error) {
      console.error('Failed to update stock:', error)
    }
  }

  const handleToggleStockTracking = async (product: ProductWithStock) => {
    try {
      const { error } = await supabase
        .from('products')
        .update(asMutationArg({ 
          is_stock_tracked: !product.is_stock_tracked,
          stock_level: !product.is_stock_tracked ? 0 : product.stock_level
        }))
        .eq('id', product.id)

      if (error) throw error
      loadInventoryData()
    } catch (error) {
      console.error('Failed to toggle stock tracking:', error)
    }
  }

  const handleResolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('low_stock_alerts')
        .update(asMutationArg({ 
          is_resolved: true,
          resolved_at: new Date().toISOString()
        }))
        .eq('id', alertId)

      if (error) throw error
      loadInventoryData()
    } catch (error) {
      console.error('Failed to resolve alert:', error)
    }
  }

  if (loading) {
    return (
      <div className="inventory-page">
        <div className="skeleton-loader">
          <div className="skeleton" style={{ height: 60, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 400, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="inventory-page">
      <div className="inventory-header">
        <h1>Inventory Management</h1>
        <div className="inventory-stats">
          <div className="stat-card">
            <h3>{products.filter(p => p.is_stock_tracked).length}</h3>
            <p>Tracked Items</p>
          </div>
          <div className="stat-card">
            <h3>{alerts.length}</h3>
            <p>Low Stock Alerts</p>
          </div>
          <div className="stat-card">
            <h3>{products.filter(p => p.is_stock_tracked && p.stock_level <= p.low_stock_threshold).length}</h3>
            <p>Items Low Stock</p>
          </div>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {alerts.length > 0 && (
        <div className="alerts-section">
          <h2>Low Stock Alerts</h2>
          <div className="alerts-grid">
            {alerts.map(alert => (
              <div key={alert.id} className="alert-card">
                <div className="alert-header">
                  <h4>{alert.product.name_en}</h4>
                  <span className="alert-badge">Low Stock</span>
                </div>
                <div className="alert-details">
                  <p>Current Stock: <strong>{alert.current_stock}</strong></p>
                  <p>Threshold: <strong>{alert.threshold}</strong></p>
                  <p>Created: {new Date(alert.created_at).toLocaleDateString()}</p>
                </div>
                <button 
                  className="resolve-btn"
                  onClick={() => handleResolveAlert(alert.id)}
                >
                  Mark as Resolved
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products Inventory */}
      <div className="products-section">
        <div className="section-header">
          <h2>Product Inventory</h2>
          <div className="filter-controls">
            <select className="filter-select">
              <option value="all">All Products</option>
              <option value="tracked">Tracked Only</option>
              <option value="low">Low Stock</option>
            </select>
          </div>
        </div>

        <div className="inventory-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Stock Level</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Tracking</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id}>
                  <td data-label="Product">
                    <div className="product-info">
                      <div className="product-name">{product.name_en}</div>
                      <div className="product-arabic">{product.name_ar}</div>
                    </div>
                  </td>
                  <td data-label="Category">{product.categories?.name_en || 'N/A'}</td>
                  <td data-label="Stock Level">
                    <span className={`stock-level ${product.stock_level <= product.low_stock_threshold ? 'low' : 'normal'}`}>
                      {product.is_stock_tracked ? `${product.stock_level} ${product.stock_unit}` : 'N/A'}
                    </span>
                  </td>
                  <td data-label="Threshold">{product.low_stock_threshold}</td>
                  <td data-label="Status">
                    {product.is_stock_tracked && (
                      <span className={`status-badge ${product.stock_level <= product.low_stock_threshold ? 'warning' : 'good'}`}>
                        {product.stock_level <= product.low_stock_threshold ? 'Low Stock' : 'In Stock'}
                      </span>
                    )}
                  </td>
                  <td data-label="Tracking">
                    <button 
                      className={`tracking-toggle ${product.is_stock_tracked ? 'active' : ''}`}
                      onClick={() => handleToggleStockTracking(product)}
                    >
                      {product.is_stock_tracked ? '✓' : '○'}
                    </button>
                  </td>
                  <td data-label="Actions">
                    {product.is_stock_tracked && (
                      <button 
                        className="update-stock-btn"
                        onClick={() => {
                          setSelectedProduct(product)
                          setShowStockModal(true)
                        }}
                      >
                        Update
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="transactions-section">
        <h2>Recent Transactions</h2>
        <div className="transactions-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Type</th>
                <th>Change</th>
                <th>Before</th>
                <th>After</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(transaction => (
                <tr key={transaction.id}>
                  <td data-label="Date">{new Date(transaction.created_at).toLocaleString()}</td>
                  <td data-label="Product">{transaction.product.name_en}</td>
                  <td data-label="Type">
                    <span className={`transaction-type ${transaction.transaction_type}`}>
                      {transaction.transaction_type}
                    </span>
                  </td>
                  <td data-label="Change" className={transaction.quantity_change > 0 ? 'positive' : 'negative'}>
                    {transaction.quantity_change > 0 ? '+' : ''}{transaction.quantity_change}
                  </td>
                  <td data-label="Before">{transaction.quantity_before}</td>
                  <td data-label="After">{transaction.quantity_after}</td>
                  <td data-label="Staff">{transaction.staff?.name || 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Update Modal */}
      {showStockModal && selectedProduct && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <div className="modal-header">
              <h3>Update Stock: {selectedProduct.name_en}</h3>
              <button className="close-btn" onClick={() => setShowStockModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Transaction Type</label>
                <select 
                  value={stockUpdate.type}
                  onChange={(e) => setStockUpdate({...stockUpdate, type: e.target.value as any})}
                >
                  <option value="purchase">Purchase</option>
                  <option value="sale">Sale</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="waste">Waste</option>
                  <option value="return">Return</option>
                </select>
              </div>
              <div className="form-group">
                <label>Quantity Change</label>
                <input 
                  type="number"
                  value={stockUpdate.quantity}
                  onChange={(e) => setStockUpdate({...stockUpdate, quantity: parseInt(e.target.value) || 0})}
                  placeholder="Use positive for additions, negative for subtractions"
                />
              </div>
              <div className="form-group">
                <label>Reason</label>
                <input 
                  type="text"
                  value={stockUpdate.reason}
                  onChange={(e) => setStockUpdate({...stockUpdate, reason: e.target.value})}
                  placeholder="Optional reason for this change"
                />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea 
                  value={stockUpdate.notes}
                  onChange={(e) => setStockUpdate({...stockUpdate, notes: e.target.value})}
                  placeholder="Additional notes"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowStockModal(false)}>
                Cancel
              </button>
              <button className="submit-btn" onClick={handleStockUpdate}>
                Update Stock
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .inventory-page {
          padding: 1.5rem 0;
          max-width: 1400px;
          margin: 0 auto;
        }

        .inventory-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          gap: 1rem;
        }

        .inventory-header h1 {
          font-size: 2rem;
          font-weight: 600;
          color: var(--ink);
        }

        .inventory-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .stat-card {
          background: var(--surface);
          padding: 1rem 1.5rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border);
          text-align: center;
          min-width: 120px;
        }

        .stat-card h3 {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 0.25rem;
        }

        .stat-card p {
          font-size: 0.85rem;
          color: var(--ink-muted);
        }

        .alerts-section {
          margin-bottom: 2rem;
        }

        .alerts-section h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .alerts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }

        .alert-card {
          background: var(--surface);
          border: 1px solid #ef4444;
          border-radius: var(--radius-md);
          padding: 1rem;
        }

        .alert-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .alert-header h4 {
          font-weight: 600;
          color: var(--ink);
        }

        .alert-badge {
          background: #ef4444;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .alert-details p {
          font-size: 0.85rem;
          color: var(--ink-muted);
          margin-bottom: 0.25rem;
        }

        .resolve-btn {
          background: var(--gold);
          color: var(--cream);
          border: none;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          margin-top: 0.75rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          gap: 0.75rem;
        }

        .section-header h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
        }

        .filter-select {
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
        }

        .inventory-table {
          background: var(--surface);
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border);
          margin-bottom: 2rem;
        }

        .inventory-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .inventory-table th {
          background: var(--cream-2);
          padding: 1rem;
          text-align: left;
          font-weight: 600;
          color: var(--ink);
          border-bottom: 1px solid var(--border);
        }

        .inventory-table td {
          padding: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .product-info .product-name {
          font-weight: 500;
          color: var(--ink);
        }

        .product-info .product-arabic {
          font-size: 0.85rem;
          color: var(--ink-muted);
        }

        .stock-level.low {
          color: #ef4444;
          font-weight: 600;
        }

        .stock-level.normal {
          color: #10b981;
          font-weight: 600;
        }

        .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-badge.warning {
          background: #fef2f2;
          color: #ef4444;
        }

        .status-badge.good {
          background: #f0fdf4;
          color: #10b981;
        }

        .tracking-toggle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid var(--border);
          background: var(--cream);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .tracking-toggle.active {
          background: var(--gold);
          color: var(--cream);
          border-color: var(--gold);
        }

        .update-stock-btn {
          background: var(--ink);
          color: var(--cream);
          border: none;
          padding: 0.5rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
        }

        .transactions-section h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .transactions-table {
          background: var(--surface);
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .transactions-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .transactions-table th {
          background: var(--cream-2);
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: var(--ink);
          border-bottom: 1px solid var(--border);
        }

        .transactions-table td {
          padding: 0.75rem;
          border-bottom: 1px solid var(--border);
          font-size: 0.9rem;
        }

        .transaction-type {
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .transaction-type.purchase { background: #f0fdf4; color: #10b981; }
        .transaction-type.sale { background: #fef2f2; color: #ef4444; }
        .transaction-type.adjustment { background: #fef3c7; color: #f59e0b; }
        .transaction-type.waste { background: #fef2f2; color: #ef4444; }
        .transaction-type.return { background: #f0fdf4; color: #10b981; }

        .positive { color: #10b981; font-weight: 600; }
        .negative { color: #ef4444; font-weight: 600; }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-panel {
          background: var(--surface);
          border-radius: var(--radius-md);
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid var(--border);
        }

        .modal-header h3 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: var(--ink-muted);
        }

        .modal-body {
          padding: 1.5rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          font-weight: 500;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
        }

        .modal-footer {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          padding: 1.5rem;
          border-top: 1px solid var(--border);
        }

        .cancel-btn {
          padding: 0.75rem 1.5rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          cursor: pointer;
        }

        .submit-btn {
          padding: 0.75rem 1.5rem;
          background: var(--gold);
          color: var(--cream);
          border: none;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
        }

        .skeleton-loader {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .skeleton {
          background: linear-gradient(90deg, var(--cream-3) 25%, var(--cream-2) 50%, var(--cream-3) 75%);
          background-size: 200% 100%;
          animation: loading 1.5s infinite;
          border-radius: var(--radius-sm);
        }

        @keyframes loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 900px) {
          .inventory-header,
          .section-header {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-controls,
          .filter-select {
            width: 100%;
          }
        }

        @media (max-width: 760px) {
          .inventory-page {
            padding-top: 1rem;
          }

          .inventory-stats {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .alerts-grid {
            grid-template-columns: 1fr;
          }

          .inventory-table,
          .transactions-table {
            background: transparent;
            border: none;
            overflow: visible;
          }

          .inventory-table table,
          .transactions-table table,
          .inventory-table tbody,
          .transactions-table tbody {
            display: block;
          }

          .inventory-table thead,
          .transactions-table thead {
            display: none;
          }

          .inventory-table tr,
          .transactions-table tr {
            display: block;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            margin-bottom: 0.85rem;
            padding: 0.2rem 0;
          }

          .inventory-table td,
          .transactions-table td {
            display: grid;
            grid-template-columns: 92px minmax(0, 1fr);
            gap: 0.75rem;
            padding: 0.7rem 0.9rem;
            align-items: start;
          }

          .inventory-table td::before,
          .transactions-table td::before {
            content: attr(data-label);
            font-size: 0.62rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--ink-muted);
          }

          .inventory-table td:last-child,
          .transactions-table td:last-child {
            border-bottom: none;
          }

          .update-stock-btn {
            width: 100%;
            min-height: 44px;
          }

          .tracking-toggle {
            width: 40px;
            height: 40px;
          }

          .modal-panel {
            width: 100%;
          }

          .modal-header,
          .modal-body,
          .modal-footer {
            padding: 1rem;
          }

          .modal-footer {
            flex-direction: column-reverse;
          }

          .cancel-btn,
          .submit-btn {
            width: 100%;
          }
        }

        @media (max-width: 480px) {
          .inventory-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
