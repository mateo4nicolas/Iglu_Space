import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks, format, eachDayOfInterval, isSameWeek, isToday
} from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './LogDiario.module.css'

const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

export default function LogDiarioPage() {
  const { profile, isAdmin } = useAuth()
  const [weekRef, setWeekRef] = useState(new Date())
  const [depts, setDepts] = useState([])           // {id, name, color, members: [{id,name}]}
  const [entries, setEntries] = useState({})        // { "dept_id|user_id|date": text }
  const [loading, setLoading] = useState(true)
  const [showDeptModal, setShowDeptModal] = useState(false)
  const [editingDept, setEditingDept] = useState(null)

  const weekStart = startOfWeek(weekRef, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(weekRef,   { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd }).slice(0, 5)
  const weekLabel = `${format(weekStart, 'd MMM', { locale: es })} – ${format(weekEnd, 'd MMM yyyy', { locale: es })}`
  const weekKey = format(weekStart, 'yyyy-MM-dd')

  const fetchData = useCallback(async () => {
    setLoading(true)
    // Fetch log_departments with members
    const { data: ldepts } = await supabase
      .from('log_departments')
      .select('*, log_department_members(user_id, profiles(id, full_name, display_name, username))')
      .order('position')

    // Fetch entries for this week
    const { data: lentries } = await supabase
      .from('log_entries')
      .select('*')
      .gte('date', format(weekStart, 'yyyy-MM-dd'))
      .lte('date', format(weekEnd, 'yyyy-MM-dd'))

    const deptList = (ldepts || []).map(d => ({
      id: d.id,
      name: d.name,
      color: d.color,
      members: (d.log_department_members || []).map(m => ({
        id: m.profiles?.id,
        name: m.profiles?.username || m.profiles?.display_name || m.profiles?.full_name || '?',
      })).filter(m => m.id),
    }))

    const entryMap = {}
    ;(lentries || []).forEach(e => {
      entryMap[`${e.dept_id}|${e.user_id}|${e.date}`] = e.text
    })

    setDepts(deptList)
    setEntries(entryMap)
    setLoading(false)
  }, [weekKey])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('log-entries-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_entries' }, fetchData)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fetchData])

  async function saveEntry(deptId, userId, date, text) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const key = `${deptId}|${userId}|${dateStr}`
    setEntries(p => ({ ...p, [key]: text }))
    await supabase.from('log_entries').upsert(
      { dept_id: deptId, user_id: userId, date: dateStr, text, week_start: weekKey },
      { onConflict: 'dept_id,user_id,date' }
    )
  }

  // Can user edit a cell?
  function canEdit(userId, date) {
    if (isAdmin) return true
    return userId === profile?.id && isToday(date)
  }

  const currentWeek = isSameWeek(weekRef, new Date(), { weekStartsOn: 1 })

  return (
    <div className={styles.page}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <h1 className={styles.title}>Log Diario</h1>
          {currentWeek && <span className="badge badge-success">Semana actual</span>}
        </div>
        <div className={styles.topRight}>
          <div className={styles.weekNav}>
            <button className={styles.navBtn} onClick={() => setWeekRef(w => subWeeks(w, 1))}><ChevLeft /></button>
            <span className={styles.weekLabel}>{weekLabel}</span>
            <button className={styles.navBtn} onClick={() => setWeekRef(w => addWeeks(w, 1))}><ChevRight /></button>
          </div>
          {!currentWeek && (
            <button className={styles.todayBtn} onClick={() => setWeekRef(new Date())}>Esta semana</button>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditingDept(null); setShowDeptModal(true) }}>
              <PlusIcon /> Departamento
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Cargando...</div>
      ) : depts.length === 0 ? (
        <div className={styles.empty}>
          {isAdmin
            ? 'Crea el primer departamento para comenzar.'
            : 'El administrador aún no ha configurado los departamentos del log.'}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDept}>Departamento</th>
                <th className={styles.thName}>Colaborador</th>
                {days.map(d => (
                  <th key={d.toISOString()} className={`${styles.thDay} ${isToday(d) ? styles.todayCol : ''}`}>
                    <div className={styles.dayLabel}>{format(d, 'EEEE', { locale: es }).toUpperCase()}</div>
                    <div className={styles.dayNum}>{format(d, 'd')}</div>
                  </th>
                ))}
                {isAdmin && <th className={styles.thActions} />}
              </tr>
            </thead>
            <tbody>
              {depts.map(dept => {
                const members = dept.members.length > 0 ? dept.members : [{ id: null, name: 'Sin miembros' }]
                return members.map((member, mi) => (
                  <tr key={`${dept.id}-${member.id ?? mi}`} className={mi === 0 ? styles.firstRow : ''}>
                    {mi === 0 && (
                      <td
                        rowSpan={members.length}
                        className={styles.tdDept}
                        style={{ borderLeft: `4px solid ${dept.color}`, background: dept.color + '18' }}
                      >
                        <div className={styles.deptCell}>
                          <span className={styles.deptName}>{dept.name}</span>
                          {isAdmin && (
                            <div className={styles.deptActions}>
                              <button className={styles.iconBtn} onClick={() => { setEditingDept(dept); setShowDeptModal(true) }}><EditIcon /></button>
                              <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteDept(dept.id)}><TrashIcon /></button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    <td className={styles.tdName}>{member.name}</td>
                    {days.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd')
                      const key = `${dept.id}|${member.id}|${dateStr}`
                      const text = entries[key] || ''
                      const editable = member.id && canEdit(member.id, day)
                      return (
                        <td
                          key={dateStr}
                          className={`${styles.tdCell} ${isToday(day) ? styles.todayCell : ''} ${editable ? styles.editableCell : ''}`}
                        >
                          {editable ? (
                            <AutosaveTextarea
                              value={text}
                              onSave={val => saveEntry(dept.id, member.id, day, val)}
                              placeholder={isToday(day) ? 'Escribe aquí...' : ''}
                            />
                          ) : (
                            <div className={styles.cellText}>{text}</div>
                          )}
                        </td>
                      )
                    })}
                    {isAdmin && mi === 0 && (
                      <td rowSpan={members.length} className={styles.tdActions} />
                    )}
                    {isAdmin && mi !== 0 && null}
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}

      {showDeptModal && isAdmin && (
        <DeptModal
          dept={editingDept}
          onClose={() => setShowDeptModal(false)}
          onSaved={fetchData}
        />
      )}
    </div>
  )

  async function deleteDept(id) {
    if (!window.confirm('¿Eliminar este departamento y todos sus registros?')) return
    await supabase.from('log_departments').delete().eq('id', id)
    fetchData()
  }
}

// ── Autosave textarea ────────────────────────────────────────────────────────
function AutosaveTextarea({ value, onSave, placeholder }) {
  const [text, setText] = useState(value)
  const timer = useRef(null)

  useEffect(() => { setText(value) }, [value])

  function handleChange(e) {
    const v = e.target.value
    setText(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSave(v), 700)
  }

  function handleBlur() {
    clearTimeout(timer.current)
    if (text !== value) onSave(text)
  }

  return (
    <textarea
      className={styles.cellTextarea}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      rows={3}
    />
  )
}

// ── Dept modal (admin) ───────────────────────────────────────────────────────
const DEPT_COLORS = ['#6366f1','#f472b6','#fb923c','#34d399','#60a5fa','#fbbf24','#a78bfa','#2dd4bf']

function DeptModal({ dept, onClose, onSaved }) {
  const [name, setName] = useState(dept?.name || '')
  const [color, setColor] = useState(dept?.color || DEPT_COLORS[0])
  const [allProfiles, setAllProfiles] = useState([])
  const [members, setMembers] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, display_name, username').then(({ data }) => {
      setAllProfiles(data || [])
    })
    if (dept?.id) {
      supabase.from('log_department_members').select('user_id').eq('dept_id', dept.id).then(({ data }) => {
        setMembers((data || []).map(m => m.user_id))
      })
    }
  }, [dept?.id])

  function toggleMember(id) {
    setMembers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    let deptId = dept?.id
    if (deptId) {
      await supabase.from('log_departments').update({ name: name.trim(), color }).eq('id', deptId)
    } else {
      const { data: pos } = await supabase.from('log_departments').select('position').order('position', { ascending: false }).limit(1)
      const nextPos = (pos?.[0]?.position ?? -1) + 1
      const { data: nd } = await supabase.from('log_departments').insert({ name: name.trim(), color, position: nextPos }).select().single()
      deptId = nd?.id
    }
    if (deptId) {
      await supabase.from('log_department_members').delete().eq('dept_id', deptId)
      if (members.length > 0) {
        await supabase.from('log_department_members').insert(members.map(uid => ({ dept_id: deptId, user_id: uid })))
      }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>{dept ? 'Editar departamento' : 'Nuevo departamento'}</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalBody}>
          <label className={styles.label}>Nombre</label>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Diseño, Community..." autoFocus />

          <label className={styles.label} style={{ marginTop: 14 }}>Color</label>
          <div className={styles.colorRow}>
            {DEPT_COLORS.map(c => (
              <button key={c} type="button" className={`${styles.colorChip} ${color === c ? styles.colorSel : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>

          <label className={styles.label} style={{ marginTop: 14 }}>Colaboradores</label>
          <div className={styles.memberGrid}>
            {allProfiles.map(p => {
              const nm = p.username || p.display_name || p.full_name
              const sel = members.includes(p.id)
              return (
                <button key={p.id} type="button" className={`${styles.memberChip} ${sel ? styles.memberSel : ''}`} onClick={() => toggleMember(p.id)}>
                  <span className={styles.chipAvatar}>{nm[0]?.toUpperCase()}</span>
                  {nm}{sel && ' ✓'}
                </button>
              )
            })}
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlusIcon()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function ChevLeft()    { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevRight()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function EditIcon()    { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> }
function TrashIcon()   { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
