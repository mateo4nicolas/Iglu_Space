import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTaskChat } from '../../hooks/useTaskChat'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './TaskModal.module.css'
import { cycleLabelLower } from '../../utils/cycleLabel'

const PERIOD_LABELS = { '1_31': '1 al 31', '15_14': '15 al 14' }

export default function TaskModal({ task, columns, onClose, onUpdate, onApprove, onDelete }) {
  const { profile, isAdmin } = useAuth()
  const { messages, loading: chatLoading, sendMessage, sendFile, sendFiles, editMessage, deleteMessage } = useTaskChat(task?.id)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [profiles, setProfiles] = useState([])
  const [clients, setClients] = useState([])
  const [matrizCols, setMatrizCols] = useState([])
  const [newLink, setNewLink] = useState('')
  const chatEndRef = useRef(null)
  const chatTextareaRef = useRef(null)
  const [lightbox, setLightbox] = useState(null) // { type: 'image'|'video', url, name }
  const [uploadQueue, setUploadQueue] = useState([]) // [{ id, name, status: 'uploading'|'done'|'error' }]
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)
  const [openMsgMenu, setOpenMsgMenu] = useState(null)
  const [editingMsgId, setEditingMsgId] = useState(null)
  const [editingMsgText, setEditingMsgText] = useState('')
  const [msgActionBusy, setMsgActionBusy] = useState(false)

  // Transfer state
  const [allDepts, setAllDepts] = useState([])
  const [transferStep, setTransferStep] = useState(null) // null | 'dept' | 'user' | 'column'
  const [transferDeptId, setTransferDeptId] = useState('')
  const [transferUserId, setTransferUserId] = useState('')
  const [transferUserRole, setTransferUserRole] = useState(null) // 'admin' | 'user' | null
  const [transferColumnId, setTransferColumnId] = useState('')
  const [transferDeptUsers, setTransferDeptUsers] = useState([])
  const [transferDeptColumns, setTransferDeptColumns] = useState([])
  const [allTransferColumns, setAllTransferColumns] = useState([])
  const [transferring, setTransferring] = useState(false)

  // Admin: configure which depts are allowed
  const [allowedDepts, setAllowedDepts] = useState(task?.transfer_to_dept_ids || [])
  const [allowTransfer, setAllowTransfer] = useState(task?.allow_transfer || false)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (openMsgMenu === null) return
    function handleClickOutside(e) {
      if (!e.target.closest(`.${styles.msgActions}`)) setOpenMsgMenu(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMsgMenu])

  useEffect(() => {
    const el = chatTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [message])

  useEffect(() => {
    if (!task) return
    setEditData({
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'normal',
      assigned_to: task.assigned_to,
      column_id: task.column_id,
      links: task.links || [],
      cliente_id: task.cliente_id || '',
      periodo: task.periodo || '',
      columna_matriz: task.columna_matriz || '',
      mes_tarea: task.mes_tarea || '',
    })
    setAllowTransfer(task.allow_transfer || false)
    setAllowedDepts(task.transfer_to_dept_ids || [])
    supabase.from('profiles').select('id, full_name, display_name, username').then(({ data }) => setProfiles(data || []))
    supabase.from('clients').select('id, brand_name, billing_period').eq('is_active', true).order('brand_name').then(({ data }) => setClients(data || []))
    supabase.from('columnas_matriz').select('*').eq('is_active', true).order('position').then(({ data }) => setMatrizCols(data || []))
    supabase.from('departments').select('id, name, color').order('name').then(({ data }) => {
      setAllDepts((data || []).filter(d => d.id !== task.department_id))
    })
  }, [task])

  // When transfer dept selected → load users + columns
  useEffect(() => {
    if (!transferDeptId) return
    Promise.all([
      supabase.from('profile_departments')
        .select('user_id, member_role, profiles(id, full_name, display_name, username, role)')
        .eq('department_id', transferDeptId),
      supabase.from('kanban_columns').select('*').eq('department_id', transferDeptId).order('position'),
    ]).then(([{ data: members }, { data: cols }]) => {
      // Attach member_role to each profile
      const users = (members || []).map(m => ({
        ...(m.profiles || {}),
        member_role: m.member_role,
      })).filter(u => u.id)
      setTransferDeptUsers(users)
      setAllTransferColumns(cols || [])
      setTransferDeptColumns(cols || []) // show all initially
      setTransferUserId('')
      setTransferUserRole(null)
      setTransferColumnId('')
    })
  }, [transferDeptId])

  // When user is selected → filter columns by their role
  useEffect(() => {
    if (!transferUserId) {
      setTransferDeptColumns(allTransferColumns)
      return
    }
    const selectedUser = transferDeptUsers.find(u => u.id === transferUserId)
    const role = selectedUser?.role || selectedUser?.member_role || 'user'
    setTransferUserRole(role)
    // owner_role='admin' → admin columns; owner_role='user' → user columns
    if (role === 'admin') {
      const filtered = allTransferColumns.filter(c => c.owner_role === 'admin' || (!c.owner_role && c.auto_assign_to !== 'user'))
      setTransferDeptColumns(filtered.length > 0 ? filtered : allTransferColumns)
    } else {
      const filtered = allTransferColumns.filter(c => c.owner_role === 'user')
      setTransferDeptColumns(filtered.length > 0 ? filtered : allTransferColumns)
    }
    setTransferColumnId('')
  }, [transferUserId, allTransferColumns, transferDeptUsers])

  if (!task) return null

  async function handleSend(e) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    await sendMessage(message)
    setMessage('')
    setSending(false)
  }

  function toggleMsgMenu(id) {
    setOpenMsgMenu(prev => (prev === id ? null : id))
  }

  function startEditMessage(msg) {
    setEditingMsgId(msg.id)
    setEditingMsgText(msg.content || '')
    setOpenMsgMenu(null)
  }

  function cancelEditMessage() {
    setEditingMsgId(null)
    setEditingMsgText('')
  }

  async function saveEditMessage(id) {
    const text = editingMsgText.trim()
    if (!text || msgActionBusy) return
    setMsgActionBusy(true)
    const { error } = await editMessage(id, text)
    setMsgActionBusy(false)
    if (error) {
      alert('Error al editar el mensaje: ' + error.message)
      return
    }
    setEditingMsgId(null)
    setEditingMsgText('')
  }

  async function handleDeleteMessage(id) {
    setOpenMsgMenu(null)
    if (!window.confirm('¿Eliminar este mensaje? Esta acción no se puede deshacer.')) return
    setMsgActionBusy(true)
    const { error } = await deleteMessage(id)
    setMsgActionBusy(false)
    if (error) alert('Error al eliminar el mensaje: ' + error.message)
  }

  const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

  async function processFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (files.length === 0) return

    const tooBig = files.filter(f => f.size > MAX_FILE_SIZE)
    const valid = files.filter(f => f.size <= MAX_FILE_SIZE)

    const oversizedItems = tooBig.map(f => ({
      id: `${f.name}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      status: 'error',
      message: 'Supera 500MB',
    }))
    if (oversizedItems.length > 0) {
      setUploadQueue(prev => [...prev, ...oversizedItems])
      oversizedItems.forEach(item => {
        setTimeout(() => setUploadQueue(prev => prev.filter(q => q.id !== item.id)), 5000)
      })
    }
    if (valid.length === 0) return

    setSending(true)
    const queueItems = valid.map(f => ({
      id: `${f.name}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      status: 'uploading',
    }))
    setUploadQueue(prev => [...prev, ...queueItems])

    await sendFiles(valid, (file, status, error) => {
      const idx = valid.indexOf(file)
      const qId = queueItems[idx]?.id
      if (!qId) return
      setUploadQueue(prev => prev.map(q => (q.id === qId ? { ...q, status, message: error?.message } : q)))
      setTimeout(() => {
        setUploadQueue(prev => prev.filter(q => q.id !== qId))
      }, status === 'error' ? 5000 : 1200)
    })

    setSending(false)
  }

  function handleFile(e) {
    const files = e.target.files
    e.target.value = ''
    processFiles(files)
  }

  function handleDragEnter(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types?.includes('Files')) setDragActive(true)
  }
  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
  }
  function handleDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragActive(false)
  }
  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    processFiles(e.dataTransfer.files)
  }

  function addLink() {
    if (!newLink.trim()) return
    const url = newLink.startsWith('http') ? newLink : 'https://' + newLink
    setEditData(p => ({ ...p, links: [...(p.links || []), url] }))
    setNewLink('')
  }

  function removeLink(i) {
    setEditData(p => ({ ...p, links: p.links.filter((_, idx) => idx !== i) }))
  }

  function handleClientChange(id) {
    const c = clients.find(cl => cl.id === id)
    setEditData(p => ({ ...p, cliente_id: id || null, periodo: c ? c.billing_period : '' }))
  }

  function toggleAllowedDept(id) {
    setAllowedDepts(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  async function saveEdit() {
    await onUpdate(task.id, {
      ...editData,
      allow_transfer: allowTransfer,
      transfer_to_dept_ids: allowTransfer ? allowedDepts : [],
    })
    setEditing(false)
  }

  async function executeTransfer() {
    if (!transferDeptId || !transferColumnId) return
    setTransferring(true)
    const { error } = await supabase.rpc('transfer_task', {
      p_task_id:   task.id,
      p_dept_id:   transferDeptId,
      p_column_id: transferColumnId,
      p_user_id:   transferUserId || null,
    })
    setTransferring(false)
    if (error) {
      console.error('Transfer error:', error)
      alert('Error al transferir: ' + error.message)
    } else {
      onClose()
    }
  }

  const priorityConfig = {
    low:    { label: 'Baja',    cls: 'badge-user' },
    normal: { label: 'Normal',  cls: 'badge-info' },
    high:   { label: 'Alta',    cls: 'badge-warning' },
    urgent: { label: 'Urgente', cls: 'badge-danger' },
  }
  const isPending = task.approved === null

  // Allowed depts for transfer (from task config)
  const allowedDeptObjects = allDepts.filter(d => (task.transfer_to_dept_ids || []).includes(d.id))
  // Admin sees all depts if no restriction; user sees only allowed
  const visibleTransferDepts = isAdmin
    ? (allowedDeptObjects.length > 0 ? allowedDeptObjects : allDepts)
    : allowedDeptObjects

  // Users can transfer if admin enabled it (allow_transfer=true) and there are target depts configured
  // If no specific depts set, show all depts the user can access (via their profile_departments)
  const [userAccessibleDepts, setUserAccessibleDepts] = useState([])

  useEffect(() => {
    if (!isAdmin && task.allow_transfer) {
      // If admin set specific allowed depts, use those; otherwise fetch ALL depts
      if (allowedDeptObjects.length > 0) {
        setUserAccessibleDepts(allowedDeptObjects)
      } else {
        supabase.from('departments')
          .select('id, name, color')
          .order('name')
          .then(({ data }) => {
            setUserAccessibleDepts((data || []).filter(d => d.id !== task.department_id))
          })
      }
    }
  }, [task.id, task.allow_transfer, isAdmin, task.department_id])

  const effectiveTransferDepts = isAdmin
    ? visibleTransferDepts
    : userAccessibleDepts

  const showTransferSection = task.allow_transfer && (isAdmin || effectiveTransferDepts.length > 0)

  function nameFor(p) { return p?.username || p?.display_name || p?.full_name || '' }

  return (
    <>
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {task.kanban_columns && (
              <span className={styles.colPill} style={{ background: task.kanban_columns.color + '18', color: task.kanban_columns.color }}>
                {task.kanban_columns.title}
              </span>
            )}
            {task.is_finished && <span className="badge badge-danger">Finalizado</span>}
            {isPending && isAdmin && !task.is_finished && <span className="badge badge-warning">Pendiente aprobación</span>}
            {task.allow_transfer && (
              <span className="badge badge-info" style={{ fontSize: 10 }}>🔀 Transferible</span>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.left}>
            {editing ? (
              <input className={styles.titleInput} value={editData.title} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} />
            ) : (
              <h2 className={styles.title}>{task.title}</h2>
            )}

            <div className={styles.section}>
              <p className={styles.sLabel}>Descripción</p>
              {editing ? (
                <textarea className={styles.textarea} value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Descripción del trabajo..." />
              ) : (
                <p className={styles.desc}>{task.description || <span className={styles.muted}>Sin descripción</span>}</p>
              )}
            </div>

            <div className={styles.section}>
              <p className={styles.sLabel}>Links de referencia</p>
              {(editing ? editData.links : task.links || []).map((link, i) => (
                <div key={i} className={styles.linkRow}>
                  <a href={link} target="_blank" rel="noopener noreferrer" className={styles.link}>{link}</a>
                  {editing && <button className={styles.removeLinkBtn} onClick={() => removeLink(i)}>✕</button>}
                </div>
              ))}
              {editing && (
                <div className={styles.addLinkRow}>
                  <input className={styles.linkInput} placeholder="https://..." value={newLink} onChange={e => setNewLink(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLink())} />
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={addLink}>+ Añadir</button>
                </div>
              )}
              {!editing && (task.links || []).length === 0 && <span className={styles.muted}>Sin links</span>}
            </div>

            {isAdmin && isPending && (
              <div className={styles.approvalBanner}>
                <p>Esta tarea requiere aprobación.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => onApprove(task.id, true)}>Aprobar</button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => onApprove(task.id, false)}>Rechazar</button>
                </div>
              </div>
            )}

            <div
              className={styles.chatSection}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {dragActive && (
                <div className={styles.dropOverlay}>
                  <AttachIcon />
                  <span>Suelta tus fotos o videos aquí</span>
                </div>
              )}
              <p className={styles.sLabel}>Chat del cliente</p>
              <div className={styles.chatMessages}>
                {chatLoading ? <p className={styles.chatEmpty}>Cargando...</p>
                  : messages.length === 0 ? <p className={styles.chatEmpty}>Sin mensajes aún.</p>
                  : messages.map(msg => {
                    if (msg.message_type === 'system') {
                      return (
                        <div key={msg.id} className={styles.msgSystem}>
                          <span>{msg.content}</span>
                          <span className={styles.msgSystemTime}>
                            {format(new Date(msg.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                          </span>
                        </div>
                      )
                    }
                    const isMe = msg.user_id === profile?.id
                    const canModerate = isMe || isAdmin
                    const canEdit = isMe && !!msg.content
                    const name = msg.profiles?.display_name || msg.profiles?.full_name || '?'
                    const isEditingThis = editingMsgId === msg.id
                    return (
                      <div key={msg.id} className={`${styles.msg} ${isMe ? styles.msgMe : styles.msgThem}`}>
                        {!isMe && <div className={styles.msgAvatar}>{name[0].toUpperCase()}</div>}
                        <div className={styles.msgBubble}>
                          {!isMe && <span className={styles.msgName}>{name}</span>}
                          {canModerate && !isEditingThis && (
                            <div className={styles.msgActions}>
                              <button
                                type="button"
                                className={styles.msgMenuBtn}
                                onClick={() => toggleMsgMenu(msg.id)}
                                title="Opciones del mensaje"
                                aria-label="Opciones del mensaje"
                              >
                                <DotsIcon />
                              </button>
                              {openMsgMenu === msg.id && (
                                <div className={styles.msgMenu}>
                                  {canEdit && (
                                    <button type="button" onClick={() => startEditMessage(msg)}>
                                      <EditIcon /> Editar
                                    </button>
                                  )}
                                  <button type="button" className={styles.msgMenuDanger} onClick={() => handleDeleteMessage(msg.id)}>
                                    <TrashIcon /> Eliminar
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          {isEditingThis ? (
                            <div className={styles.msgEditBox}>
                              <textarea
                                className={styles.msgEditInput}
                                value={editingMsgText}
                                onChange={e => setEditingMsgText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditMessage(msg.id) }
                                  if (e.key === 'Escape') cancelEditMessage()
                                }}
                                rows={2}
                                autoFocus
                              />
                              <div className={styles.msgEditActions}>
                                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 9px' }} onClick={cancelEditMessage}>Cancelar</button>
                                <button type="button" className="btn btn-primary" style={{ fontSize: 11, padding: '3px 9px' }} disabled={!editingMsgText.trim() || msgActionBusy} onClick={() => saveEditMessage(msg.id)}>Guardar</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {msg.content && <p className={styles.msgText}>{msg.content}</p>}
                              {msg.attachment_type === 'image' && (
                                <button
                                  type="button"
                                  className={styles.msgMediaBtn}
                                  onClick={() => setLightbox({ type: 'image', url: msg.attachment_url, name: msg.attachment_name })}
                                >
                                  <img src={msg.attachment_url} alt={msg.attachment_name} className={styles.msgImg} />
                                </button>
                              )}
                              {msg.attachment_type === 'video' && (
                                <button
                                  type="button"
                                  className={`${styles.msgMediaBtn} ${styles.msgVideoBtn}`}
                                  onClick={() => setLightbox({ type: 'video', url: msg.attachment_url, name: msg.attachment_name })}
                                >
                                  <video src={msg.attachment_url} className={styles.msgVideo} muted playsInline preload="metadata" />
                                  <span className={styles.playOverlay}><PlayIcon /></span>
                                </button>
                              )}
                              <span className={styles.msgTime}>
                                {format(new Date(msg.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                                {msg.edited_at && <span className={styles.msgEdited}> · (Editado)</span>}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                <div ref={chatEndRef} />
              </div>
              {uploadQueue.length > 0 && (
                <div className={styles.uploadQueue}>
                  {uploadQueue.map(q => (
                    <div key={q.id} className={`${styles.uploadItem} ${q.status === 'error' ? styles.uploadItemError : ''}`}>
                      {q.status === 'uploading' && <span className={styles.uploadSpinner} />}
                      {q.status === 'done' && <span className={styles.uploadCheck}>✓</span>}
                      {q.status === 'error' && <span className={styles.uploadCross}>✕</span>}
                      <span className={styles.uploadName}>{q.name}</span>
                      {q.message && <span className={styles.uploadMsg}>{q.message}</span>}
                    </div>
                  ))}
                </div>
              )}
              <form className={styles.chatForm} onSubmit={handleSend}>
                <input type="file" ref={fileInputRef} accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleFile} />
                <button type="button" className={styles.attachBtn} onClick={() => fileInputRef.current?.click()} disabled={sending} title="Adjuntar">
                  <AttachIcon />
                </button>
                <textarea
                  ref={chatTextareaRef}
                  className={styles.chatInput}
                  placeholder="Escribe un mensaje..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend(e)
                    }
                  }}
                  disabled={sending}
                  rows={1}
                />
                <button type="submit" className={styles.sendBtn} disabled={!message.trim() || sending}><SendIcon /></button>
              </form>
            </div>
          </div>

          {/* Right panel */}
          <div className={styles.right}>
            <p className={styles.sLabel}>Detalles</p>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Estado</span>
              {editing ? (
                <select className={styles.select} value={editData.column_id} onChange={e => setEditData(p => ({ ...p, column_id: e.target.value }))}>
                  {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              ) : <span style={{ color: task.kanban_columns?.color, fontSize: 13, fontWeight: 500 }}>{task.kanban_columns?.title || '—'}</span>}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Prioridad</span>
              {editing ? (
                <select className={styles.select} value={editData.priority} onChange={e => setEditData(p => ({ ...p, priority: e.target.value }))}>
                  <option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
                </select>
              ) : <span className={`badge ${priorityConfig[task.priority]?.cls}`}>{priorityConfig[task.priority]?.label}</span>}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Asignado a</span>
              {editing && isAdmin ? (
                <select className={styles.select} value={editData.assigned_to || ''} onChange={e => setEditData(p => ({ ...p, assigned_to: e.target.value || null }))}>
                  <option value="">Sin asignar</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{nameFor(p)}</option>)}
                </select>
              ) : <span className={styles.metaVal}>{nameFor(task.profiles) || <span className={styles.muted}>Sin asignar</span>}</span>}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Cliente</span>
              {editing ? (
                <select className={styles.select} value={editData.cliente_id || ''} onChange={e => handleClientChange(e.target.value)}>
                  <option value="">Sin cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.brand_name}</option>)}
                </select>
              ) : <span className={styles.metaVal}>{task.clients?.brand_name || <span className={styles.muted}>Sin cliente</span>}</span>}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Periodo</span>
              {(() => {
                const periodo = editing ? editData.periodo : task.periodo
                return periodo
                  ? <span className="badge badge-info" style={{ fontSize: 11 }}>{PERIOD_LABELS[periodo] || periodo}</span>
                  : <span className={styles.muted}>—</span>
              })()}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Mes</span>
              {editing ? (
                <input
                  type="month"
                  className={styles.select}
                  value={editData.mes_tarea || ''}
                  onChange={e => setEditData(p => ({ ...p, mes_tarea: e.target.value }))}
                />
              ) : (
                <span className={styles.metaVal} style={{ textTransform: 'capitalize' }}>
                  {cycleLabelLower(task.mes_tarea, task.periodo) || <span className={styles.muted}>—</span>}
                </span>
              )}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Entregable Matriz</span>
              {editing ? (
                <select className={styles.select} value={editData.columna_matriz || ''} onChange={e => setEditData(p => ({ ...p, columna_matriz: e.target.value || null }))}>
                  <option value="">Sin asignar</option>
                  {matrizCols.map(o => <option key={o.id} value={o.value}>{o.label}</option>)}
                </select>
              ) : <span className={styles.metaVal}>{matrizCols.find(c => c.value === task.columna_matriz)?.label || task.columna_matriz || <span className={styles.muted}>Sin asignar</span>}</span>}
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Creado</span>
              <span className={styles.metaVal}>{format(new Date(task.created_at), 'd MMM yyyy', { locale: es })}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Aprobación</span>
              <span className={`badge ${task.approved === true ? 'badge-success' : task.approved === false ? 'badge-danger' : 'badge-warning'}`}>
                {task.approved === true ? 'Aprobada' : task.approved === false ? 'Rechazada' : 'Pendiente'}
              </span>
            </div>

            <div className={styles.metaItem} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <span className={styles.metaLabel}>Finalizado</span>
              <button
                onClick={async () => {
                  await onUpdate(task.id, { is_finished: !task.is_finished })
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '7px 14px',
                  border: '1.5px solid',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: task.is_finished ? 'var(--danger-dim)' : 'var(--bg-hover)',
                  borderColor: task.is_finished ? 'var(--danger)' : 'var(--border)',
                  color: task.is_finished ? 'var(--danger)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{task.is_finished ? '✅' : '⬜'}</span>
                {task.is_finished ? 'Finalizado' : 'Marcar como finalizado'}
              </button>
            </div>

            {/* Edit / delete actions */}
            {(isAdmin || task.created_by === profile?.id) && (
              <div className={styles.editActions}>
                {editing ? (
                  <>
                    {/* Transfer toggle (admin only in edit mode) */}
                    {isAdmin && (
                      <div className={styles.transferConfig}>
                        <label className={styles.transferToggleRow}>
                          <input
                            type="checkbox"
                            checked={allowTransfer}
                            onChange={e => setAllowTransfer(e.target.checked)}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                          />
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                            Permitir transferencia
                          </span>
                        </label>
                        {allowTransfer && (
                          <div className={styles.deptPickerWrap}>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 4px' }}>
                              Departamentos destino permitidos (vacío = todos):
                            </p>
                            <div className={styles.miniDeptGrid}>
                              {allDepts.map(d => (
                                <button
                                  key={d.id}
                                  type="button"
                                  className={`${styles.miniDeptChip} ${allowedDepts.includes(d.id) ? styles.miniDeptSel : ''}`}
                                  style={allowedDepts.includes(d.id) ? { borderColor: d.color, background: d.color + '22', color: d.color } : {}}
                                  onClick={() => toggleAllowedDept(d.id)}
                                >
                                  <span className={styles.dDot} style={{ background: d.color }} />
                                  {d.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }} onClick={saveEdit}>
                      Guardar cambios
                    </button>
                    <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }} onClick={() => setEditing(false)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }} onClick={() => setEditing(true)}>
                    <EditIcon /> Editar tarea
                  </button>
                )}
                {isAdmin && onDelete && !editing && (
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'center', fontSize: 13, color: 'var(--danger)', borderColor: 'var(--danger)', marginTop: 6 }}
                    onClick={() => { if (window.confirm('¿Eliminar esta tarea?')) { onDelete(task.id); onClose() } }}
                  >
                    <TrashIcon /> Eliminar tarea
                  </button>
                )}
              </div>
            )}

            {/* Transfer section */}
            {showTransferSection && !editing && (
              <div className={styles.transferSection}>
                <div className={styles.transferHeader}>
                  <span className={styles.transferTitle}>🔀 Transferir tarea</span>
                </div>

                {transferStep === null && (
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', fontSize: 12, justifyContent: 'center' }}
                    onClick={() => setTransferStep('dept')}
                  >
                    Iniciar transferencia
                  </button>
                )}

                {transferStep === 'dept' && (
                  <div className={styles.cascadeStep}>
                    <p className={styles.cascadeLabel}>1. Selecciona departamento destino</p>
                    <div className={styles.cascadeOptions}>
                      {effectiveTransferDepts.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No hay departamentos disponibles</p>
                      ) : (
                        effectiveTransferDepts.map(d => (
                          <button
                            key={d.id}
                            className={`${styles.cascadeOpt} ${transferDeptId === d.id ? styles.cascadeOptSel : ''}`}
                            style={transferDeptId === d.id ? { borderColor: d.color, background: d.color + '18' } : {}}
                            onClick={() => { setTransferDeptId(d.id); setTransferStep('user') }}
                          >
                            <span className={styles.dDot} style={{ background: d.color }} />
                            {d.name}
                          </button>
                        ))
                      )}
                    </div>
                    <button className={styles.cascadeCancel} onClick={() => setTransferStep(null)}>Cancelar</button>
                  </div>
                )}

                {transferStep === 'user' && (
                  <div className={styles.cascadeStep}>
                    <p className={styles.cascadeLabel}>2. Selecciona responsable (opcional)</p>
                    <div className={styles.cascadeOptions}>
                      <button
                        className={`${styles.cascadeOpt} ${transferUserId === '' ? styles.cascadeOptSel : ''}`}
                        onClick={() => { setTransferUserId(''); setTransferUserRole(null); setTransferStep('column') }}
                      >
                        Sin asignar
                      </button>
                      {transferDeptUsers.map(u => (
                        <button
                          key={u.id}
                          className={`${styles.cascadeOpt} ${transferUserId === u.id ? styles.cascadeOptSel : ''}`}
                          onClick={() => { setTransferUserId(u.id); setTransferStep('column') }}
                        >
                          <span className={styles.userDot}>{nameFor(u)[0]?.toUpperCase()}</span>
                          {nameFor(u)}
                        </button>
                      ))}
                    </div>
                    <button className={styles.cascadeBack} onClick={() => setTransferStep('dept')}>← Atrás</button>
                  </div>
                )}

                {transferStep === 'column' && (
                  <div className={styles.cascadeStep}>
                    <p className={styles.cascadeLabel}>3. Selecciona columna destino</p>
                    <div className={styles.cascadeOptions}>
                      {transferDeptColumns.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin columnas en ese departamento</p>
                      ) : (
                        transferDeptColumns.map(c => (
                          <button
                            key={c.id}
                            className={`${styles.cascadeOpt} ${transferColumnId === c.id ? styles.cascadeOptSel : ''}`}
                            style={transferColumnId === c.id ? { borderColor: c.color, background: c.color + '18' } : {}}
                            onClick={() => setTransferColumnId(c.id)}
                          >
                            <span className={styles.dDot} style={{ background: c.color }} />
                            {c.title}
                          </button>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        className="btn btn-primary"
                        style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
                        disabled={!transferColumnId || transferring}
                        onClick={executeTransfer}
                      >
                        {transferring ? 'Transfiriendo...' : 'Confirmar transferencia'}
                      </button>
                      <button className={styles.cascadeCancel} onClick={() => { setTransferStep(null); setTransferDeptId(''); setTransferUserId(''); setTransferColumnId('') }}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {lightbox && (
      <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
        <button className={styles.lightboxClose} onClick={() => setLightbox(null)} aria-label="Cerrar"><CloseIcon /></button>
        <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
          {lightbox.type === 'image' ? (
            <img src={lightbox.url} alt={lightbox.name || ''} className={styles.lightboxImg} />
          ) : (
            <video src={lightbox.url} className={styles.lightboxVideo} controls autoPlay playsInline />
          )}
        </div>
      </div>
    )}
    </>
  )
}

function CloseIcon()  { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function SendIcon()   { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M3 10L17 3l-5 7 5 7-14-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> }
function AttachIcon() { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M16 10l-6 6a5 5 0 01-7-7l7-7a3 3 0 014 4L7 13a1 1 0 01-1-1l6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function TrashIcon()  { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function EditIcon()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> }
function DotsIcon()   { return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.2" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.8" cy="8" r="1.4"/></svg> }
function PlayIcon()   { return <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M6 4.5v11l9-5.5-9-5.5z"/></svg> }
