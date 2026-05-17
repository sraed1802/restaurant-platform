// apps/admin/src/pages/AnalyticsPage.tsx
import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'
import { asRows } from '../lib/supabaseTypeWorkarounds'

interface HourlyRevenue {
  hour_bucket: string
  order_count: number
  revenue: number
  avg_order_value: number
}

interface ProductStat {
  id: string
  name_en: string
  order_count: number
  total_revenue: number
}

interface PeakDemand {
  day_of_week: number
  hour_of_day: number
  order_count: number
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => `${i}:00`)
const CHART_COLORS = {
  revenue: 'var(--gold)',
  orders: 'var(--blue)',
  aov: 'var(--purple)',
  axis: 'var(--text-muted)',
  grid: 'var(--border)',
}

export default function AnalyticsPage() {
  const [hourlyData, setHourlyData] = useState<HourlyRevenue[]>([])
  const [products, setProducts] = useState<ProductStat[]>([])
  const [peakDemand, setPeakDemand] = useState<PeakDemand[]>([])
  const [summary, setSummary] = useState({
    total_revenue: 0, total_orders: 0, avg_order_value: 0,
    top_product: '', conversion_rate: 0
  })
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAnalytics() }, [range])

  async function loadAnalytics() {
    setLoading(true)
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const [hourly, pop, peak, funnelRes] = await Promise.all([
      supabase
        .from('mv_hourly_revenue')
        .select('*')
        .gte('hour_bucket', since)
        .order('hour_bucket'),
      supabase
        .from('mv_product_popularity')
        .select('*')
        .order('order_count', { ascending: false })
        .limit(8),
      supabase
        .from('mv_peak_demand')
        .select('*'),
      supabase
        .from('analytics_events')
        .select('event_type')
        .gte('occurred_at', since)
        .in('event_type', ['session.started', 'payment.succeeded']),
    ])

    const hData = (hourly.data ?? []) as HourlyRevenue[]
    const pData = (pop.data ?? []) as ProductStat[]
    const peakData = (peak.data ?? []) as PeakDemand[]

    const totalRevenue = hData.reduce((s, h) => s + Number(h.revenue), 0)
    const totalOrders = hData.reduce((s, h) => s + Number(h.order_count), 0)
    const funnelEvents = asRows<{ event_type: string }>(funnelRes.data)
    const sessions = funnelEvents.filter((event) => event.event_type === 'session.started').length
    const conversions = funnelEvents.filter((event) => event.event_type === 'payment.succeeded').length

    setHourlyData(hData)
    setProducts(pData)
    setPeakDemand(peakData)
    setSummary({
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      avg_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      top_product: pData[0]?.name_en ?? '—',
      conversion_rate: sessions > 0 ? (conversions / sessions) * 100 : 0,
    })
    setLoading(false)
  }

  // Format hourly data for chart
  const chartData = hourlyData.map((h) => ({
    time: new Date(h.hour_bucket).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit' }),
    revenue: Number(h.revenue),
    orders: Number(h.order_count),
    aov: Number(h.avg_order_value),
  }))

  // Heatmap data
  const heatmapGrid = DAYS.map((day, dow) =>
    HOURS.map((_, hour) => {
      const match = peakDemand.find((p) => p.day_of_week === dow && p.hour_of_day === hour)
      return { dow, hour, count: match?.order_count ?? 0 }
    })
  )
  const maxHeat = Math.max(...peakDemand.map((p) => p.order_count), 1)

  // Pie colors
  const PIE_COLORS = [
    'var(--blue)',
    'var(--purple)',
    'var(--green)',
    'var(--amber)',
    'var(--red)',
    'var(--gold)',
    'var(--blue)',
    'var(--purple)',
  ]

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }> }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '0.6rem 0.9rem' }}>
        {payload.map((p, i) => (
          <p key={i} style={{ fontSize: '0.75rem', color: p.color, margin: '2px 0' }}>
            {p.name}: {typeof p.value === 'number' && p.name.includes('QAR') ? `QAR ${p.value.toFixed(2)}` : p.value}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="analytics-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Performance intelligence · Powered by live event data</p>
        </div>
        <div className="range-tabs">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button key={r} className={`range-tab ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="analytics-kpis">
        <MetricCard label="Total Revenue" value={`QAR ${summary.total_revenue.toFixed(0)}`} color="var(--gold)" />
        <MetricCard label="Total Orders" value={summary.total_orders} color="var(--blue)" />
        <MetricCard label="Avg Order Value" value={`QAR ${summary.avg_order_value.toFixed(2)}`} color="var(--purple)" />
        <MetricCard label="Top Product" value={summary.top_product} color="var(--green)" small />
        <MetricCard label="Conversion Rate" value={`${summary.conversion_rate.toFixed(1)}%`} color="var(--amber)" />
      </div>

      {/* Revenue Chart */}
      <div className="card analytics-chart">
        <h2 className="chart-title">Revenue Over Time</h2>
        {loading ? (
          <div className="chart-skeleton" />
        ) : chartData.length === 0 ? (
          <EmptyState message="No revenue data for this period" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.revenue} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ordGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.orders} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CHART_COLORS.orders} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue (QAR)" stroke={CHART_COLORS.revenue} strokeWidth={2} fill="url(#revGrad)" dot={false} />
              <Area type="monotone" dataKey="orders" name="Orders" stroke={CHART_COLORS.orders} strokeWidth={2} fill="url(#ordGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="analytics-grid-2">
        {/* Top Products */}
        <div className="card">
          <h2 className="chart-title">Top Products by Orders</h2>
          {loading ? <div className="chart-skeleton" /> : products.length === 0 ? <EmptyState message="No product data" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
              {products.slice(0, 6).map((p, i) => {
                const maxOrders = products[0]?.order_count ?? 1
                const pct = (p.order_count / maxOrders) * 100
                return (
                  <div key={p.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-soft)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name_en}</span>
                      <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{p.order_count}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 2, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Revenue by product pie */}
        <div className="card">
          <h2 className="chart-title">Revenue Mix</h2>
          {loading ? <div className="chart-skeleton" /> : products.length === 0 ? <EmptyState message="No data" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={products.slice(0, 6)} dataKey="total_revenue" nameKey="name_en" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                  {products.slice(0, 6).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => [`QAR ${val.toFixed(2)}`, 'Revenue']} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 8, fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '0.7rem', color: 'var(--text-muted)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Peak Demand Heatmap */}
      <div className="card">
        <h2 className="chart-title">Peak Demand Heatmap</h2>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Order volume by day and hour (darker = more orders)</p>
        {loading ? <div className="chart-skeleton" style={{ height: 140 }} /> : (
          <div className="heatmap">
            <div className="heatmap-hours">
              <div className="heatmap-corner" />
              {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
                <span key={h} style={{ flex: 1, fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', gridColumn: `span 3` }}>
                  {h}:00
                </span>
              ))}
            </div>
            {DAYS.map((day, dow) => (
              <div key={day} className="heatmap-row">
                <span className="heatmap-day">{day}</span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = heatmapGrid[dow][hour].count
                  const intensity = count / maxHeat
                  return (
                    <div
                      key={hour}
                      className="heatmap-cell"
                      title={`${day} ${hour}:00 — ${count} orders`}
                      style={{ background: 'var(--gold)', opacity: count === 0 ? 0.08 : Math.min(1, intensity * 0.85 + 0.18) }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AOV Bar Chart */}
      <div className="card">
        <h2 className="chart-title">Average Order Value Trend</h2>
        {loading ? <div className="chart-skeleton" /> : chartData.length === 0 ? <EmptyState message="No data" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.slice(-14)} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="aov" name="AOV (QAR)" fill={CHART_COLORS.aov} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <style>{`
        .analytics-page { animation: fadeIn 0.3s ease; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; }
        .page-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }
        .range-tabs { display: flex; gap: 0.25rem; background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
        .range-tab { padding: 0.3rem 0.75rem; border-radius: 6px; font-size: 0.72rem; font-weight: 700; color: var(--text-muted); transition: all var(--transition); }
        .range-tab.active { background: var(--bg-3); color: var(--text); }
        .range-tab:hover:not(.active) { color: var(--text-soft); }

        .analytics-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
        @media (max-width: 1100px) { .analytics-kpis { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 640px)  { .analytics-kpis { grid-template-columns: repeat(2, 1fr); } }

        .analytics-chart { padding: 1.25rem; margin-bottom: 1rem; }
        .chart-title { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 0.5rem; }
        .chart-skeleton { height: 220px; background: var(--bg-3); border-radius: 8px; animation: pulse 1.5s infinite; }
        .analytics-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
        @media (max-width: 900px) { .analytics-grid-2 { grid-template-columns: 1fr; } }
        .analytics-grid-2 .card { padding: 1.25rem; }
        .card { margin-bottom: 1rem; padding: 1.25rem; }

        .heatmap { overflow-x: auto; }
        .heatmap-hours { display: flex; align-items: center; gap: 3px; margin-bottom: 4px; padding-left: 36px; }
        .heatmap-corner { width: 36px; flex-shrink: 0; }
        .heatmap-row { display: flex; align-items: center; gap: 3px; margin-bottom: 3px; }
        .heatmap-day { width: 32px; flex-shrink: 0; font-size: 0.62rem; color: var(--text-muted); font-weight: 600; text-align: right; padding-right: 6px; }
        .heatmap-cell { width: 22px; height: 18px; flex-shrink: 0; border-radius: 3px; cursor: default; transition: transform 0.1s; }
        .heatmap-cell:hover { transform: scale(1.3); z-index: 1; position: relative; }
        @media (max-width: 640px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
          }
          .range-tabs {
            width: 100%;
            justify-content: space-between;
          }
          .range-tab {
            flex: 1;
            text-align: center;
          }
          .analytics-kpis {
            grid-template-columns: 1fr;
          }
          .analytics-chart,
          .analytics-grid-2 .card,
          .card {
            padding: 1rem;
          }
          .heatmap-day {
            width: 28px;
          }
          .heatmap-cell {
            width: 18px;
            height: 16px;
          }
        }
      `}</style>
    </div>
  )
}

function MetricCard({ label, value, color, small }: { label: string; value: string | number; color: string; small?: boolean }) {
  return (
    <div className="metric-card">
      <div className="metric-val" style={{ color, fontSize: small ? '0.9rem' : undefined }}>{value}</div>
      <div className="metric-label">{label}</div>
      <style>{`
        .metric-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1rem; }
        .metric-val { font-size: 1.3rem; font-weight: 700; font-family: var(--font-mono); margin-bottom: 0.25rem; }
        .metric-label { font-size: 0.62rem; color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
      `}</style>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
      {message}
    </div>
  )
}
