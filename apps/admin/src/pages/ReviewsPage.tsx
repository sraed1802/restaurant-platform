import { useEffect, useMemo, useState } from 'react'
import TableSkeleton from '../components/TableSkeleton'
import {
  listAdminCustomerReviews,
  summarizeReviewsByProduct,
  type AdminCustomerReviewRow,
} from '../services/customerReviews'

function formatRating(value: number): string {
  return value > 0 ? value.toFixed(1) : '—'
}

function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating))
}

export default function ReviewsPage() {
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<AdminCustomerReviewRow[]>([])
  const [search, setSearch] = useState('')
  const [productFilter, setProductFilter] = useState('all')

  useEffect(() => {
    void loadReviews()
  }, [])

  async function loadReviews() {
    setLoading(true)
    try {
      const rows = await listAdminCustomerReviews()
      setReviews(rows)
    } catch (error) {
      console.error('Failed to load customer reviews:', error)
      setReviews([])
    } finally {
      setLoading(false)
    }
  }

  const productSummaries = useMemo(() => summarizeReviewsByProduct(reviews), [reviews])

  const productOptions = useMemo(
    () =>
      [...productSummaries].sort((a, b) =>
        a.product_name_en.localeCompare(b.product_name_en)
      ),
    [productSummaries]
  )

  const filteredReviews = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reviews.filter((review) => {
      if (productFilter !== 'all' && review.product_id !== productFilter) {
        return false
      }
      if (!q) return true
      return (
        review.guest_name.toLowerCase().includes(q) ||
        review.product_name_en.toLowerCase().includes(q) ||
        review.product_name_ar.toLowerCase().includes(q) ||
        (review.comment ?? '').toLowerCase().includes(q) ||
        (review.title ?? '').toLowerCase().includes(q)
      )
    })
  }, [reviews, search, productFilter])

  return (
    <div className="reviews-admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customer reviews</h1>
          <p className="page-sub">
            Guest feedback from delivered orders — per dish and per customer.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void loadReviews()}>
          Refresh
        </button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          <section className="summary-section">
            <h2 className="section-title">Summary by item</h2>
            {productSummaries.length === 0 ? (
              <p className="empty-note">No customer reviews yet.</p>
            ) : (
              <div className="summary-grid">
                {productSummaries.map((row) => (
                  <article key={row.product_id} className="summary-card">
                    <h3>{row.product_name_en}</h3>
                    <p className="summary-ar">{row.product_name_ar}</p>
                    <div className="summary-metrics">
                      <span className="summary-rating">{formatRating(row.average_rating)}</span>
                      <span className="summary-stars">{stars(Math.round(row.average_rating))}</span>
                    </div>
                    <p className="summary-count">{row.review_count} reviews</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="reviews-table-section">
            <div className="table-toolbar">
              <input
                className="search-input"
                placeholder="Search guest, item, or comment…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="filter-select"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
              >
                <option value="all">All items</option>
                {productOptions.map((product) => (
                  <option key={product.product_id} value={product.product_id}>
                    {product.product_name_en}
                  </option>
                ))}
              </select>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Guest</th>
                    <th>Item</th>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReviews.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty-cell">
                        No reviews match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredReviews.map((review) => (
                      <tr key={review.id}>
                        <td>
                          <span className="guest-name">{review.guest_name}</span>
                          {review.is_verified && (
                            <span className="verified-pill">Verified order</span>
                          )}
                        </td>
                        <td>
                          <div className="item-cell">
                            <span>{review.product_name_en}</span>
                            <span className="item-ar">{review.product_name_ar}</span>
                          </div>
                        </td>
                        <td>
                          <span className="rating-pill">{review.rating}</span>
                          <span className="rating-stars" aria-hidden>
                            {stars(review.rating)}
                          </span>
                        </td>
                        <td className="comment-cell">
                          {review.title && <strong>{review.title}</strong>}
                          <p>{review.comment?.trim() || '—'}</p>
                        </td>
                        <td className="date-cell">
                          {new Date(review.created_at).toLocaleString('en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <style>{`
        .reviews-admin-page { animation: fadeIn 0.25s ease; }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .page-title { font-size: 1.45rem; font-weight: 700; margin: 0; }
        .page-sub { color: var(--text-muted); font-size: 0.82rem; margin: 0.35rem 0 0; }
        .section-title {
          font-size: 1rem;
          font-weight: 700;
          margin: 0 0 0.85rem;
        }
        .summary-section { margin-bottom: 2rem; }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 0.85rem;
        }
        .summary-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.9rem 1rem;
          background: var(--bg-card);
        }
        .summary-card h3 {
          margin: 0;
          font-size: 0.95rem;
        }
        .summary-ar {
          margin: 0.2rem 0 0.65rem;
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .summary-metrics {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .summary-rating {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--gold);
        }
        .summary-stars {
          color: var(--gold);
          letter-spacing: 0.04em;
          font-size: 0.85rem;
        }
        .summary-count {
          margin: 0.35rem 0 0;
          font-size: 0.78rem;
          color: var(--text-soft);
        }
        .empty-note {
          color: var(--text-muted);
          font-size: 0.88rem;
        }
        .table-toolbar {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 0.85rem;
          flex-wrap: wrap;
        }
        .search-input,
        .filter-select {
          padding: 0.55rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-card);
          color: var(--text);
          font-size: 0.88rem;
        }
        .search-input {
          flex: 1;
          min-width: 220px;
        }
        .filter-select {
          min-width: 180px;
          color-scheme: dark;
        }
        .filter-select option {
          background-color: #141925;
          color: #e2e8f0;
        }
        .table-wrap {
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.84rem;
        }
        .data-table th,
        .data-table td {
          padding: 0.7rem 0.85rem;
          border-bottom: 1px solid var(--border);
          text-align: start;
          vertical-align: top;
        }
        .data-table th {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          background: var(--bg-2);
        }
        .guest-name {
          display: block;
          font-weight: 600;
        }
        .verified-pill {
          display: inline-block;
          margin-top: 0.25rem;
          font-size: 0.68rem;
          color: var(--green);
          border: 1px solid rgba(34, 197, 94, 0.35);
          border-radius: 999px;
          padding: 0.1rem 0.45rem;
        }
        .item-cell {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .item-ar {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .rating-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.6rem;
          height: 1.6rem;
          border-radius: 999px;
          background: var(--gold-dim);
          color: var(--gold);
          font-weight: 700;
          margin-right: 0.35rem;
        }
        .rating-stars {
          color: var(--gold);
          font-size: 0.78rem;
        }
        .comment-cell p {
          margin: 0.25rem 0 0;
          color: var(--text-soft);
          line-height: 1.45;
          white-space: pre-wrap;
        }
        .comment-cell strong {
          display: block;
          color: var(--text);
        }
        .date-cell {
          white-space: nowrap;
          color: var(--text-muted);
          font-size: 0.78rem;
        }
        .empty-cell {
          text-align: center;
          color: var(--text-muted);
          padding: 2rem;
        }
        @media (max-width: 760px) {
          .table-toolbar {
            flex-direction: column;
          }
          .search-input,
          .filter-select {
            width: 100%;
            min-width: 0;
          }
        }
      `}</style>
    </div>
  )
}

