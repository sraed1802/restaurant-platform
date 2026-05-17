// apps/customer/src/components/SkeletonCard.tsx
export default function SkeletonCard() {
  return (
    <div className="skeleton-card-glass">
      <div className="skeleton-img-shimmer" />
      <div className="skeleton-line-shimmer" style={{ width: '75%', height: '1.25rem' }} />
      <div className="skeleton-line-shimmer" style={{ width: '45%', height: '1rem', marginTop: '0.5rem' }} />

      <style>{`
        .skeleton-card-glass {
          background: rgba(255, 255, 255, 0.45);
          backdrop-filter: blur(12px) saturate(1.8);
          -webkit-backdrop-filter: blur(12px) saturate(1.8);
          border: 1px solid rgba(184, 151, 90, 0.12);
          border-radius: var(--radius-lg);
          padding: 1rem;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        [data-theme="dark"] .skeleton-card-glass {
          background: rgba(26, 26, 26, 0.6);
          border: 1px solid rgba(212, 176, 122, 0.08);
        }

        .skeleton-img-shimmer {
          aspect-ratio: 4/5;
          width: 100%;
          background: linear-gradient(90deg, var(--border) 25%, var(--cream-3) 50%, var(--border) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite linear;
          border-radius: var(--radius-md);
          margin-bottom: 1.25rem;
          opacity: 0.5;
        }

        .skeleton-line-shimmer {
          background: linear-gradient(90deg, var(--border) 25%, var(--cream-3) 50%, var(--border) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.8s infinite linear;
          border-radius: 4px;
          opacity: 0.5;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        [data-theme="dark"] .skeleton-img-shimmer,
        [data-theme="dark"] .skeleton-line-shimmer {
           background: linear-gradient(90deg, #333 25%, #444 50%, #333 75%);
           background-size: 200% 100%;
        }
      `}</style>
    </div>
  )
}
