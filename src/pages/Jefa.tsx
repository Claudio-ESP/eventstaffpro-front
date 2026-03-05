import { useState } from 'react'
import { getEventStatus, getEventLinks, EventStatusResponse, EventLinksResponse } from '../api'

const STATUS_LABELS: Record<string, string> = {
  DESPIERTO: 'Despierto',
  DE_CAMINO: 'De camino',
  EN_SITIO: 'En sitio',
}

const STATUS_COLORS: Record<string, string> = {
  DESPIERTO: '#2563eb',
  DE_CAMINO: '#d97706',
  EN_SITIO: '#16a34a',
}

export default function Jefa() {
  const [eventId, setEventId] = useState('EVT001')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<EventStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [linksLoading, setLinksLoading] = useState(false)
  const [linksData, setLinksData] = useState<EventLinksResponse | null>(null)
  const [linksError, setLinksError] = useState<string | null>(null)
  const [copiedRows, setCopiedRows] = useState<Record<number, boolean>>({})
  const [copiedAll, setCopiedAll] = useState(false)
  const [waBlockedWarning, setWaBlockedWarning] = useState(false)

  async function handleRefresh() {
    if (!token) {
      setError('El token no puede estar vacío.')
      return
    }
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await getEventStatus(token, eventId)
      setData(res)
    } catch (err: unknown) {
      const e = err as Error
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLoadLinks() {
    if (!token) {
      setLinksError('El token no puede estar vacío.')
      return
    }
    setLinksLoading(true)
    setLinksError(null)
    setLinksData(null)
    setCopiedRows({})
    try {
      const res = await getEventLinks(token, eventId)
      setLinksData(res)
    } catch (err: unknown) {
      setLinksError((err as Error).message)
    } finally {
      setLinksLoading(false)
    }
  }

  async function handleCopyAll() {
    if (!linksData) return
    const items = linksData.linksPorStaff
    const withLink = items.filter(it => it.staffTokenPresent && it.link)
    const withoutLink = items.filter(it => !it.staffTokenPresent || !it.link)

    const lines: string[] = [`Evento ${eventId}`]
    for (const it of withLink) {
      lines.push(`- ${it.name || it.staffId} (${it.shiftId}): ${it.link}`)
    }
    if (withoutLink.length > 0) {
      const names = withoutLink.map(it => it.name || it.staffId).join(', ')
      lines.push(`\nSin staffToken: ${names}`)
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  function handleDownloadCsv() {
    if (!linksData) return
    const header = 'staffId,name,phone,shiftId,status,link'
    const rows = linksData.linksPorStaff.map(it =>
      [it.staffId, it.name, it.phone, it.shiftId, it.status, it.link]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `event-links-${eventId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleOpenAllWhatsApp() {
    if (!linksData) return
    const items = linksData.linksPorStaff.filter(it => it.waLink)
    if (items.length === 0) return
    setWaBlockedWarning(false)
    items.forEach((it, idx) => {
      setTimeout(() => {
        const win = window.open(it.waLink!, '_blank')
        if (win === null) setWaBlockedWarning(true)
      }, idx * 300)
    })
  }

  async function handleCopy(link: string, index: number) {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedRows(prev => ({ ...prev, [index]: true }))
      setTimeout(() => setCopiedRows(prev => ({ ...prev, [index]: false })), 1500)
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  const rows = data?.rows ?? []
  const counts: Record<string, number> = {
    DESPIERTO: rows.filter(r => r.status === 'DESPIERTO').length,
    DE_CAMINO: rows.filter(r => r.status === 'DE_CAMINO').length,
    EN_SITIO: rows.filter(r => r.status === 'EN_SITIO').length,
  }
  const countKeys = ['DESPIERTO', 'DE_CAMINO', 'EN_SITIO']

  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>Jefa</h2>

      <section style={styles.card}>
        <h3 style={styles.sectionTitle}>Consultar evento</h3>

        <div style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Event ID</label>
            <input
              style={styles.input}
              value={eventId}
              onChange={e => setEventId(e.target.value)}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Token (Bearer)</label>
            <input
              style={styles.input}
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Pega tu token aquí"
            />
          </div>
        </div>

        <button
          style={styles.button}
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? 'Cargando...' : 'Refrescar estado'}
        </button>

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </section>

      {data && (
        <section style={styles.card}>
          <div style={styles.summaryRow}>
            <div style={styles.statCard}>
              <span style={styles.cardLabel}>Total</span>
              <span style={styles.cardValue}>{rows.length}</span>
            </div>
            {countKeys.map(key => (
              <div key={key} style={{ ...styles.statCard, borderTop: `3px solid ${STATUS_COLORS[key] ?? '#6b7280'}` }}>
                <span style={styles.cardLabel}>{STATUS_LABELS[key] ?? key}</span>
                <span style={{ ...styles.cardValue, color: STATUS_COLORS[key] ?? '#111' }}>
                  {counts[key] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <h3 style={styles.tableTitle}>Detalle del personal</h3>
          {rows.length > 0 ? (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Nombre</th>
                    <th style={styles.th}>Teléfono</th>
                    <th style={styles.th}>Staff ID</th>
                    <th style={styles.th}>Turno</th>
                    <th style={styles.th}>Estado</th>
                    <th style={styles.th}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, i) => (
                    <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                      <td style={styles.td}>{item.staff?.name ?? '—'}</td>
                      <td style={styles.td}>{item.staff?.phone ?? '—'}</td>
                      <td style={styles.td}>{item.staffid}</td>
                      <td style={styles.td}>{item.shiftid}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            background: STATUS_COLORS[item.status] ?? '#6b7280',
                          }}
                        >
                          {STATUS_LABELS[item.status] ?? item.status}
                        </span>
                      </td>
                      <td style={styles.td}>{item.ts ? new Date(item.ts).toLocaleString('es-ES') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 14 }}>Sin datos de personal aún.</p>
          )}
        </section>
      )}

      {/* ── Links para azafatos ── */}
      <section style={styles.card}>
        <div style={styles.linksHeader}>
          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Links para azafatos</h3>
          <div style={styles.linksActions}>
            <button
              style={styles.button}
              onClick={handleLoadLinks}
              disabled={linksLoading}
            >
              {linksLoading ? 'Cargando...' : 'Cargar links'}
            </button>
            <button
              style={copiedAll ? styles.copyBtnDone : styles.copyBtn}
              onClick={handleCopyAll}
              disabled={linksLoading || !linksData || linksData.linksPorStaff.length === 0 || copiedAll}
            >
              {copiedAll ? 'Copiado ✅' : 'Copiar todos (WhatsApp)'}
            </button>
            <button
              style={styles.waBulkBtn}
              onClick={handleOpenAllWhatsApp}
              disabled={linksLoading || !linksData || !linksData.linksPorStaff.some(it => it.waLink)}
            >
              Abrir WhatsApp para todos
            </button>
            <button
              style={styles.csvBtn}
              onClick={handleDownloadCsv}
              disabled={!linksData || linksData.linksPorStaff.length === 0}
            >
              Descargar CSV
            </button>
          </div>
        </div>

        {waBlockedWarning && (
          <div style={styles.waWarning}>
            ⚠️ Tu navegador puede bloquear múltiples pestañas. Usa el botón individual por fila.
          </div>
        )}

        {linksError && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {linksError}
          </div>
        )}

        {linksData && (
          <>
            <p style={styles.linksHint}>
              Estos links ya incluyen token y rellenan el Azafato automáticamente.
            </p>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Nombre</th>
                    <th style={styles.th}>Teléfono</th>
                    <th style={styles.th}>Staff ID</th>
                    <th style={styles.th}>Turno</th>
                    <th style={styles.th}>Estado</th>
                    <th style={styles.th}>Link</th>
                    <th style={styles.th}>WhatsApp</th>
                    <th style={styles.th}>Copiar</th>
                  </tr>
                </thead>
                <tbody>
                  {linksData.linksPorStaff.map((item, i) => {
                    const missing = !item.staffTokenPresent || !item.link
                    return (
                      <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                        <td style={styles.td}>{item.name || '—'}</td>
                        <td style={styles.td}>{item.phone || '—'}</td>
                        <td style={styles.td}>{item.staffId}</td>
                        <td style={styles.td}>{item.shiftId}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, background: STATUS_COLORS[item.status] ?? '#6b7280' }}>
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </td>
                        <td style={{ ...styles.td, maxWidth: 300 }}>
                          {missing ? (
                            <span style={styles.missingToken}>Falta staffToken</span>
                          ) : (
                            <input
                              style={styles.linkInput}
                              readOnly
                              value={item.link}
                            />
                          )}
                        </td>
                        <td style={styles.td}>
                          {item.waLink ? (
                            <button
                              style={styles.waBtn}
                              onClick={() => window.open(item.waLink!, '_blank')}
                            >
                              WhatsApp
                            </button>
                          ) : (
                            <button style={styles.waBtn} disabled>
                              {missing ? 'Falta token' : 'Sin link WA'}
                            </button>
                          )}
                        </td>
                        <td style={styles.td}>
                          <button
                            style={copiedRows[i] ? styles.copyBtnDone : styles.copyBtn}
                            onClick={() => handleCopy(item.link, i)}
                            disabled={missing || !!copiedRows[i]}
                          >
                            {copiedRows[i] ? 'Copiado ✅' : 'Copiar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
    color: '#111827',
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#374151',
    marginTop: 0,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  form: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px 20px',
    marginBottom: 20,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  input: {
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    background: '#fafafa',
  },
  button: {
    padding: '10px 22px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#dc2626',
    fontSize: 14,
    marginTop: 14,
  },
  summaryRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 28,
  },
  statCard: {
    flex: '1 1 110px',
    minWidth: 110,
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  cardLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  cardValue: {
    fontSize: 30,
    fontWeight: 800,
    color: '#111827',
    lineHeight: 1,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 10,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    background: '#f3f4f6',
    padding: '10px 14px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '10px 14px',
    color: '#374151',
    verticalAlign: 'middle',
  },
  trEven: {
    background: '#fff',
  },
  trOdd: {
    background: '#f9fafb',
  },
  badge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 99,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
  },
  linksHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  linksActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  csvBtn: {
    padding: '5px 14px',
    background: '#374151',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  linksHint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 0,
    marginBottom: 14,
  },
  linkInput: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 12,
    color: '#374151',
    background: '#f9fafb',
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  },
  copyBtn: {
    padding: '5px 14px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  copyBtnDone: {
    padding: '5px 14px',
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'default',
    whiteSpace: 'nowrap',
  },
  missingToken: {
    fontSize: 12,
    color: '#dc2626',
    fontStyle: 'italic',
  },
  waBulkBtn: {
    padding: '5px 14px',
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  waBtn: {
    padding: '4px 12px',
    background: '#25d366',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  waWarning: {
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    color: '#92400e',
    marginBottom: 12,
  },
}
