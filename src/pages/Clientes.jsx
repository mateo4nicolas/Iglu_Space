import { useState } from 'react'
import { useClients, BILLING_PERIODS } from '../hooks/useClients'
import styles from './Clientes.module.css'

export default function ClientesPage() {
  const {
    activeClients,
    archivedClients,
    byPeriod,
    loading,
    createClient,
    updateClient,
    setActive,
    deleteClient,
  } = useClients()

  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const visibleClients = showArchived ? archivedClients : activeClients
  const columns = byPeriod(visibleClients)

  async function handleCreate(data) {
    const { error } = await createClient(data)
    if (!error) setShowForm(false)
    return { error }
  }

  async function handleEditSave(data) {
    const { error } = await updateClient(editingClient.id, data)
    if (!error) setEditingClient(null)
    return { error }
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
      </div>

      {visibleClients.length === 0 ? (
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
                      archived={showArchived}
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
      )}

      {showForm && (
        <ClientFormModal
          title="Nuevo cliente"
          onClose={() => setShowForm(false)}
          onSave={handleCreate}
        />
      )}

      {editingClient && (
        <ClientFormModal
          title="Editar cliente"
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  )
}

// ── Client Card ───────────────────────────────────────────────────────────────
function ClientCard({ client, archived, onEdit, onArchive, onRestore, onDelete }) {
  return (
    <div className={`${styles.clientCard} ${archived ? styles.clientCardArchived : ''}`}>
      <div className={styles.clientAvatar}>{client.brand_name[0]?.toUpperCase()}</div>
      <div className={styles.clientInfo}>
        <span className={styles.clientName}>{client.brand_name}</span>
        <span className={`badge ${archived ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: 10 }}>
          {archived ? 'Archivado' : 'Activo'}
        </span>
      </div>
      <div className={styles.clientActions}>
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
      </div>
    </div>
  )
}

// ── Create / Edit Modal ─────────────────────────────────────────────────────────
function ClientFormModal({ title, client, onClose, onSave }) {
  const [brandName, setBrandName] = useState(client?.brand_name || '')
  const [billingPeriod, setBillingPeriod] = useState(client?.billing_period || BILLING_PERIODS[0].value)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!brandName.trim() || !billingPeriod) return
    setLoading(true)
    setErrorMsg('')
    const { error } = await onSave({ brand_name: brandName.trim(), billing_period: billingPeriod })
    setLoading(false)
    if (error) setErrorMsg(error.message || 'No se pudo guardar el cliente')
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
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

function PlusIcon()    { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function EditIcon()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-9 9-4 1 1-4 9-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg> }
function TrashIcon()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ArchiveIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M3 6v6a1 1 0 001 1h8a1 1 0 001-1V6M6.5 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function RestoreIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 105-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3 3v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
