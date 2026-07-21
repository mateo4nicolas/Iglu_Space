import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import AddUserModal from '../components/team/AddUserModal'
import styles from './Equipo.module.css'

export default function EquipoPage() {
  const { profile: myProfile, isAdmin, isSuperAdmin } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [departments, setDepartments] = useState([])
  const [profileDepts, setProfileDepts] = useState({}) // { userId: [deptId, ...] }
  const [loading, setLoading] = useState(true)
  const [editingDepts, setEditingDepts] = useState(null)  // userId being edited for depts
  const [editingName, setEditingName] = useState(null)
  const [nameVal, setNameVal] = useState('')
  const [editingUsername, setEditingUsername] = useState(null)
  const [usernameVal, setUsernameVal] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: p }, { data: d }, { data: pd }] = await Promise.all([
      supabase.from('profiles').select('*, departments(id, name, color)').order('full_name'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('profile_departments').select('user_id, department_id, departments(id, name, color)'),
    ])
    setProfiles(p || [])
    setDepartments(d || [])
    // Build map: userId -> [deptId, ...]
    const map = {}
    ;(pd || []).forEach(r => {
      if (!map[r.user_id]) map[r.user_id] = []
      map[r.user_id].push(r.department_id)
    })
    setProfileDepts(map)
    setLoading(false)
  }

  async function updateRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    fetchAll()
  }

  async function updateSuperAdmin(id, value) {
    await supabase.from('profiles').update({ is_super_admin: value }).eq('id', id)
    fetchAll()
  }

  async function saveName(id) {
    await supabase.from('profiles').update({ display_name: nameVal.trim() || null }).eq('id', id)
    fetchAll()
    setEditingName(null)
  }

  async function saveUsername(id) {
    await supabase.from('profiles').update({ username: usernameVal.trim() || null }).eq('id', id)
    fetchAll()
    setEditingUsername(null)
  }

  async function saveDepts(userId, selectedDeptIds) {
    // Delete all current, re-insert selected
    await supabase.from('profile_departments').delete().eq('user_id', userId)
    if (selectedDeptIds.length > 0) {
      await supabase.from('profile_departments').insert(
        selectedDeptIds.map(deptId => ({ user_id: userId, department_id: deptId }))
      )
    }
    // Also update primary department_id on profiles to first selection (or null)
    await supabase.from('profiles').update({ department_id: selectedDeptIds[0] || null }).eq('id', userId)
    setEditingDepts(null)
    fetchAll()
  }

  async function deleteUser(id) {
    setDeleting(true)
    setDeleteError('')
    const { data, error: fnError } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: id },
    })
    setDeleting(false)
    if (fnError || data?.error) {
      setDeleteError(data?.error || fnError?.message || 'No se pudo eliminar el usuario')
      return
    }
    setConfirmDeleteId(null)
    fetchAll()
  }

  function displayFor(p) {
    return p.username || p.display_name || p.full_name
  }

  if (loading) return <div className={styles.loading}>Cargando equipo...</div>

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Equipo</h1>
        <span className={styles.sub}>{profiles.length} miembros</span>
        {isAdmin && (
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto' }} onClick={() => setShowAddUser(true)}>
            + Añadir usuario
          </button>
        )}
      </div>

      {showAddUser && (
        <AddUserModal onClose={() => setShowAddUser(false)} onCreated={fetchAll} />
      )}

      <div className={styles.userList}>
        {profiles.map(p => {
          const userDeptIds = profileDepts[p.id] || []
          const userDepts = departments.filter(d => userDeptIds.includes(d.id))
          return (
            <div key={p.id} className={styles.userCard}>
              <div className={styles.userAvatar}>{displayFor(p)[0].toUpperCase()}</div>
              <div className={styles.userInfo}>
                {/* Display name */}
                {editingName === p.id ? (
                  <div className={styles.nameEditRow}>
                    <input className={styles.nameInput} value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder="Nombre visible" autoFocus onKeyDown={e => e.key === 'Enter' && saveName(p.id)} />
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => saveName(p.id)}>Guardar</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setEditingName(null)}>✕</button>
                  </div>
                ) : (
                  <div className={styles.nameRow}>
                    <span className={styles.userName}>
                      {displayFor(p)}
                      {p.id === myProfile?.id && <span className={styles.youTag}>Tú</span>}
                    </span>
                    {(isAdmin || p.id === myProfile?.id) && (
                      <button className={styles.editNameBtn} onClick={() => { setEditingName(p.id); setNameVal(p.display_name || p.full_name) }} title="Editar nombre"><EditIcon /></button>
                    )}
                  </div>
                )}

                {/* Username */}
                {editingUsername === p.id ? (
                  <div className={styles.nameEditRow} style={{ marginTop: 4 }}>
                    <input className={styles.nameInput} value={usernameVal} onChange={e => setUsernameVal(e.target.value)} placeholder="@username" autoFocus onKeyDown={e => e.key === 'Enter' && saveUsername(p.id)} />
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => saveUsername(p.id)}>Guardar</button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setEditingUsername(null)}>✕</button>
                  </div>
                ) : (
                  <div className={styles.usernameRow}>
                    <span className={styles.usernameTag}>
                      {p.username ? `@${p.username}` : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Sin username</span>}
                    </span>
                    {(isAdmin || p.id === myProfile?.id) && (
                      <button className={styles.editNameBtn} onClick={() => { setEditingUsername(p.id); setUsernameVal(p.username || '') }} title="Editar username"><EditIcon /></button>
                    )}
                  </div>
                )}

                {/* Departments */}
                <div className={styles.deptTags}>
                  {userDepts.length === 0
                    ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin departamento</span>
                    : userDepts.map(d => (
                      <span key={d.id} className={styles.deptTag} style={{ background: d.color + '22', color: d.color, borderColor: d.color + '44' }}>
                        {d.name}
                      </span>
                    ))}
                </div>
              </div>

              <div className={styles.userActions}>
                {isSuperAdmin && p.id !== myProfile?.id ? (
                  <button
                    className={`badge ${p.is_super_admin ? 'badge-admin' : p.role === 'admin' ? 'badge-info' : 'badge-user'}`}
                    style={{ cursor: 'pointer', fontSize: 12 }}
                    onClick={() => {
                      // Cycle: Usuario -> Supervisor -> Admin -> Usuario
                      if (p.is_super_admin) {
                        updateRole(p.id, 'user')
                        updateSuperAdmin(p.id, false)
                      } else if (p.role === 'admin') {
                        updateSuperAdmin(p.id, true)
                      } else {
                        updateRole(p.id, 'admin')
                      }
                    }}
                    title="Clic para cambiar rol"
                  >
                    {p.is_super_admin ? 'Admin' : p.role === 'admin' ? 'Supervisor' : 'Usuario'}
                  </button>
                ) : (
                  <span className={`badge ${p.is_super_admin ? 'badge-admin' : p.role === 'admin' ? 'badge-info' : 'badge-user'}`} style={{ fontSize: 12 }}>
                    {p.is_super_admin ? 'Admin' : p.role === 'admin' ? 'Supervisor' : 'Usuario'}
                  </span>
                )}

                {isAdmin && (
                  editingDepts === p.id ? (
                    <MultiDeptPicker
                      departments={departments}
                      selected={profileDepts[p.id] || []}
                      onSave={sel => saveDepts(p.id, sel)}
                      onCancel={() => setEditingDepts(null)}
                    />
                  ) : (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setEditingDepts(p.id)}>
                      <DeptIcon /> Departamentos
                    </button>
                  )
                )}

                {isAdmin && p.id !== myProfile?.id && (
                  confirmDeleteId === p.id ? (
                    <div className={styles.nameEditRow}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>¿Eliminar a {displayFor(p)}?</span>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setConfirmDeleteId(null); setDeleteError('') }} disabled={deleting}>No</button>
                      <button className="btn btn-danger" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => deleteUser(p.id)} disabled={deleting}>
                        {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px', color: 'var(--danger)' }} onClick={() => { setConfirmDeleteId(p.id); setDeleteError('') }} title="Eliminar usuario">
                      <TrashIcon /> Eliminar
                    </button>
                  )
                )}
                {confirmDeleteId === p.id && deleteError && (
                  <span style={{ fontSize: 11, color: 'var(--danger)', width: '100%' }}>{deleteError}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MultiDeptPicker({ departments, selected, onSave, onCancel }) {
  const [sel, setSel] = useState([...selected])

  function toggle(id) {
    setSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  return (
    <div className={styles.multiDeptPicker}>
      <div className={styles.multiDeptGrid}>
        {departments.map(d => (
          <button
            key={d.id}
            type="button"
            className={`${styles.deptChip} ${sel.includes(d.id) ? styles.deptChipSel : ''}`}
            style={sel.includes(d.id) ? { borderColor: d.color, background: d.color + '22', color: d.color } : {}}
            onClick={() => toggle(d.id)}
          >
            <span className={styles.deptDot} style={{ background: d.color }} />
            {d.name}
            {sel.includes(d.id) && ' ✓'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => onSave(sel)}>Guardar</button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function EditIcon() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> }
function TrashIcon() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 4h11M6 4V2.5h4V4M5 4l.5 9.5a1 1 0 001 1h5a1 1 0 001-1L13 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function DeptIcon() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg> }
