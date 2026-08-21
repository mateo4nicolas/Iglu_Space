import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useRecordings } from '../hooks/useRecordings'
import { useRecordingViews } from '../hooks/useRecordingViews'
import { useRecordingsWeek } from '../hooks/useRecordingsWeek'
import { useMaterialUploads } from '../hooks/useMaterialUploads'
import { useVideographerColors, COLOR_PALETTE } from '../hooks/useVideographerColors'
import { format, addWeeks, subWeeks, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Grabaciones.module.css'

const STATUS_CONFIG = {
  coordinado:   { label: 'Coordinado',   className: 'statusGreen' },
  coordinando:  { label: 'Coordinando',  className: 'statusYellow' },
  reagendado:   { label: 'Re agendado',  className: 'statusRed' },
}

export default function GrabacionesPage() {
  const { isAdmin, profile } = useAuth()
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 })
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const [activeDay, setActiveDay] = useState(0)
  const selectedDate = weekDays[activeDay]
  const [mode, setMode] = useState('lista') // 'lista' | 'semana'

  const {
    items, loading, allProfiles,
    createItem, updateAdminFields, updateUserNotes, deleteItem,
    isAssignedToMe,
  } = useRecordings(selectedDate)

  const { items: weekItems, loading: weekLoading } = useRecordingsWeek(weekStart, addDays(weekStart, 4))
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(addDays(weekStart, 4), 'yyyy-MM-dd')

  const { views, addView, deleteView } = useRecordingViews()
  const [activeViewId, setActiveViewId] = useState('all')
  const [showAddView, setShowAddView] = useState(false)

  const { colorOf, setColor: setVideographerColor } = useVideographerColors()
  const [showColors, setShowColors] = useState(false)

  function colorForVideographer(videographerId) {
    const manual = colorOf(videographerId)
    if (manual) return manual
    const idx = allProfiles.findIndex(p => p.id === videographerId)
    return COLOR_PALETTE[idx >= 0 ? idx % COLOR_PALETTE.length : 0]
  }

  const {
    items: materialItems, loading: materialLoading,
    createItem: createMaterialItem, setStatus: setMaterialStatus, deleteItem: deleteMaterialItem,
    isAssignedToMe: isAssignedToMaterial,
  } = useMaterialUploads()
  const [showMaterialCreate, setShowMaterialCreate] = useState(false)

  const activeView = views.find(v => v.id === activeViewId)
  const visibleItems = activeView
    ? items.filter(item => (item.assigned_to || []).includes(activeView.videographer_id))
    : items
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')
  const visibleMaterialItems = materialItems
    .filter(item => item.date === selectedDateStr)
    .filter(item => activeView ? (item.videographer_ids || []).includes(activeView.videographer_id) : true)

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editingNotes, setEditingNotes] = useState(null)

  const weekLabel = format(weekStart, 'd MMM', { locale: es }) + ' - ' + format(addDays(weekStart, 4), 'd MMM', { locale: es })

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Grabaciones</h1>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <PlusIcon /> Nueva grabación
            </button>
            <button className="btn" style={{ background: '#6d28d9', color: '#fff', borderColor: '#6d28d9' }} onClick={() => setShowMaterialCreate(true)}>
              <PlusIcon /> Subida de Material
            </button>
          </div>
        )}
      </div>

      <div className={styles.viewTabs}>
        <button
          className={`${styles.viewTab} ${activeViewId === 'all' ? styles.viewTabActive : ''}`}
          onClick={() => setActiveViewId('all')}
        >
          Todos
        </button>
        {views.map(v => (
          <div key={v.id} className={styles.viewTabWrap}>
            <button
              className={`${styles.viewTab} ${activeViewId === v.id ? styles.viewTabActive : ''}`}
              onClick={() => setActiveViewId(v.id)}
            >
              {v.label}
            </button>
            {isAdmin && (
              <button
                className={styles.viewTabRemove}
                title="Eliminar vista"
                onClick={() => {
                  if (window.confirm(`¿Eliminar la vista "${v.label}"?`)) {
                    deleteView(v.id)
                    if (activeViewId === v.id) setActiveViewId('all')
                  }
                }}
              >
                <CloseIcon />
              </button>
            )}
          </div>
        ))}
        {isAdmin && (
          <button className={styles.addViewBtn} onClick={() => setShowAddView(true)}>
            <PlusIcon /> Añadir vista
          </button>
        )}
        {isAdmin && (
          <button className={styles.colorsBtn} onClick={() => setShowColors(true)}>
            <PaletteIcon /> Colores de videógrafos
          </button>
        )}
      </div>

      <div className={styles.weekNav}>
        <button className={styles.navBtn} onClick={() => setWeekAnchor(d => subWeeks(d, 1))}>
          <ChevronLeft />
        </button>
        <span className={styles.weekLabel}>{weekLabel}</span>
        <button className={styles.navBtn} onClick={() => setWeekAnchor(d => addWeeks(d, 1))}>
          <ChevronRight />
        </button>
        <div className={styles.modeToggle}>
          <button className={`${styles.modeBtn} ${mode === 'lista' ? styles.modeBtnActive : ''}`} onClick={() => setMode('lista')}>Lista</button>
          <button className={`${styles.modeBtn} ${mode === 'semana' ? styles.modeBtnActive : ''}`} onClick={() => setMode('semana')}>Semana</button>
        </div>
      </div>

      {mode === 'semana' ? (
        <WeekCalendar
          weekDays={weekDays}
          items={activeView ? weekItems.filter(item => (item.assigned_to || []).includes(activeView.videographer_id)) : weekItems}
          materialItems={materialItems
            .filter(item => item.date >= weekStartStr && item.date <= weekEndStr)
            .filter(item => activeView ? (item.videographer_ids || []).includes(activeView.videographer_id) : true)}
          loading={weekLoading}
          colorForVideographer={colorForVideographer}
          onSelectItem={(item) => {
            const dayIndex = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === item.date)
            if (dayIndex >= 0) setActiveDay(dayIndex)
            setMode('lista')
            if (item._kind === 'material') return // se gestiona en la tarjeta de la lista (Subido/No subido)
            if (isAdmin) setEditing(item)
            else if ((item.assigned_to || []).includes(profile?.id)) setEditingNotes(item.id)
          }}
        />
      ) : (
        <div className={styles.dayTabs}>
          {weekDays.map((day, i) => {
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
            return (
              <button
                key={i}
                className={`${styles.dayTab} ${activeDay === i ? styles.dayTabActive : ''} ${isToday ? styles.dayTabToday : ''}`}
                onClick={() => setActiveDay(i)}
              >
                <span className={styles.dayTabName}>{format(day, 'EEEE', { locale: es })}</span>
                <span className={styles.dayTabDate}>{format(day, 'd MMM', { locale: es })}</span>
              </button>
            )
          })}
        </div>
      )}

      {mode === 'lista' && (loading ? (
        <p className={styles.loading}>Cargando...</p>
      ) : visibleItems.length === 0 ? (
        <div className={styles.empty}>
          <p>{activeView ? `No hay grabaciones de ${activeView.label} para este día` : 'No hay grabaciones programadas para este día'}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {visibleItems.map(item => (
            <RecordingCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              canEditNotes={isAssignedToMe(item)}
              onEditAdmin={() => setEditing(item)}
              onEditNotes={() => setEditingNotes(item.id)}
              onSetStatus={(status) => updateAdminFields(item.id, { status })}
              onDelete={() => { if (window.confirm('¿Eliminar esta grabación?')) deleteItem(item.id) }}
            />
          ))}
        </div>
      ))}

      {!materialLoading && visibleMaterialItems.length > 0 && (
        <div className={styles.materialSection}>
          <div className={styles.materialSectionHeader}>
            <h2 className={styles.materialSectionTitle}>Subida de Material</h2>
          </div>
          <div className={styles.materialGrid}>
            {visibleMaterialItems.map(item => (
              <MaterialCard
                key={item.id}
                item={item}
                allProfiles={allProfiles}
                isAdmin={isAdmin}
                canEditStatus={isAdmin || isAssignedToMaterial(item)}
                onSetStatus={(status) => setMaterialStatus(item.id, status)}
                onDelete={() => { if (window.confirm('¿Eliminar esta tarjeta de material?')) deleteMaterialItem(item.id) }}
              />
            ))}
          </div>
        </div>
      )}

      {showCreate && (
        <RecordingFormModal
          allProfiles={allProfiles}
          onClose={() => setShowCreate(false)}
          onSave={async (data) => {
            const result = await createItem(data)
            if (!result.error) setShowCreate(false)
            return result
          }}
        />
      )}

      {editing && (
        <RecordingFormModal
          allProfiles={allProfiles}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const result = await updateAdminFields(editing.id, data)
            if (!result.error) setEditing(null)
            return result
          }}
        />
      )}

      {editingNotes && (
        <NotesModal
          item={items.find(i => i.id === editingNotes)}
          onClose={() => setEditingNotes(null)}
          onSave={async (data) => {
            const result = await updateUserNotes(editingNotes, data)
            if (!result.error) setEditingNotes(null)
            return result
          }}
        />
      )}

      {showAddView && (
        <AddViewModal
          allProfiles={allProfiles}
          existingIds={views.map(v => v.videographer_id)}
          onClose={() => setShowAddView(false)}
          onSave={async (videographerId, label) => {
            const result = await addView(videographerId, label)
            if (!result.error) setShowAddView(false)
            return result
          }}
        />
      )}

      {showMaterialCreate && (
        <MaterialFormModal
          allProfiles={allProfiles}
          defaultDate={selectedDateStr}
          onClose={() => setShowMaterialCreate(false)}
          onSave={async (data) => {
            const result = await createMaterialItem(data)
            if (!result.error) setShowMaterialCreate(false)
            return result
          }}
        />
      )}

      {showColors && (
        <ColorsModal
          allProfiles={allProfiles}
          colorForVideographer={colorForVideographer}
          onSetColor={setVideographerColor}
          onClose={() => setShowColors(false)}
        />
      )}
    </div>
  )
}

function RecordingCard({ item, isAdmin, canEditNotes, onEditAdmin, onEditNotes, onSetStatus, onDelete }) {
  const timeLabel = item.time_start
    ? `${item.time_start.slice(0, 5)}${item.time_end ? ` – ${item.time_end.slice(0, 5)}` : ''}`
    : 'Sin horario'

  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.coordinando

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.timeBlock}>
          <ClockIcon />
          <span>{timeLabel}</span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.statusBadge} ${styles[statusCfg.className]}`}>{statusCfg.label}</span>
          {item.videos_uploaded && <span className="badge badge-success">Videos subidos</span>}
          {isAdmin && (
            <>
              <button className={styles.iconBtn} onClick={onEditAdmin} title="Editar"><EditIcon /></button>
              <button className={styles.iconBtn} onClick={onDelete} title="Eliminar"><TrashIcon /></button>
            </>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className={styles.statusRow}>
          <button className={`${styles.statusBtn} ${styles.statusBtnGreen} ${item.status === 'coordinado' ? styles.statusBtnActive : ''}`} onClick={() => onSetStatus('coordinado')}>Coordinado</button>
          <button className={`${styles.statusBtn} ${styles.statusBtnYellow} ${item.status === 'coordinando' ? styles.statusBtnActive : ''}`} onClick={() => onSetStatus('coordinando')}>Coordinando</button>
          <button className={`${styles.statusBtn} ${styles.statusBtnRed} ${item.status === 'reagendado' ? styles.statusBtnActive : ''}`} onClick={() => onSetStatus('reagendado')}>Re agendado</button>
        </div>
      )}

      <div className={styles.cardBody}>
        <div className={styles.fieldsGrid}>
          <Field label="Cliente" value={item.client_name} />
          <Field label="Modelo" value={item.model_name} />
          <Field label="Teléfono modelo" value={item.model_phone} />
          <Field label="Videógrafo(s)" value={
            (item.assignees || []).map(a => a.username || a.display_name || a.full_name).join(', ') || '—'
          } />
        </div>

        {item.admin_notes && (
          <div className={styles.notesBlock}>
            <span className={styles.notesLabel}>Observaciones del admin</span>
            <p className={styles.notesText}>{item.admin_notes}</p>
          </div>
        )}

        <div className={styles.divider} />

        <div className={styles.userNotesBlock}>
          <div className={styles.userNotesHeader}>
            <span className={styles.notesLabel}>Observaciones del videógrafo</span>
            {canEditNotes && (
              <button className={styles.editNotesBtn} onClick={onEditNotes}>
                {item.user_notes ? 'Editar' : '+ Añadir'}
              </button>
            )}
          </div>
          {item.user_notes ? (
            <p className={styles.notesText}>{item.user_notes}</p>
          ) : (
            <p className={styles.notesEmpty}>Sin observaciones todavía</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value || '—'}</span>
    </div>
  )
}

function RecordingFormModal({ allProfiles, initial, onClose, onSave }) {
  const [timeStart, setTimeStart] = useState(initial?.time_start?.slice(0, 5) || '')
  const [timeEnd, setTimeEnd] = useState(initial?.time_end?.slice(0, 5) || '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to || [])
  const [clientName, setClientName] = useState(initial?.client_name || '')
  const [modelName, setModelName] = useState(initial?.model_name || '')
  const [modelPhone, setModelPhone] = useState(initial?.model_phone || '')
  const [adminNotes, setAdminNotes] = useState(initial?.admin_notes || '')
  const [saving, setSaving] = useState(false)

  function toggleAssignee(id) {
    setAssignedTo(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await onSave({
        time_start: timeStart || null,
        time_end: timeEnd || null,
        assigned_to: assignedTo,
        client_name: clientName.trim() || null,
        model_name: modelName.trim() || null,
        model_phone: modelPhone.trim() || null,
        admin_notes: adminNotes.trim() || null,
      })
      if (error) alert('No se pudo guardar: ' + (error.message || 'error desconocido'))
    } catch (err) {
      alert('No se pudo guardar: ' + (err?.message || 'error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{initial ? 'Editar grabación' : 'Nueva grabación'}</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        <div className={styles.modalForm}>
          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Hora inicio</label>
              <input className={styles.input} type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>Hora fin</label>
              <input className={styles.input} type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={styles.label}>Videógrafo(s) asignado(s)</label>
            <div className={styles.assigneeList}>
              {allProfiles.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.assigneeChip} ${assignedTo.includes(p.id) ? styles.assigneeChipActive : ''}`}
                  onClick={() => toggleAssignee(p.id)}
                >
                  {p.username || p.display_name || p.full_name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={styles.label}>Cliente</label>
            <input className={styles.input} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre del cliente" />
          </div>

          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Modelo</label>
              <input className={styles.input} value={modelName} onChange={e => setModelName(e.target.value)} placeholder="Nombre de la modelo" />
            </div>
            <div>
              <label className={styles.label}>Teléfono modelo</label>
              <input className={styles.input} value={modelPhone} onChange={e => setModelPhone(e.target.value)} placeholder="09xxxxxxxx" />
            </div>
          </div>

          <div>
            <label className={styles.label}>Observaciones</label>
            <textarea className={styles.textarea} rows={3} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Detalles adicionales para el videógrafo" />
          </div>

          <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 4 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NotesModal({ item, onClose, onSave }) {
  const [userNotes, setUserNotes] = useState(item?.user_notes || '')
  const [videosUploaded, setVideosUploaded] = useState(item?.videos_uploaded || false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ user_notes: userNotes.trim() || null, videos_uploaded: videosUploaded })
    } catch (err) {
      alert('No se pudo guardar: ' + (err?.message || 'error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Mis observaciones</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        <div className={styles.modalForm}>
          <div>
            <label className={styles.label}>Observaciones</label>
            <textarea
              className={styles.textarea}
              rows={4}
              value={userNotes}
              onChange={e => setUserNotes(e.target.value)}
              placeholder="Escribe aquí tus observaciones sobre la grabación..."
              autoFocus
            />
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={videosUploaded}
              onChange={e => setVideosUploaded(e.target.checked)}
            />
            <span>Videos subidos</span>
          </label>

          <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 4 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function WeekCalendar({ weekDays, items, materialItems, loading, colorForVideographer, onSelectItem }) {
  const HOUR_START = 7
  const HOUR_END = 21
  const HOUR_HEIGHT = 52
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i)

  function colorFor(assignedIds) {
    const id = (assignedIds || [])[0]
    if (!id) return '#6d28d9'
    return colorForVideographer(id)
  }

  function minutesFromStart(timeStr) {
    if (!timeStr) return HOUR_START * 60
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
  }

  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calendarGrid} style={{ gridTemplateColumns: `56px repeat(${weekDays.length}, 1fr)` }}>
        <div className={styles.calendarCorner} />
        {weekDays.map((day, i) => (
          <div key={i} className={styles.calendarDayHeader}>
            <span>{format(day, 'EEE', { locale: es })}</span>
            <span className={styles.calendarDayHeaderDate}>{format(day, 'd MMM', { locale: es })}</span>
          </div>
        ))}

        <div className={styles.calendarHoursCol}>
          {hours.map(h => (
            <div key={h} className={styles.calendarHourLabel} style={{ height: HOUR_HEIGHT }}>{h}:00</div>
          ))}
        </div>

        {weekDays.map((day, dayIdx) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const dayRecordings = items.filter(it => it.date === dateStr).map(it => ({ ...it, _kind: 'recording' }))
          const dayMaterial = (materialItems || []).filter(it => it.date === dateStr).map(it => ({ ...it, _kind: 'material' }))
          const dayItems = [...dayRecordings, ...dayMaterial]
          return (
            <div key={dayIdx} className={styles.calendarDayCol} style={{ height: HOUR_HEIGHT * hours.length }}>
              {hours.map(h => <div key={h} className={styles.calendarHourLine} style={{ height: HOUR_HEIGHT }} />)}
              {dayItems.map(item => {
                const startMin = minutesFromStart(item.time_start)
                const endMin = item.time_end ? minutesFromStart(item.time_end) : startMin + 45
                const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT
                const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22)
                const assignedIds = item._kind === 'material' ? item.videographer_ids : item.assigned_to
                const color = colorFor(assignedIds)
                const label = item._kind === 'material' ? `📦 ${item.client_name || 'Sin cliente'}` : (item.client_name || 'Sin cliente')
                return (
                  <button
                    key={`${item._kind}-${item.id}`}
                    className={styles.calendarEvent}
                    style={{ top, height, background: color, borderColor: color }}
                    onClick={() => onSelectItem(item)}
                    title={`${label} · ${item.time_start ? item.time_start.slice(0, 5) : 'Sin hora'}`}
                  >
                    <span className={styles.calendarEventTitle}>{label}</span>
                    {item.time_start && <span className={styles.calendarEventTime}>{item.time_start.slice(0, 5)}</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      {loading && <p className={styles.loading}>Cargando semana...</p>}
    </div>
  )
}

function AddViewModal({ allProfiles, existingIds, onClose, onSave }) {
  const [videographerId, setVideographerId] = useState('')
  const [saving, setSaving] = useState(false)
  const available = allProfiles.filter(p => !existingIds.includes(p.id))

  async function handleSave() {
    if (!videographerId) return
    const person = allProfiles.find(p => p.id === videographerId)
    const label = person?.username || person?.display_name || person?.full_name || 'Vista'
    setSaving(true)
    try {
      const { error } = await onSave(videographerId, label)
      if (error) alert('No se pudo crear la vista: ' + (error.message || 'error desconocido'))
    } catch (err) {
      alert('No se pudo crear la vista: ' + (err?.message || 'error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Añadir vista</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalForm}>
          <div>
            <label className={styles.label}>Videógrafo</label>
            <div className={styles.assigneeList}>
              {available.length === 0 && <p className={styles.notesEmpty}>Todos los videógrafos ya tienen una vista</p>}
              {available.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.assigneeChip} ${videographerId === p.id ? styles.assigneeChipActive : ''}`}
                  onClick={() => setVideographerId(p.id)}
                >
                  {p.username || p.display_name || p.full_name}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 4 }} onClick={handleSave} disabled={saving || !videographerId}>
            {saving ? 'Creando...' : 'Crear vista'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ColorsModal({ allProfiles, colorForVideographer, onSetColor, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Colores de videógrafos</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalForm}>
          <p className={styles.notesEmpty} style={{ margin: 0 }}>Se guarda automáticamente al elegir un color.</p>
          {allProfiles.map(p => {
            const current = colorForVideographer(p.id)
            const name = p.username || p.display_name || p.full_name
            return (
              <div key={p.id} className={styles.colorRow}>
                <span className={styles.colorRowName}>{name}</span>
                <div className={styles.colorList}>
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`${styles.colorSwatch} ${current === c ? styles.colorSwatchActive : ''}`}
                      style={{ background: c }}
                      onClick={() => onSetColor(p.id, c)}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MaterialCard({ item, allProfiles, isAdmin, canEditStatus, onSetStatus, onDelete }) {
  const videographerNames = (item.videographer_ids || [])
    .map(id => allProfiles.find(p => p.id === id))
    .filter(Boolean)
    .map(p => p.username || p.display_name || p.full_name)
    .join(', ') || '—'
  return (
    <div className={styles.materialCard}>
      <div className={styles.materialCardHeader}>
        <div className={styles.materialCardClient}>{item.client_name}</div>
        {item.time_start && <span className={styles.materialCardTime}>{item.time_start.slice(0, 5)}</span>}
      </div>
      <div className={styles.materialCardVideographers}>{videographerNames}</div>
      <div className={styles.materialCardFooter}>
        <div className={styles.materialToggle}>
          <button
            className={`${styles.materialBtn} ${styles.materialBtnOn} ${item.status === 'subido' ? styles.materialBtnActive : ''}`}
            disabled={!canEditStatus}
            onClick={() => onSetStatus('subido')}
          >
            Subido
          </button>
          <button
            className={`${styles.materialBtn} ${styles.materialBtnOff} ${item.status === 'no_subido' ? styles.materialBtnActive : ''}`}
            disabled={!canEditStatus}
            onClick={() => onSetStatus('no_subido')}
          >
            No subido
          </button>
        </div>
        {isAdmin && (
          <button className={styles.materialDeleteBtn} title="Eliminar" onClick={onDelete}><TrashIcon /></button>
        )}
      </div>
    </div>
  )
}

function MaterialFormModal({ allProfiles, defaultDate, onClose, onSave }) {
  const [clientName, setClientName] = useState('')
  const [videographerIds, setVideographerIds] = useState([])
  const [date, setDate] = useState(defaultDate || '')
  const [timeStart, setTimeStart] = useState('')
  const [saving, setSaving] = useState(false)

  function toggleVideographer(id) {
    setVideographerIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!clientName.trim()) { alert('Ingresa el nombre del cliente'); return }
    if (!date) { alert('Selecciona una fecha'); return }
    setSaving(true)
    try {
      const { error } = await onSave({ client_name: clientName, videographer_ids: videographerIds, date, time_start: timeStart || null })
      if (error) alert('No se pudo guardar: ' + (error.message || 'error desconocido'))
    } catch (err) {
      alert('No se pudo guardar: ' + (err?.message || 'error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Subida de Material</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalForm}>
          <div>
            <label className={styles.label}>Cliente</label>
            <input className={styles.input} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre del cliente" autoFocus />
          </div>
          <div className={styles.formRow}>
            <div style={{ flex: 1 }}>
              <label className={styles.label}>Fecha</label>
              <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className={styles.label}>Hora (opcional)</label>
              <input type="time" className={styles.input} value={timeStart} onChange={e => setTimeStart(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={styles.label}>Videógrafo(s)</label>
            <div className={styles.assigneeList}>
              {allProfiles.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.assigneeChip} ${videographerIds.includes(p.id) ? styles.assigneeChipActive : ''}`}
                  onClick={() => toggleVideographer(p.id)}
                >
                  {p.username || p.display_name || p.full_name}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 4 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Crear tarjeta'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlusIcon()      { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> }
function PaletteIcon()   { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="7" cy="8" r="1.2" fill="currentColor"/><circle cx="10.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="13.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8" cy="12.5" r="1.2" fill="currentColor"/></svg> }
function ChevronLeft()   { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevronRight()  { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ClockIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 5.5V10l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function EditIcon()      { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 2.5l4 4L7 17l-5 1 1-5L13.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> }
function TrashIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> }
