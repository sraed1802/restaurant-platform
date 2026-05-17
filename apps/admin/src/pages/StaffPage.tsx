// apps/admin/src/pages/StaffPage.tsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface StaffMember {
  id: string
  name: string
  phone: string | null
  email: string
  app_role: string
  is_active: boolean
  created_at: string
}

const EMPTY_STAFF = {
  name: '',
  email: '',
  password: '',
  phone: '',
  role: 'supervisor',
}

type StaffViewerRole = 'admin' | 'manager'

interface StaffPageProps {
  /** Only admin and manager can open this page; value matches signed-in staff role. */
  viewerRole: StaffViewerRole
}

export default function StaffPage({ viewerRole }: StaffPageProps) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_STAFF)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStaff()
  }, [])

  async function loadStaff() {
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-staff', {
        body: { action: 'list' }
      })
      if (error) throw error
      setStaff(data || [])
    } catch (err: any) {
      console.error('Error loading staff:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveStaff() {
    if (!form.name || !form.email || !form.password) {
      setError('Please fill in all required fields.')
      return
    }
    
    setSaving(true)
    setError(null)
    
    try {
      const { error } = await supabase.functions.invoke('manage-staff', {
        body: {
          action: 'create',
          ...form
        }
      })
      
      if (error) throw error
      
      setShowForm(false)
      setForm(EMPTY_STAFF)
      await loadStaff()
    } catch (err: any) {
      setError(err.message || 'Failed to create staff member.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(id: string, currentStatus: boolean) {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this user?`)) return
    
    try {
      const { error } = await supabase.functions.invoke('manage-staff', {
        body: {
          action: 'toggle_active',
          id,
          is_active: !currentStatus
        }
      })
      if (error) throw error
      await loadStaff()
    } catch (err) {
      console.error('Error toggling status:', err)
      alert('Failed to update status')
    }
  }

  async function deleteStaff(id: string) {
    if (!confirm('Are you sure you want to permanently delete this user? This cannot be undone.')) return
    
    try {
      const { error } = await supabase.functions.invoke('manage-staff', {
        body: {
          action: 'delete',
          id
        }
      })
      if (error) throw error
      await loadStaff()
    } catch (err) {
      console.error('Error deleting staff:', err)
      alert('Failed to delete staff member')
    }
  }

  return (
    <div className="staff-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="page-sub">
            {viewerRole === 'manager'
              ? 'Managers can add supervisors and other managers. Administrator accounts are hidden and cannot be managed here.'
              : 'Manage system users and their roles'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Staff
        </button>
      </div>

      <div className="staff-table-container">
        {loading ? (
          <div className="loading-state">Loading staff members...</div>
        ) : staff.length === 0 ? (
          <div className="empty-state">No staff members found.</div>
        ) : (
          <table className="staff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className={!s.is_active ? 'inactive' : ''}>
                  <td>
                    <div className="staff-name">{s.name}</div>
                    <div className="staff-phone">{s.phone}</div>
                  </td>
                  <td>{s.email}</td>
                  <td>
                    <span className={`role-badge ${s.app_role}`}>{s.app_role}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${s.is_active ? 'active' : 'inactive'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleActive(s.id, s.is_active)}
                      >
                        {s.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteStaff(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="staff-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Staff</h2>
              <button className="close-btn" onClick={() => setShowForm(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              {error && <div className="error-banner">{error}</div>}
              
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); saveStaff(); }}>
                <div className="field-group">
                  <label>Full Name *</label>
                  <input 
                    value={form.name} 
                    onChange={(e) => setForm(f => ({...f, name: e.target.value}))} 
                    placeholder="John Doe"
                  />
                </div>
                
                <div className="field-group">
                  <label>Email *</label>
                  <input 
                    type="email"
                    autoComplete="username"
                    value={form.email} 
                    onChange={(e) => setForm(f => ({...f, email: e.target.value}))} 
                    placeholder="john@example.com"
                  />
                </div>
                
                <div className="field-group">
                  <label>Password *</label>
                  <input 
                    type="password"
                    autoComplete="new-password"
                    value={form.password} 
                    onChange={(e) => setForm(f => ({...f, password: e.target.value}))} 
                    placeholder="Minimum 6 characters"
                  />
                </div>
                
                <div className="field-group">
                  <label>Phone Number</label>
                  <input 
                    value={form.phone} 
                    onChange={(e) => setForm(f => ({...f, phone: e.target.value}))} 
                    placeholder="+974 XXXX XXXX"
                  />
                </div>
                
                <div className="field-group full-width">
                  <label>Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  >
                    {viewerRole === 'admin' && <option value="admin">Admin</option>}
                    <option value="manager">Manager</option>
                    <option value="supervisor">Supervisor</option>
                  </select>
                </div>
              </form>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" type="button" onClick={saveStaff} disabled={saving}>
                {saving ? 'Creating...' : 'Create Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .staff-page { animation: fadeIn 0.3s ease; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem; }
        .page-title { font-size: 1.4rem; font-weight: 700; }
        .page-sub { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; }
        
        .staff-table-container { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
        .staff-table { width: 100%; border-collapse: collapse; text-align: left; }
        .staff-table th { padding: 1rem 1.25rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--bg-2); }
        .staff-table td { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .staff-table tr:last-child td { border-bottom: none; }
        .staff-table tr.inactive td { opacity: 0.6; }
        
        .staff-name { font-weight: 600; color: var(--text); font-size: 0.9rem; }
        .staff-phone { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem; }
        
        .role-badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: capitalize; }
        .role-badge.admin { background: var(--red-dim); color: var(--red); }
        .role-badge.manager { background: var(--gold-dim); color: var(--gold); }
        .role-badge.supervisor { background: var(--blue-dim); color: var(--blue); }
        
        .status-badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
        .status-badge.active { background: var(--green-dim); color: var(--green); }
        .status-badge.inactive { background: var(--bg-3); color: var(--text-muted); }
        
        .action-buttons { display: flex; gap: 0.5rem; }
        .btn-sm { padding: 0.4rem 0.75rem; font-size: 0.75rem; }
        
        .loading-state, .empty-state { padding: 3rem; text-align: center; color: var(--text-muted); font-size: 0.9rem; }
        
        .modal-backdrop { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 1rem; animation: fadeIn 0.2s ease; }
        .staff-modal { width: 500px; max-width: 100%; background: var(--bg-card); border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column; animation: slideIn 0.25s ease; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-size: 1.1rem; font-weight: 700; }
        .close-btn { background: transparent; border: none; font-size: 1.2rem; color: var(--text-muted); cursor: pointer; }
        .modal-body { padding: 1.5rem; overflow-y: auto; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .full-width { grid-column: 1 / -1; }
        .field-group label { display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 0.4rem; color: var(--text-soft); }
        .field-group input, .field-group select { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font-size: 0.9rem; }
        .error-banner { background: var(--red-dim); color: var(--red); padding: 0.75rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.85rem; }
        .modal-footer { padding: 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.75rem; }
      `}</style>
    </div>
  )
}
