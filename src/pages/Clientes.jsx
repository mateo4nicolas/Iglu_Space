import { useState } from 'react'
import { useClients, BILLING_PERIODS } from '../hooks/useClients'
import { useAuth } from '../context/AuthContext'
import { RESUMEN_LINKS, FICHA_LINK_LABELS, FICHA_TEXT_FIELDS, FICHA_DATE_FIELD, FICHA_NUM_FIELDS, FICHA_INVERSION_FIELDS, fmtNumber } from '../utils/clientFicha'
import styles from './Clientes.module.css'

export default function ClientesPage() {
  const { isAdmin } = useAuth()
  const {
    activeClients,
    archivedClients,
    byPeriod,
    fichas,
    saveFicha,
    loading,
    createClient,
    updateClient,
    setActive,
    deleteClient,
  } = useClients()

  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [tab, setTab] = useState('clientes') // clientes | ficha
  const [period, setPeriod] = useState(BILLING_PERIODS[0].value)

  const visibleClients = showArchived && isAdmin ? archivedClients : activeClients
  const columns = byPeriod(visibleClients)

  async function handleCreate({ ficha, ...data }) {
    const { error, id } = await createClient(data)
    if (error) return { error }
    if (id) {
      const { error: fichaError } = await saveFicha(id, ficha)
      if (fichaError) return { error: fichaError }
    }
    setShowForm(false)
    return { error: null }
  }

  async function handleEditSave({ ficha, ...data }) {
    const { error } = await updateClient(editingClient.id, data)
    if (error) return { error }
    const { error: fichaError } = await saveFicha(editingClient.id, ficha)
    if (fichaError) return { error: fichaError }
    setEditingClient(null)
    return { error: null }
  }

  async function handleDelete(client) {
    if (!confirm(`¿Eliminar definitivamente a "${client.brand_name}"? Esta acción no se puede deshacer.`)) return
    await deleteClient(client.id)
  }

  if (loading) return <div className={styles.loading}>Cargando clientes...</div>

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.pageTitle}>Clientes</h1>
          <p className={styles.pageSubtitle}>Gestión de marcas de la agencia</p>
        </div>
        {isAdmin && tab === 'clientes' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`${styles.toggleBtn} ${showArchived ? styles.toggleBtnActive : ''}`}
              onClick={() => setShowArchived(a => !a)}
            >
              {showArchived ? 'Viendo archivados' : `Ver archivados (${archivedClients.length})`}
            </button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <PlusIcon /> Nuevo cliente
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'clientes' ? styles.tabActive : ''}`} onClick={() => setTab('clientes')}>Clientes</button>
          <button className={`${styles.tab} ${tab === 'ficha' ? styles.tabActive : ''}`} onClick={() => setTab('ficha')}>Ficha del cliente</button>
        </div>
      )}

      {isAdmin && tab === 'ficha' && (
        <div className={styles.periodSwitch}>
          {BILLING_PERIODS.map(p => (
            <button
              key={p.value}
              className={`${styles.periodSwitchBtn} ${period === p.value ? styles.periodSwitchBtnActive : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              Periodo {p.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'ficha' && isAdmin && (
        <FichaTable
          clients={activeClients.filter(c => c.billing_period === period)}
          fichas={fichas}
          onEdit={setEditingClient}
        />
      )}

      {(tab === 'clientes' || !isAdmin) && (visibleClients.length === 0 ? (
        <div className={styles.empty}>
          {showArchived ? 'No hay clientes archivados' : 'Aún no has añadido ningún cliente'}
        </div>
      ) : (
        <div className={styles.periodGrid}>
          {columns.map(({ period, clients }) => (
            <div key={period.value} className={styles.periodColumn}>
              <div className={styles.periodHeader}>
                <span className={styles.periodDot} />
                <span className={styles.periodTitle}>Periodo {period.label}</span>
                <span className={styles.periodCount}>{clients.length}</span>
              </div>
              {clients.length === 0 ? (
                <p className={styles.noClients}>Sin clientes en este periodo</p>
              ) : (
                <div className={styles.clientList}>
                  {clients.map(client => (
                    <ClientCard
                      key={client.id}
                      client={client}
                      archived={showArchived && isAdmin}
                      canEdit={isAdmin}
                      onEdit={() => setEditingClient(client)}
                      onArchive={() => setActive(client.id, false)}
                      onRestore={() => setActive(client.id, true)}
                      onDelete={() => handleDelete(client)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {isAdmin && showForm && (
        <ClientFormModal
          title="Nuevo cliente"
          onClose={() => setShowForm(false)}
          onSave={handleCreate}
        />
      )}

      {isAdmin && editingClient && (
        <ClientFormModal
          title="Editar cliente"
          client={editingClient}
          ficha={fichas[editingClient.id]}
          onClose={() => setEditingClient(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}

// ── Client Card ───────────────────────────────────────────────────────────────
function ClientCard({ client, archived, canEdit, onEdit, onArchive, onRestore, onDelete }) {
  return (
    <div className={`${styles.clientCard} ${archived ? styles.clientCardArchived : ''}`}>
      <div className={styles.clientAvatar}>{client.brand_name[0]?.toUpperCase()}</div>
      <div className={styles.clientInfo}>
        <span className={styles.clientName}>{client.brand_name}</span>
        <span className={`badge ${archived ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: 10 }}>
          {archived ? 'Archivado' : 'Activo'}
        </span>
      </div>
      {canEdit && <div className={styles.clientActions}>
        {!archived && (
          <button className={styles.iconBtn} onClick={onEdit} title="Editar"><EditIcon /></button>
        )}
        {archived ? (
          <button className={styles.iconBtn} onClick={onRestore} title="Reactivar"><RestoreIcon /></button>
        ) : (
          <button className={styles.iconBtn} onClick={onArchive} title="Archivar"><ArchiveIcon /></button>
        )}
        <button className={styles.iconBtn} style={{ color: 'var(--danger)' }} onClick={onDelete} title="Eliminar definitivamente">
          <TrashIcon />
        </button>
      </div>}
    </div>
  )
}

// ── Create / Edit Modal ─────────────────────────────────────────────────────────
function ClientFormModal({ title, client, ficha, onClose, onSave }) {
  const [brandName, setBrandName] = useState(client?.brand_name || '')
  const [billingPeriod, setBillingPeriod] = useState(client?.billing_period || BILLING_PERIODS[0].value)
  const [fichaData, setFichaData] = useState(() => {
    const init = {}
    FICHA_TEXT_FIELDS.forEach(({ key }) => { init[key] = ficha?.[key] ?? '' })
    FICHA_NUM_FIELDS.forEach(({ key }) => { init[key] = ficha?.[key] ?? '' })
    FICHA_INVERSION_FIELDS.forEach(({ key }) => { init[key] = ficha?.[key] ?? '' })
    init[FICHA_DATE_FIELD.key] = ficha?.[FICHA_DATE_FIELD.key] ?? ''
    RESUMEN_LINKS.forEach(({ key }) => { init[key] = ficha?.[key] ?? '' })
    return init
  })
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const setF = (key, v) => setFichaData(p => ({ ...p, [key]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!brandName.trim() || !billingPeriod) return
    setLoading(true)
    setErrorMsg('')
    const { error } = await onSave({ brand_name: brandName.trim(), billing_period: billingPeriod, ficha: fichaData })
    setLoading(false)
    if (error) setErrorMsg(error.message || 'No se pudo guardar el cliente')
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHeader}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.label}>Nombre de la marca *</label>
          <input
            className={styles.input}
            placeholder="Ej. Iglü Space"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            autoFocus
            required
          />

          <label className={styles.label}>Periodo de facturación *</label>
          <div className={styles.periodOptions}>
            {BILLING_PERIODS.map(p => (
              <button
                key={p.value}
                type="button"
                className={`${styles.periodOption} ${billingPeriod === p.value ? styles.periodOptionSel : ''}`}
                onClick={() => setBillingPeriod(p.value)}
              >
                {p.label}
                {billingPeriod === p.value && ' ✓'}
              </button>
            ))}
          </div>

          <p className={styles.sectionTitle}>Ficha del cliente</p>
          <div className={styles.fichaGrid}>
            {FICHA_TEXT_FIELDS.map(({ key, label }) => (
              <div key={key} className={styles.fichaField}>
                <label className={styles.label}>{label}</label>
                <input className={styles.input} value={fichaData[key]} onChange={e => setF(key, e.target.value)} />
              </div>
            ))}
            {FICHA_NUM_FIELDS.map(({ key, label }) => (
              <div key={key} className={styles.fichaField}>
                <label className={styles.label}>{label}</label>
                <input className={styles.input} type="number" min={0} value={fichaData[key]} onChange={e => setF(key, e.target.value)} />
              </div>
            ))}
            <div className={styles.fichaField}>
              <label className={styles.label}>{FICHA_DATE_FIELD.label}</label>
              <input className={styles.input} value={fichaData[FICHA_DATE_FIELD.key]} onChange={e => setF(FICHA_DATE_FIELD.key, e.target.value)} />
            </div>
          </div>

          <p className={styles.sectionTitle}>Inversión</p>
          <div className={styles.fichaGrid3}>
            {FICHA_INVERSION_FIELDS.map(({ key, label }) => (
              <div key={key} className={styles.fichaField}>
                <label className={styles.label}>{label}</label>
                <input className={styles.input} type="number" min={0} step="any" value={fichaData[key]} onChange={e => setF(key, e.target.value)} />
              </div>
            ))}
          </div>

          <p className={styles.sectionTitle}>Enlaces</p>
          <div className={styles.fichaGrid}>
            {RESUMEN_LINKS.map(({ key }) => (
              <div key={key} className={styles.fichaField}>
                <label className={styles.label}>{FICHA_LINK_LABELS[key]}</label>
                <input className={styles.input} placeholder="https://..." value={fichaData[key]} onChange={e => setF(key, e.target.value)} />
              </div>
            ))}
          </div>

          {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}

          <div className={styles.modalFooter}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !brandName.trim()}>
              {loading ? 'Guardando...' : client ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Ficha (solo admins) ───────────────────────────────────────────────────────
function LinkCell({ url }) {
  return url
    ? <a href={url} target="_blank" rel="noopener noreferrer" className={styles.openLink}>Abrir ↗</a>
    : <span className={styles.dash}>—</span>
}

function FichaTable({ clients, fichas, onEdit }) {
  if (clients.length === 0) return <div className={styles.empty}>Sin clientes en este periodo</div>
  const span = { rowSpan: 2 }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th {...span} className={`${styles.th} ${styles.stickyCol}`}>Cliente</th>
            {FICHA_TEXT_FIELDS.map(f => <th key={f.key} {...span} className={styles.th}>{f.label}</th>)}
            {FICHA_NUM_FIELDS.map(f => <th key={f.key} {...span} className={styles.th}>{f.label}</th>)}
            <th {...span} className={styles.th}>{FICHA_DATE_FIELD.label}</th>
            <th colSpan={3} className={`${styles.th} ${styles.thGroup}`}>Inversión</th>
            {RESUMEN_LINKS.map(l => <th key={l.key} {...span} className={styles.th}>{FICHA_LINK_LABELS[l.key]}</th>)}
            <th {...span} className={styles.th}></th>
          </tr>
          <tr>
            {FICHA_INVERSION_FIELDS.map(f => <th key={f.key} className={`${styles.th} ${styles.th2}`}>{f.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {clients.map(c => {
            const f = fichas[c.id] || {}
            const dash = <span className={styles.dash}>—</span>
            return (
              <tr key={c.id}>
                <td className={`${styles.td} ${styles.stickyCol} ${styles.nameCell}`}>{c.brand_name}</td>
                {FICHA_TEXT_FIELDS.map(x => <td key={x.key} className={styles.td}>{f[x.key] || dash}</td>)}
                {FICHA_NUM_FIELDS.map(x => <td key={x.key} className={styles.td}>{f[x.key] ?? dash}</td>)}
                <td className={styles.td}>{f[FICHA_DATE_FIELD.key] || dash}</td>
                {FICHA_INVERSION_FIELDS.map(x => <td key={x.key} className={styles.td}>{fmtNumber(f[x.key]) ?? dash}</td>)}
                {RESUMEN_LINKS.map(l => <td key={l.key} className={styles.td}><LinkCell url={f[l.key]} /></td>)}
                <td className={styles.td}>
                  <button className={styles.iconBtn} onClick={() => onEdit(c)} title="Editar ficha"><EditIcon /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PlusIcon()    { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function EditIcon()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-9 9-4 1 1-4 9-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg> }
function TrashIcon()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ArchiveIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M3 6v6a1 1 0 001 1h8a1 1 0 001-1V6M6.5 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function RestoreIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 105-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3 3v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
