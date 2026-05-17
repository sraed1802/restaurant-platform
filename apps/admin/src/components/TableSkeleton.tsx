// apps/admin/src/components/TableSkeleton.tsx
export default function TableSkeleton() {
  return (
    <table className="orders-table">
      <thead>
        <tr>
          <th>Order ID</th>
          <th>Customer</th>
          <th>Status</th>
          <th>Items</th>
          <th>Total</th>
          <th>Payment</th>
          <th>Time</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 5 }).map((_, i) => (
          <tr key={i} style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
            <td>
              <div style={{ width: '80px', height: '20px', background: 'var(--bg-3)', borderRadius: '4px' }} />
            </td>
            <td>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ width: '100px', height: '14px', background: 'var(--bg-3)', borderRadius: '4px' }} />
                <div style={{ width: '80px', height: '12px', background: 'var(--bg-3)', borderRadius: '4px' }} />
              </div>
            </td>
            <td>
              <div style={{ width: '60px', height: '24px', background: 'var(--bg-3)', borderRadius: '4px' }} />
            </td>
            <td>
              <div style={{ width: '40px', height: '16px', background: 'var(--bg-3)', borderRadius: '4px' }} />
            </td>
            <td>
              <div style={{ width: '70px', height: '16px', background: 'var(--bg-3)', borderRadius: '4px' }} />
            </td>
            <td>
              <div style={{ width: '50px', height: '16px', background: 'var(--bg-3)', borderRadius: '4px' }} />
            </td>
            <td>
              <div style={{ width: '60px', height: '14px', background: 'var(--bg-3)', borderRadius: '4px' }} />
            </td>
            <td>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ width: '32px', height: '28px', background: 'var(--bg-3)', borderRadius: '4px' }} />
                <div style={{ width: '32px', height: '28px', background: 'var(--bg-3)', borderRadius: '4px' }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
