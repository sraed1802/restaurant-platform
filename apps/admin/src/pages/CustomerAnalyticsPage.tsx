// apps/admin/src/pages/CustomerAnalyticsPage.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { asRows, asRpcArgs } from '../lib/supabaseTypeWorkarounds'

interface CustomerMetrics {
  total_customers: number
  new_customers_this_month: number
  repeat_customers: number
  average_orders_per_customer: number
  customer_retention_rate: number
  top_customers: Array<{
    customer_id: string
    name: string | null
    phone: string
    total_orders: number
    total_spent: number
    average_order_value: number
    last_order_date: string
  }>
}

interface CustomerSegment {
  segment: string
  count: number
  percentage: number
  characteristics: string[]
}

interface CohortAnalysis {
  cohort: string
  customers: number
  retention_rates: Array<{
    month: number
    rate: number
  }>
}

interface LifetimeValue {
  total_customers: number
  average_ltv: number
  total_revenue: number
  monthly_ltv: Array<{
    month: string
    new_customers: number
    avg_ltv: number
  }>
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeMetrics(value: CustomerMetrics | null): CustomerMetrics | null {
  if (!value) return null

  return {
    total_customers: toNumber(value.total_customers),
    new_customers_this_month: toNumber(value.new_customers_this_month),
    repeat_customers: toNumber(value.repeat_customers),
    average_orders_per_customer: toNumber(value.average_orders_per_customer),
    customer_retention_rate: toNumber(value.customer_retention_rate),
    top_customers: Array.isArray(value.top_customers)
      ? value.top_customers.map((customer) => ({
          customer_id: customer.customer_id,
          name: customer.name,
          phone: customer.phone ?? 'N/A',
          total_orders: toNumber(customer.total_orders),
          total_spent: toNumber(customer.total_spent),
          average_order_value: toNumber(customer.average_order_value),
          last_order_date: customer.last_order_date,
        }))
      : [],
  }
}

function normalizeSegments(values: CustomerSegment[]): CustomerSegment[] {
  return values.map((segment) => ({
    ...segment,
    count: toNumber(segment.count),
    percentage: toNumber(segment.percentage),
    characteristics: Array.isArray(segment.characteristics) ? segment.characteristics : [],
  }))
}

function normalizeCohorts(values: CohortAnalysis[]): CohortAnalysis[] {
  return values.map((cohort) => ({
    cohort: cohort.cohort,
    customers: toNumber(cohort.customers),
    retention_rates: Array.isArray(cohort.retention_rates)
      ? cohort.retention_rates.map((rate) => ({
          month: toNumber(rate.month),
          rate: toNumber(rate.rate),
        }))
      : [],
  }))
}

function normalizeLtv(value: LifetimeValue | null): LifetimeValue | null {
  if (!value) return null

  return {
    total_customers: toNumber(value.total_customers),
    average_ltv: toNumber(value.average_ltv),
    total_revenue: toNumber(value.total_revenue),
    monthly_ltv: Array.isArray(value.monthly_ltv)
      ? value.monthly_ltv.map((month) => ({
          month: month.month,
          new_customers: toNumber(month.new_customers),
          avg_ltv: toNumber(month.avg_ltv),
        }))
      : [],
  }
}

export default function CustomerAnalyticsPage() {
  const [metrics, setMetrics] = useState<CustomerMetrics | null>(null)
  const [segments, setSegments] = useState<CustomerSegment[]>([])
  const [cohorts, setCohorts] = useState<CohortAnalysis[]>([])
  const [ltv, setLtv] = useState<LifetimeValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d')

  useEffect(() => {
    loadCustomerAnalytics()
  }, [timeRange])

  async function loadCustomerAnalytics() {
    setLoading(true)
    try {
      // Load customer metrics
      const { data: metricsData } = await supabase
        .rpc('get_customer_metrics', asRpcArgs({ p_days: getDaysFromRange(timeRange) }))

      setMetrics(normalizeMetrics(asRows<CustomerMetrics>(metricsData)[0] ?? null))

      // Load customer segments
      const { data: segmentsData } = await supabase
        .rpc('get_customer_segments')

      setSegments(normalizeSegments(asRows<CustomerSegment>(segmentsData)))

      // Load cohort analysis
      const { data: cohortsData } = await supabase
        .rpc('get_cohort_analysis')

      setCohorts(normalizeCohorts(asRows<CohortAnalysis>(cohortsData)))

      // Load lifetime value data
      const { data: ltvData } = await supabase
        .rpc('get_customer_lifetime_value')

      setLtv(normalizeLtv(asRows<LifetimeValue>(ltvData)[0] ?? null))
    } catch (error) {
      console.error('Failed to load customer analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  function getDaysFromRange(range: string): number {
    switch (range) {
      case '7d': return 7
      case '30d': return 30
      case '90d': return 90
      case '1y': return 365
      default: return 30
    }
  }

  if (loading) {
    return (
      <div className="customer-analytics-page">
        <div className="skeleton-loader">
          <div className="skeleton" style={{ height: 60, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 200, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 300, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 400 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="customer-analytics-page">
      <div className="analytics-header">
        <h1>Customer Analytics</h1>
        <div className="time-range-selector">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as any)}>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Last Year</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      {metrics && (
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <h3>Total Customers</h3>
              <span className="metric-icon">👥</span>
            </div>
            <div className="metric-value">{metrics.total_customers.toLocaleString()}</div>
            <div className="metric-change positive">
              +{metrics.new_customers_this_month} new this month
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3>Repeat Customers</h3>
              <span className="metric-icon">🔄</span>
            </div>
            <div className="metric-value">{metrics.repeat_customers.toLocaleString()}</div>
            <div className="metric-change">
              {(
                metrics.total_customers > 0
                  ? (metrics.repeat_customers / metrics.total_customers) * 100
                  : 0
              ).toFixed(1)}% of total
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3>Avg Orders/Customer</h3>
              <span className="metric-icon">📊</span>
            </div>
            <div className="metric-value">{metrics.average_orders_per_customer.toFixed(1)}</div>
            <div className="metric-change">
              Per customer period
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <h3>Retention Rate</h3>
              <span className="metric-icon">💎</span>
            </div>
            <div className="metric-value">{(metrics.customer_retention_rate * 100).toFixed(1)}%</div>
            <div className="metric-change">
              Customer retention
            </div>
          </div>
        </div>
      )}

      {/* Customer Segments */}
      <div className="segments-section">
        <h2>Customer Segments</h2>
        <div className="segments-grid">
          {segments.map((segment, index) => (
            <div key={index} className="segment-card">
              <h3>{segment.segment}</h3>
              <div className="segment-stats">
                <div className="segment-count">
                  <span className="count">{segment.count.toLocaleString()}</span>
                  <span className="percentage">{segment.percentage.toFixed(1)}%</span>
                </div>
                <div className="segment-characteristics">
                  {segment.characteristics.map((char, i) => (
                    <span key={i} className="characteristic">{char}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Customers */}
      {metrics && (
        <div className="top-customers-section">
          <h2>Top Customers by Revenue</h2>
          <div className="customers-table">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Total Orders</th>
                  <th>Total Spent</th>
                  <th>Avg Order Value</th>
                  <th>Last Order</th>
                </tr>
              </thead>
              <tbody>
                {metrics.top_customers.map((customer, index) => (
                  <tr key={customer.customer_id}>
                    <td>
                      <div className="customer-info">
                        <span className="rank">#{index + 1}</span>
                        <span className="name">{customer.name || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td>{customer.phone}</td>
                    <td>{customer.total_orders}</td>
                    <td className="revenue">QAR {customer.total_spent.toFixed(2)}</td>
                    <td>QAR {customer.average_order_value.toFixed(2)}</td>
                    <td>{new Date(customer.last_order_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cohort Analysis */}
      <div className="cohort-section">
        <h2>Cohort Analysis</h2>
        <div className="cohort-table">
          <table>
            <thead>
              <tr>
                <th>Cohort</th>
                <th>Customers</th>
                <th>Month 1</th>
                <th>Month 2</th>
                <th>Month 3</th>
                <th>Month 6</th>
                <th>Month 12</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort, index) => (
                <tr key={index}>
                  <td>{cohort.cohort}</td>
                  <td>{cohort.customers}</td>
                  {cohort.retention_rates.map((rate, monthIndex) => {
                    const r = typeof rate === 'number' ? rate : Number(rate)
                    const pct = Number.isFinite(r) ? r * 100 : 0
                    return (
                    <td key={monthIndex} className="retention-rate">
                      <div className="rate-bar">
                        <div 
                          className="rate-fill" 
                          style={{ width: `${pct}%` }}
                        />
                        <span className="rate-text">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lifetime Value */}
      {ltv && (
        <div className="ltv-section">
          <h2>Customer Lifetime Value</h2>
          <div className="ltv-overview">
            <div className="ltv-stats">
              <div className="ltv-stat">
                <h3>Total Customers</h3>
                <p>{ltv.total_customers.toLocaleString()}</p>
              </div>
              <div className="ltv-stat">
                <h3>Average LTV</h3>
                <p>QAR {ltv.average_ltv.toFixed(2)}</p>
              </div>
              <div className="ltv-stat">
                <h3>Total Revenue</h3>
                <p>QAR {ltv.total_revenue.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="ltv-chart">
            <h3>Monthly LTV Trends</h3>
            <div className="chart-container">
              {ltv.monthly_ltv.map((month, index) => {
                const maxLtv = Math.max(...ltv.monthly_ltv.map(m => m.avg_ltv || 0))
                const currentLtv = month.avg_ltv || 0
                const heightPercentage = maxLtv > 0 ? (currentLtv / maxLtv) * 100 : 0
                
                return (
                  <div key={index} className="chart-bar">
                    <div className="bar-label">{month.month}</div>
                    <div className="bar-wrapper">
                      <div 
                        className="bar-fill"
                        style={{ height: `${heightPercentage}%` }}
                      />
                    </div>
                    <span className="bar-value">QAR {currentLtv.toFixed(0)}</span>
                    <div className="new-customers">+{month.new_customers || 0}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .customer-analytics-page {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .analytics-header h1 {
          font-size: 2rem;
          font-weight: 600;
          color: var(--ink);
        }

        .time-range-selector select {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          background: var(--surface);
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .metric-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
        }

        .metric-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .metric-header h3 {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--ink-muted);
        }

        .metric-icon {
          font-size: 1.5rem;
        }

        .metric-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--gold);
          margin-bottom: 0.5rem;
        }

        .metric-change {
          font-size: 0.85rem;
          color: var(--ink-muted);
        }

        .metric-change.positive {
          color: var(--green);
        }

        .segments-section {
          margin-bottom: 2rem;
        }

        .segments-section h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .segments-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1rem;
        }

        .segment-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
        }

        .segment-card h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .segment-count {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .segment-count .count {
          font-size: 1.8rem;
          font-weight: 700;
          color: var(--gold);
        }

        .segment-count .percentage {
          font-size: 0.9rem;
          color: var(--ink-muted);
        }

        .segment-characteristics {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .characteristic {
          background: var(--cream-2);
          color: var(--ink);
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 500;
        }

        .top-customers-section {
          margin-bottom: 2rem;
        }

        .top-customers-section h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .customers-table {
          background: var(--surface);
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .customers-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .customers-table th {
          background: var(--cream-2);
          padding: 1rem;
          text-align: left;
          font-weight: 600;
          color: var(--ink);
          border-bottom: 1px solid var(--border);
        }

        .customers-table td {
          padding: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .customer-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .rank {
          background: var(--gold);
          color: var(--cream);
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          min-width: 2rem;
          text-align: center;
        }

        .name {
          font-weight: 500;
          color: var(--ink);
        }

        .revenue {
          font-weight: 600;
          color: var(--gold);
        }

        .cohort-section {
          margin-bottom: 2rem;
        }

        .cohort-section h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .cohort-table {
          background: var(--surface);
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .cohort-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .cohort-table th {
          background: var(--cream-2);
          padding: 0.75rem;
          text-align: left;
          font-weight: 600;
          color: var(--ink);
          border-bottom: 1px solid var(--border);
          font-size: 0.85rem;
        }

        .cohort-table td {
          padding: 0.75rem;
          border-bottom: 1px solid var(--border);
          font-size: 0.85rem;
        }

        .retention-rate {
          padding: 0;
        }

        .rate-bar {
          position: relative;
          height: 20px;
          background: var(--cream-3);
          border-radius: 10px;
          overflow: hidden;
        }

        .rate-fill {
          height: 100%;
          background: var(--gold);
          transition: width 0.3s ease;
        }

        .rate-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--ink);
        }

        .ltv-section h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1rem;
        }

        .ltv-overview {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
          margin-bottom: 2rem;
        }

        .ltv-stats {
          display: flex;
          justify-content: space-around;
          gap: 2rem;
        }

        .ltv-stat {
          text-align: center;
        }

        .ltv-stat h3 {
          font-size: 0.9rem;
          color: var(--ink-muted);
          margin-bottom: 0.5rem;
        }

        .ltv-stat p {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--gold);
        }

        .ltv-chart {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 1.5rem;
        }

        .ltv-chart h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 1.5rem;
        }

        .chart-container {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: stretch;
        }

        .chart-bar {
          flex: 1 1 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 0.45rem;
          min-width: 0;
        }

        .bar-label {
          font-size: 0.75rem;
          color: var(--ink-muted);
          text-align: center;
          word-break: break-word;
        }

        .bar-wrapper {
          height: 160px;
          width: 100%;
          position: relative;
          display: flex;
          align-items: flex-end;
          background: var(--cream-3);
          border-radius: 4px 4px 0 0;
          min-height: 20px;
          overflow: hidden;
        }

        .bar-fill {
          width: 100%;
          background: var(--gold);
          border-radius: 4px 4px 0 0;
          transition: height 0.3s ease;
        }

        .bar-value {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--ink);
          text-align: center;
          line-height: 1.2;
          min-height: 1.5rem;
        }

        .new-customers {
          font-size: 0.7rem;
          color: var(--green);
          font-weight: 600;
          text-align: center;
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
      `}</style>
    </div>
  )
}
