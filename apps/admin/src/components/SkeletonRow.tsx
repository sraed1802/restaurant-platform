// apps/admin/src/components/SkeletonRow.tsx
export default function SkeletonRow() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.75rem 1rem',
      borderBottom: '1px solid var(--border)',
      animation: 'pulse 1.5s ease-in-out infinite'
    }}>
      <div style={{
        width: '80px',
        height: '32px',
        background: 'var(--bg-3)',
        borderRadius: '4px'
      }} />
      <div style={{ flex: 1 }}>
        <div style={{
          height: '16px',
          background: 'var(--bg-3)',
          borderRadius: '4px',
          marginBottom: '0.5rem',
          width: '60%'
        }} />
        <div style={{
          height: '14px',
          background: 'var(--bg-3)',
          borderRadius: '4px',
          width: '40%'
        }} />
      </div>
      <div style={{
        width: '100px',
        height: '28px',
        background: 'var(--bg-3)',
        borderRadius: '4px'
      }} />
    </div>
  )
}
