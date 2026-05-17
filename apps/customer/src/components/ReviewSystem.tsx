// apps/customer/src/components/ReviewSystem.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { asMutationRowsArg, asRows } from '../lib/supabaseTypeWorkarounds'
import { useSessionStore } from '../store/sessionStore'

interface Review {
  id: string
  rating: number
  title?: string
  comment?: string
  photos: string[]
  is_verified: boolean
  is_featured: boolean
  helpful_count: number
  created_at: string
  customer: {
    name: string | null
  }
  response?: {
    response: string
    created_at: string
  }
}

interface ReviewSummary {
  average_rating: number
  total_reviews: number
  rating_distribution: Record<number, number>
}

interface ReviewRatingRow {
  rating: number
}

interface ReviewSystemProps {
  productId: string
  productNameEn: string
  productNameAr: string
  /** Customer may write only after a delivered order that included this product */
  canWriteReview?: boolean
  eligibleOrderId?: string | null
  /** True when user chose “Write review” on the card for this product */
  openWriteIntent?: boolean
  onWriteIntentConsumed?: () => void
}

export default function ReviewSystem({
  productId,
  productNameEn,
  productNameAr,
  canWriteReview = false,
  eligibleOrderId = null,
  openWriteIntent = false,
  onWriteIntentConsumed,
}: ReviewSystemProps) {
  const { language, customerId, customerName, isVerified } = useSessionStore()
  const [reviews, setReviews] = useState<Review[]>([])
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [hasReviewed, setHasReviewed] = useState(false)

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  useEffect(() => {
    loadReviews()
    loadSummary()
    checkIfReviewed()
  }, [productId])

  useEffect(() => {
    if (!openWriteIntent || loading) return
    if (!customerId || hasReviewed || !canWriteReview) {
      onWriteIntentConsumed?.()
      return
    }
    setShowReviewForm(true)
    onWriteIntentConsumed?.()
  }, [openWriteIntent, loading, customerId, hasReviewed, canWriteReview, onWriteIntentConsumed])

  async function loadReviews() {
    try {
      const { data, error } = await supabase
        .from('customer_reviews')
        .select(
          `
          *,
          review_responses(response, created_at)
        `
        )
        .eq('product_id', productId)
        .order('is_featured', { ascending: false })
        .order('helpful_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('customer_reviews query:', error.message)
        setReviews([])
        return
      }

      type Row = Review & {
        review_responses?: Array<{ response: string; created_at: string }>
        photos?: unknown
      }

      const asPhotoPaths = (raw: unknown): string[] =>
        Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []

      setReviews(
        (data || []).map((row: Row) => ({
          id: row.id,
          rating: row.rating,
          title: row.title,
          comment: row.comment,
          photos: asPhotoPaths(row.photos),
          is_verified: row.is_verified,
          is_featured: row.is_featured,
          helpful_count: row.helpful_count,
          created_at: row.created_at,
          customer: { name: null },
          response: row.review_responses?.[0],
        }))
      )
    } catch (error) {
      console.error('Failed to load reviews:', error)
      setReviews([])
    } finally {
      setLoading(false)
    }
  }

  async function loadSummary() {
    try {
      const { data } = await supabase
        .from('customer_reviews')
        .select('rating')
        .eq('product_id', productId)

      const ratingRows = asRows<ReviewRatingRow>(data)

      if (ratingRows.length > 0) {
        const total = ratingRows.length
        const average = ratingRows.reduce((sum, row) => sum + row.rating, 0) / total
        const distribution = ratingRows.reduce((acc, row) => {
          acc[row.rating] = (acc[row.rating] || 0) + 1
          return acc
        }, {} as Record<number, number>)

        setSummary({
          average_rating: average,
          total_reviews: total,
          rating_distribution: distribution
        })
      } else {
        // Handle case with no reviews
        setSummary({
          average_rating: 0,
          total_reviews: 0,
          rating_distribution: {}
        })
      }
    } catch (error) {
      console.error('Failed to load review summary:', error)
    }
  }

  async function checkIfReviewed() {
    if (!customerId) return

    try {
      const { data } = await supabase
        .from('customer_reviews')
        .select('id')
        .eq('product_id', productId)
        .eq('customer_id', customerId)
        .maybeSingle()

      setHasReviewed(!!data)
    } catch (error) {
      console.error('Failed to check review status:', error)
    }
  }

  if (loading) {
    return (
      <div className="reviews-section">
        <div className="skeleton" style={{ height: 120, marginBottom: '1rem' }} />
        <div className="skeleton" style={{ height: 80, marginBottom: '0.5rem' }} />
        <div className="skeleton" style={{ height: 80, marginBottom: '0.5rem' }} />
      </div>
    )
  }

  return (
    <div className="reviews-section">
      {/* Summary */}
      {summary && (
        <div className="reviews-summary">
          <div className="summary-header">
            <h3>{t('Customer Reviews', 'مراجعات العملاء')}</h3>
            <div className="rating-summary">
              <div className="average-rating">
                <span className="rating-number">{summary.average_rating > 0 ? summary.average_rating.toFixed(1) : '0.0'}</span>
                <div className="stars">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={`star ${i < Math.floor(summary.average_rating) ? 'filled' : ''}`}>
                      ★
                    </span>
                  ))}
                </div>
                <span className="total-count">({summary.total_reviews})</span>
              </div>
            </div>
          </div>

          {/* Rating distribution */}
          <div className="rating-distribution">
            {[5, 4, 3, 2, 1].map(rating => {
              const count = summary.rating_distribution[rating] || 0
              const percentage = summary.total_reviews > 0 ? (count / summary.total_reviews) * 100 : 0
              return (
                <div key={rating} className="rating-bar">
                  <span className="rating-label">{rating} ★</span>
                  <div className="bar-container">
                    <div 
                      className="bar-fill" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="rating-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Review button */}
      {customerId && canWriteReview && !hasReviewed && (
        <button 
          type="button"
          className="write-review-btn"
          onClick={() => setShowReviewForm(!showReviewForm)}
        >
          {t('Write a Review', 'اكتب مراجعة')}
        </button>
      )}

      {customerId && !canWriteReview && !hasReviewed && (
        <p className="review-eligibility-hint">
          {t(
            'You can review this dish after it has been delivered on a completed order.',
            'يمكنك تقييم هذا الطبق بعد توصيله في طلب مكتمل.'
          )}
        </p>
      )}

      {/* Review form */}
      {showReviewForm && canWriteReview && (
        <ReviewForm 
          productId={productId}
          productNameEn={productNameEn}
          productNameAr={productNameAr}
          orderId={eligibleOrderId}
          onSubmit={() => {
            setShowReviewForm(false)
            loadReviews()
            loadSummary()
            setHasReviewed(true)
          }}
          onCancel={() => setShowReviewForm(false)}
        />
      )}

      {/* Reviews list */}
      <div className="reviews-list">
        {reviews.map(review => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>

      <style>{`
        .reviews-section {
          padding: 2rem 0;
          border-top: 1px solid var(--border);
          margin-top: 2rem;
        }

        .reviews-summary {
          margin-bottom: 2rem;
        }

        .summary-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .summary-header h3 {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--ink);
        }

        .rating-summary {
          text-align: right;
        }

        .average-rating {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .rating-number {
          font-size: 2rem;
          font-weight: 600;
          color: var(--gold);
        }

        .stars {
          display: flex;
          gap: 0.1rem;
        }

        .star {
          font-size: 1.2rem;
          color: var(--cream-3);
        }

        .star.filled {
          color: var(--gold);
        }

        .total-count {
          color: var(--ink-muted);
          font-size: 0.9rem;
        }

        .rating-distribution {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .rating-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .rating-label {
          font-size: 0.85rem;
          color: var(--ink-muted);
          min-width: 2rem;
        }

        .bar-container {
          flex: 1;
          height: 8px;
          background: var(--cream-3);
          border-radius: 4px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          background: var(--gold);
          transition: width 0.3s ease;
        }

        .rating-count {
          font-size: 0.85rem;
          color: var(--ink-muted);
          min-width: 2rem;
          text-align: right;
        }

        .write-review-btn {
          width: 100%;
          padding: 1rem;
          background: var(--gold);
          color: var(--cream);
          border: none;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 2rem;
        }

        .write-review-btn:hover {
          background: var(--gold-dark);
        }

        .review-eligibility-hint {
          font-size: 0.88rem;
          color: var(--ink-muted);
          line-height: 1.5;
          margin-bottom: 1.5rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          background: var(--cream-2);
          border: 1px solid var(--border);
        }

        .reviews-list {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
      `}</style>
    </div>
  )
}

// Review Card Component
function ReviewCard({ review }: { review: Review }) {
  const { language, customerId } = useSessionStore()
  const [helpful, setHelpful] = useState(false)
  const [helpfulCount, setHelpfulCount] = useState(review.helpful_count)

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  const handleHelpful = async () => {
    if (helpful || !customerId) return

    try {
      const { error } = await supabase
        .from('review_helpful_votes')
        .insert(asMutationRowsArg([{ review_id: review.id, customer_id: customerId }]))

      if (!error) {
        setHelpful(true)
        setHelpfulCount(prev => prev + 1)
      }
    } catch (error) {
      console.error('Failed to mark as helpful:', error)
    }
  }

  return (
    <div className={`review-card ${review.is_featured ? 'featured' : ''}`}>
      {review.is_featured && (
        <div className="featured-badge">
          {t('Featured', 'مميز')}
        </div>
      )}

      <div className="review-header">
        <div className="reviewer-info">
          <span className="reviewer-name">
            {review.customer.name || t('Anonymous', 'مجهول')}
          </span>
          <div className="review-rating">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={`star ${i < review.rating ? 'filled' : ''}`}>
                ★
              </span>
            ))}
          </div>
        </div>
        <span className="review-date">
          {new Date(review.created_at).toLocaleDateString()}
        </span>
      </div>

      {review.title && (
        <h4 className="review-title">{review.title}</h4>
      )}

      {review.comment && (
        <p className="review-comment">{review.comment}</p>
      )}

      {review.photos && review.photos.length > 0 && (
        <div className="review-photos">
          {review.photos.map((photo, index) => (
            <img key={index} src={photo} alt={`Review photo ${index + 1}`} />
          ))}
        </div>
      )}

      {review.response && (
        <div className="review-response">
          <div className="response-header">
            <strong>{t('Restaurant Response', 'رد المطعم')}</strong>
            <span className="response-date">
              {new Date(review.response.created_at).toLocaleDateString()}
            </span>
          </div>
          <p className="response-text">{review.response.response}</p>
        </div>
      )}

      <div className="review-actions">
        <button 
          type="button"
          className={`helpful-btn ${helpful ? 'voted' : ''}`}
          onClick={handleHelpful}
          disabled={helpful}
        >
          👍 {t('Helpful', 'مفيد')} ({helpfulCount})
        </button>
      </div>

      <style>{`
        .review-card {
          padding: 1.5rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          position: relative;
        }

        .review-card.featured {
          border-color: var(--gold);
          box-shadow: 0 0 0 1px var(--gold-light);
        }

        .featured-badge {
          position: absolute;
          top: -0.5rem;
          right: 1rem;
          background: var(--gold);
          color: var(--cream);
          padding: 0.25rem 0.75rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .review-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .reviewer-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .reviewer-name {
          font-weight: 500;
          color: var(--ink);
        }

        .review-rating {
          display: flex;
          gap: 0.1rem;
        }

        .review-rating .star {
          font-size: 0.9rem;
          color: var(--cream-3);
        }

        .review-rating .star.filled {
          color: var(--gold);
        }

        .review-date {
          font-size: 0.85rem;
          color: var(--ink-muted);
        }

        .review-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }

        .review-comment {
          color: var(--ink-soft);
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .review-photos {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          overflow-x: auto;
        }

        .review-photos img {
          width: 80px;
          height: 80px;
          object-fit: cover;
          border-radius: var(--radius-sm);
        }

        .review-response {
          background: var(--cream-2);
          padding: 1rem;
          border-radius: var(--radius-sm);
          margin-top: 1rem;
        }

        .response-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .response-header strong {
          color: var(--gold-dark);
          font-size: 0.9rem;
        }

        .response-date {
          font-size: 0.8rem;
          color: var(--ink-muted);
        }

        .response-text {
          font-size: 0.9rem;
          color: var(--ink-soft);
          line-height: 1.5;
        }

        .review-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .helpful-btn {
          padding: 0.5rem 1rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          color: var(--ink-muted);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .helpful-btn:hover:not(:disabled) {
          border-color: var(--gold);
          color: var(--gold);
        }

        .helpful-btn.voted {
          background: var(--gold);
          color: var(--cream);
          border-color: var(--gold);
        }

        .helpful-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}

// Review Form Component
function ReviewForm({ 
  productId, 
  productNameEn, 
  productNameAr,
  orderId,
  onSubmit, 
  onCancel 
}: {
  productId: string
  productNameEn: string
  productNameAr: string
  orderId: string | null
  onSubmit: () => void
  onCancel: () => void
}) {
  const { language, customerId } = useSessionStore()
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const t = (en: string, ar: string) => language === 'ar' ? ar : en

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId || rating === 0) return

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('customer_reviews')
        .insert(asMutationRowsArg([{
          customer_id: customerId,
          product_id: productId,
          order_id: orderId,
          rating,
          title: title || null,
          comment: comment || null,
          is_verified: true,
        }]))

      if (!error) {
        onSubmit()
      }
    } catch (error) {
      console.error('Failed to submit review:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="review-form">
      <h4>{t('Write Your Review', 'اكتب مراجعتك')}</h4>
      <p>{t(productNameEn, productNameAr)}</p>

      <form onSubmit={handleSubmit}>
        {/* Rating */}
        <div className="form-group">
          <label>{t('Rating', 'التقييم')} *</label>
          <div className="rating-input">
            {Array.from({ length: 5 }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`rating-star ${i < rating ? 'selected' : ''}`}
                onClick={() => setRating(i + 1)}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="form-group">
          <label>{t('Title (Optional)', 'العنوان (اختياري)')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('Sum up your review...', 'لخص مراجعتك...')}
            maxLength={100}
          />
        </div>

        {/* Comment */}
        <div className="form-group">
          <label>{t('Review (Optional)', 'المراجعة (اختياري)')}</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('Tell us about your experience...', 'أخبرنا عن تجربتك...')}
            rows={4}
            maxLength={500}
          />
        </div>

        {/* Actions */}
        <div className="form-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={onCancel}
          >
            {t('Cancel', 'إلغاء')}
          </button>
          <button
            type="submit"
            className="submit-btn"
            disabled={rating === 0 || submitting}
          >
            {submitting 
              ? t('Submitting...', 'جارٍ الإرسال...')
              : t('Submit Review', 'إرسال المراجعة')
            }
          </button>
        </div>
      </form>

      <style>{`
        .review-form {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .review-form h4 {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 0.25rem;
        }

        .review-form p {
          color: var(--ink-muted);
          margin-bottom: 1.5rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          font-weight: 500;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }

        .rating-input {
          display: flex;
          gap: 0.25rem;
        }

        .rating-star {
          background: none;
          border: none;
          font-size: 2rem;
          color: var(--cream-3);
          cursor: pointer;
          transition: color 0.2s ease;
          padding: 0;
        }

        .rating-star:hover {
          color: var(--gold-light);
        }

        .rating-star.selected {
          color: var(--gold);
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          background: var(--cream);
          transition: border-color 0.2s ease;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: var(--gold);
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }

        .cancel-btn {
          padding: 0.75rem 1.5rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          color: var(--ink);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cancel-btn:hover {
          border-color: var(--ink);
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
          transition: all 0.2s ease;
        }

        .submit-btn:hover:not(:disabled) {
          background: var(--gold-dark);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}
