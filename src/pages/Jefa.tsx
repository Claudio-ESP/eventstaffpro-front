import { useState, useEffect, useRef } from 'react'
import {
  getEventStatus, getEventLinks, getEventInfo,
  adminUpsertEvent, adminUpsertShift, adminAssignStaff, adminUpsertStaff,
  adminListStaff, adminListShifts,
  EventInfo, AdminStaff, AdminShift, EventStatusResponse, EventLinksResponse,
} from '../api'

const STATUS_LABELS: Record<string, string> = {
  DESPIERTO: 'Despierto',
  DE_CAMINO: 'De camino',
  EN_SITIO: 'En sitio',
}

const STATUS_COLORS: Record<string, string> = {
  DESPIERTO: '#3b82f6',
  DE_CAMINO: '#f59e0b',
  EN_SITIO: '#22c55e',
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '32px 20px 60px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  pageHeader: {
    paddingBottom: 16,
    borderBottom: '1px solid #1e293b',
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#f1f5f9',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#475569',
    margin: '3px 0 0',
  },
  card: {
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 14,
    padding: '24px 28px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  sectionIcon: {
    fontSize: 18,
    lineHeight: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#e2e8f0',
    letterSpacing: '0.01em',
  },
  controlGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px 20px',
    marginBottom: 16,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    padding: '9px 12px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    fontSize: 14,
    color: '#e2e8f0',
    outline: 'none',
  },
  select: {
    padding: '9px 12px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    fontSize: 14,
    color: '#e2e8f0',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
  },
  eventInfoBlock: {
    marginBottom: 16,
    minWidth: 0,
  },
  eventInfoText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  eventInfoName: {
    fontWeight: 700,
    color: '#f1f5f9',
    fontSize: 15,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
  eventInfoLocation: {
    color: '#64748b',
    fontSize: 13,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  },
  refreshRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  muted: {
    fontSize: 13,
    color: '#475569',
    fontStyle: 'italic',
  },
  // Buttons
  btnPrimary: {
    padding: '9px 20px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnOutline: {
    padding: '9px 16px',
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #1e293b',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnOutlineSm: {
    padding: '6px 12px',
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #1e293b',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnDone: {
    padding: '9px 16px',
    background: 'rgba(34,197,94,0.12)',
    color: '#86efac',
    border: '1px solid rgba(34,197,94,0.25)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'default',
    whiteSpace: 'nowrap',
  },
  btnGreen: {
    padding: '9px 16px',
    background: 'rgba(37,211,102,0.1)',
    color: '#25d366',
    border: '1px solid rgba(37,211,102,0.25)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnWa: {
    padding: '5px 10px',
    background: 'rgba(37,211,102,0.1)',
    color: '#25d366',
    border: '1px solid rgba(37,211,102,0.2)',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  pillOn: {
    padding: '8px 18px',
    background: 'rgba(34,197,94,0.12)',
    color: '#86efac',
    border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  pillOff: {
    padding: '8px 18px',
    background: 'transparent',
    color: '#475569',
    border: '1px solid #1e293b',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  actionGroup: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  // Stats
  summaryRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  statCard: {
    flex: '1 1 110px',
    minWidth: 100,
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  statValue: {
    fontSize: 30,
    fontWeight: 800,
    color: '#e2e8f0',
    lineHeight: 1,
  },
  tableLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: 10,
    border: '1px solid #1e293b',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    background: '#0b1120',
    padding: '10px 14px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#334155',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 14px',
    color: '#94a3b8',
    verticalAlign: 'middle',
    borderBottom: '1px solid #0f172a',
  },
  trEven: { background: '#111827' },
  trOdd: { background: '#0e1826' },
  badge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 99,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  linkInput: {
    width: '100%',
    padding: '5px 8px',
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 6,
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'monospace',
    outline: 'none',
    boxSizing: 'border-box',
  },
  // Admin
  adminToggle: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: '#e2e8f0',
    fontSize: 15,
    textAlign: 'left',
  },
  adminGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
    marginTop: 24,
  },
  adminCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '18px 20px',
  },
  adminCardTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    marginBottom: 14,
  },
  adminForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 14,
  },
  adminBtnRow: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  pre: {
    background: '#070d18',
    border: '1px solid #1e293b',
    borderRadius: 6,
    padding: '10px 12px',
    fontSize: 11,
    color: '#86efac',
    overflowX: 'auto',
    marginTop: 10,
    lineHeight: 1.6,
  },
  selectedStaff: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    padding: '7px 10px',
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: 7,
    fontSize: 13,
    color: '#93c5fd',
    fontWeight: 600,
  },
  clearBtn: {
    marginLeft: 'auto',
    padding: '2px 7px',
    background: 'transparent',
    border: '1px solid rgba(59,130,246,0.25)',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    color: '#60a5fa',
  },
  staffResults: {
    marginTop: 4,
    border: '1px solid #1e293b',
    borderRadius: 8,
    overflow: 'hidden',
    maxHeight: 200,
    overflowY: 'auto',
  },
  staffResultItem: {
    padding: '9px 12px',
    cursor: 'pointer',
    fontSize: 13,
    borderBottom: '1px solid #0f172a',
    background: '#111827',
    color: '#94a3b8',
  },
  advancedToggle: {
    background: 'none',
    border: 'none',
    color: '#334155',
    cursor: 'pointer',
    fontSize: 12,
    padding: '2px 0',
    textAlign: 'left',
  },
}

// ── Internal UI helpers ───────────────────────────────────────────────────────
function DarkCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={S.sectionHeader}>
      <span style={S.sectionIcon}>{icon}</span>
      <span style={S.sectionTitle}>{title}</span>
    </div>
  )
}

function AlertBox({ type, children }: { type: 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const theme = {
    error:   { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  color: '#fca5a5' },
    success: { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#86efac' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#fcd34d' },
  }[type]
  return (
    <div style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '10px 14px', color: theme.color, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
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

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(10000)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const loadingRef = useRef(false)

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [eventInfoLoading, setEventInfoLoading] = useState(false)
  const [eventInfoError, setEventInfoError] = useState<string | null>(null)
  const [timeSinceLabel, setTimeSinceLabel] = useState('Sin actualizar')

  // ── Admin section state ──────────────────────────────────────────────────
  const [adminOpen, setAdminOpen] = useState(false)

  const [newEvtId, setNewEvtId] = useState('EVT002')
  const [newEvtName, setNewEvtName] = useState('')
  const [newEvtLocation, setNewEvtLocation] = useState('')
  const [evtLoading, setEvtLoading] = useState(false)
  const [evtResult, setEvtResult] = useState<Record<string, unknown> | null>(null)
  const [evtError, setEvtError] = useState<string | null>(null)
  const [evtCopied, setEvtCopied] = useState(false)

  const [newShEvtId, setNewShEvtId] = useState('EVT002')
  const [newShId, setNewShId] = useState('SHIFT2')
  const [newShName, setNewShName] = useState('')
  const [newShStartsAt, setNewShStartsAt] = useState('')
  const [newShEndsAt, setNewShEndsAt] = useState('')
  const [shLoading, setShLoading] = useState(false)
  const [shResult, setShResult] = useState<Record<string, unknown> | null>(null)
  const [shError, setShError] = useState<string | null>(null)
  const [shCopied, setShCopied] = useState(false)

  const [newAsEvtId, setNewAsEvtId] = useState('EVT002')
  const [selectedShiftId, setSelectedShiftId] = useState('')
  const [shiftList, setShiftList] = useState<AdminShift[]>([])
  const [shiftListLoading, setShiftListLoading] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const [staffList, setStaffList] = useState<AdminStaff[]>([])
  const [staffListLoading, setStaffListLoading] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<AdminStaff | null>(null)
  const [asLoading, setAsLoading] = useState(false)
  const [asResult, setAsResult] = useState<Record<string, unknown> | null>(null)
  const [asError, setAsError] = useState<string | null>(null)
  const [asCopied, setAsCopied] = useState(false)

  const [stfId, setStfId] = useState('')
  const [stfName, setStfName] = useState('')
  const [stfPhone, setStfPhone] = useState('')
  const [stfShowAdvanced, setStfShowAdvanced] = useState(false)
  const [stfLoading, setStfLoading] = useState(false)
  const [stfResult, setStfResult] = useState<Record<string, unknown> | null>(null)
  const [stfError, setStfError] = useState<string | null>(null)
  const [stfCopied, setStfCopied] = useState(false)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!eventId.trim()) {
      setEventInfo(null)
      setEventInfoError(null)
      setEventInfoLoading(false)
      return
    }
    let cancelled = false
    setEventInfoLoading(true)
    setEventInfoError(null)
    const tid = setTimeout(async () => {
      try {
        const res = await getEventInfo(eventId)
        if (import.meta.env.DEV) {
          console.log('[event-info] eventId', eventId)
          console.log('[event-info] response raw', res)
        }
        if (cancelled) return
        setEventInfoLoading(false)
        if (res.ok && res.event) {
          setEventInfo(res.event)
        } else {
          setEventInfo(null)
          setEventInfoError('Evento no encontrado')
        }
      } catch (err: unknown) {
        if (cancelled) return
        setEventInfoLoading(false)
        const e = err as Error & { status?: number }
        if (import.meta.env.DEV) {
          console.error('[event-info] error:', e.message, 'status:', e.status)
        }
        setEventInfo(null)
        if (e.status === 404) {
          setEventInfoError('Evento no encontrado')
        } else if (e.status === 401 || e.status === 403) {
          setEventInfoError('Sin permisos para leer el evento')
        } else {
          setEventInfoError('No se pudo cargar el evento')
        }
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(tid) }
  }, [eventId])

  useEffect(() => {
    if (!lastRefreshed) return
    const calc = () => {
      const secs = Math.round((Date.now() - lastRefreshed.getTime()) / 1000)
      setTimeSinceLabel(`Ultima actualización: hace ${secs}s`)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [lastRefreshed])

  async function refreshStatus(clearData = false) {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    if (clearData) setData(null)
    try {
      const res = await getEventStatus(token, eventId)
      setData(res)
      setLastRefreshed(new Date())
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  async function handleRefresh() {
    if (!token) {
      setError('El token no puede estar vacío.')
      return
    }
    await refreshStatus(true)
  }

  useEffect(() => {
    if (!autoRefresh || !token || !eventId) return
    refreshStatus()
    const id = setInterval(() => refreshStatus(), refreshIntervalMs)
    return () => clearInterval(id)
  }, [autoRefresh, refreshIntervalMs, eventId, token]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Shifts auto-load when assign event changes ───────────────────────────
  useEffect(() => {
    if (!newAsEvtId.trim() || !token) { setShiftList([]); setSelectedShiftId(''); return }
    let cancelled = false
    setShiftListLoading(true)
    const tid = setTimeout(async () => {
      try {
        const list = await adminListShifts(token, newAsEvtId)
        if (cancelled) return
        setShiftList(list)
        setSelectedShiftId(prev => list.some(s => s.shiftid === prev) ? prev : '')
      } catch { if (!cancelled) { setShiftList([]); setSelectedShiftId('') } }
      finally { if (!cancelled) setShiftListLoading(false) }
    }, 500)
    return () => { cancelled = true; clearTimeout(tid) }
  }, [newAsEvtId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Admin handlers ───────────────────────────────────────────────────────
  async function handleUpsertEvent() {
    if (!token) { setEvtError('Token requerido'); return }
    setEvtLoading(true); setEvtError(null); setEvtResult(null)
    try {
      const res = await adminUpsertEvent(token, {
        eventId: newEvtId, name: newEvtName,
        ...(newEvtLocation ? { location: newEvtLocation } : {}),
      })
      setEvtResult(res as Record<string, unknown>)
    } catch (e: unknown) { setEvtError((e as Error).message) }
    finally { setEvtLoading(false) }
  }

  async function handleUpsertShift() {
    if (!token) { setShError('Token requerido'); return }
    setShLoading(true); setShError(null); setShResult(null)
    try {
      const res = await adminUpsertShift(token, {
        eventId: newShEvtId, shiftId: newShId, shiftName: newShName,
        ...(newShStartsAt ? { startsAt: new Date(newShStartsAt).toISOString() } : {}),
        ...(newShEndsAt   ? { endsAt:   new Date(newShEndsAt).toISOString()   } : {}),
      })
      setShResult(res as Record<string, unknown>)
    } catch (e: unknown) { setShError((e as Error).message) }
    finally { setShLoading(false) }
  }

  async function handleAssignStaff() {
    if (!token) { setAsError('Token requerido'); return }
    if (!selectedStaff) { setAsError('Selecciona un azafato'); return }
    if (!selectedShiftId) { setAsError('Selecciona un turno'); return }
    setAsLoading(true); setAsError(null); setAsResult(null)
    try {
      const res = await adminAssignStaff(token, {
        eventId: newAsEvtId, shiftId: selectedShiftId, staffId: selectedStaff.staffid,
      })
      setAsResult(res as Record<string, unknown>)
    } catch (e: unknown) { setAsError((e as Error).message) }
    finally { setAsLoading(false) }
  }

  async function handleUpsertStaff() {
    if (!token) { setStfError('Token requerido'); return }
    setStfLoading(true); setStfError(null); setStfResult(null)
    try {
      const res = await adminUpsertStaff(token, {
        ...(stfId.trim() ? { staffId: stfId.trim() } : {}),
        name: stfName, phone: stfPhone, agencyId: 'AG01',
      })
      setStfResult(res as Record<string, unknown>)
      handleLoadStaff()
    } catch (e: unknown) { setStfError((e as Error).message) }
    finally { setStfLoading(false) }
  }

  async function handleLoadStaff() {
    if (!token) return
    setStaffListLoading(true)
    try {
      const list = await adminListStaff(token)
      setStaffList(list)
    } catch { setStaffList([]) }
    finally { setStaffListLoading(false) }
  }

  async function handleAdminCopy(payload: Record<string, unknown>, which: 'evt' | 'sh' | 'as' | 'stf') {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      if (which === 'evt') { setEvtCopied(true); setTimeout(() => setEvtCopied(false), 1500) }
      if (which === 'sh')  { setShCopied(true);  setTimeout(() => setShCopied(false),  1500) }
      if (which === 'as')  { setAsCopied(true);  setTimeout(() => setAsCopied(false),  1500) }
      if (which === 'stf') { setStfCopied(true); setTimeout(() => setStfCopied(false), 1500) }
    } catch { /* clipboard unavailable */ }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const rows = data?.rows ?? []
  const counts: Record<string, number> = {
    DESPIERTO: rows.filter(r => r.status === 'DESPIERTO').length,
    DE_CAMINO: rows.filter(r => r.status === 'DE_CAMINO').length,
    EN_SITIO: rows.filter(r => r.status === 'EN_SITIO').length,
  }
  const countKeys = ['DESPIERTO', 'DE_CAMINO', 'EN_SITIO']

  return (
    <div style={S.page}>

      {/* Page header */}
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>EventStaffPro</h1>
        <p style={S.pageSubtitle}>Panel de control · Jefa</p>
      </div>

      {/* A — Panel de control */}
      <DarkCard>
        <SectionHeader icon="🎛️" title="Panel de control" />

        <div style={S.controlGrid}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Event ID</label>
            <input
              style={S.input}
              value={eventId}
              onChange={e => setEventId(e.target.value)}
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Token (Bearer)</label>
            <input
              style={S.input}
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Pega tu token aquí"
            />
          </div>
        </div>

        {eventId && (
          <div style={S.eventInfoBlock}>
            {eventInfoLoading && <span style={S.muted}>Cargando evento…</span>}
            {!eventInfoLoading && eventInfoError && (
              <span style={{ color: '#f87171', fontSize: 13 }}>{eventInfoError}</span>
            )}
            {!eventInfoLoading && eventInfo && (
              <div style={S.eventInfoText}>
                <span style={S.eventInfoName}>{eventInfo.name ?? eventInfo.eventid}</span>
                <span style={S.eventInfoLocation}>📍 {eventInfo.location ?? '—'}</span>
              </div>
            )}
          </div>
        )}

        <div style={S.refreshRow}>
          <button style={S.btnPrimary} onClick={handleRefresh} disabled={loading}>
            {loading ? '⏳ Cargando…' : '🔄 Refrescar estado'}
          </button>

          <button
            style={autoRefresh ? S.pillOn : S.pillOff}
            onClick={() => setAutoRefresh(v => !v)}
          >
            {autoRefresh ? '● Auto ON' : '○ Auto OFF'}
          </button>

          <select
            style={{ ...S.select, width: 'auto' }}
            value={refreshIntervalMs}
            onChange={e => setRefreshIntervalMs(Number(e.target.value))}
          >
            <option value={5000}>5 s</option>
            <option value={10000}>10 s</option>
            <option value={15000}>15 s</option>
            <option value={30000}>30 s</option>
          </select>

          {lastRefreshed && (
            <span style={S.muted}>{timeSinceLabel}</span>
          )}
        </div>

        {error && <AlertBox type="error"><strong>Error:</strong> {error}</AlertBox>}
      </DarkCard>

      {/* B — Estado del personal */}
      {data && (
        <DarkCard>
          <SectionHeader icon="👥" title="Estado del personal" />

          <div style={S.summaryRow}>
            <div style={S.statCard}>
              <span style={S.statLabel}>Total</span>
              <span style={S.statValue}>{rows.length}</span>
            </div>
            {countKeys.map(key => (
              <div key={key} style={{ ...S.statCard, borderTop: `3px solid ${STATUS_COLORS[key] ?? '#334155'}` }}>
                <span style={S.statLabel}>{STATUS_LABELS[key] ?? key}</span>
                <span style={{ ...S.statValue, color: STATUS_COLORS[key] ?? '#e2e8f0' }}>
                  {counts[key] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <div style={S.tableLabel}>Detalle del personal</div>
          {rows.length > 0 ? (
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Nombre</th>
                    <th style={S.th}>Teléfono</th>
                    <th style={S.th}>Staff ID</th>
                    <th style={S.th}>Turno</th>
                    <th style={S.th}>Estado</th>
                    <th style={S.th}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item, i) => (
                    <tr key={i} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                      <td style={{ ...S.td, color: '#cbd5e1', fontWeight: 500 }}>{item.staff?.name ?? '—'}</td>
                      <td style={S.td}>{item.staff?.phone ?? '—'}</td>
                      <td style={{ ...S.td, ...S.mono }}>{item.staffid}</td>
                      <td style={{ ...S.td, ...S.mono }}>{item.shiftid}</td>
                      <td style={S.td}>
                        <span style={{ ...S.badge, background: STATUS_COLORS[item.status] ?? '#334155' }}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </span>
                      </td>
                      <td style={{ ...S.td, ...S.mono }}>{item.ts ? new Date(item.ts).toLocaleString('es-ES') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={S.muted}>Sin datos de personal aún.</p>
          )}
        </DarkCard>
      )}

      {/* C — Links para azafatos */}
      <DarkCard>
        <div style={S.sectionHeaderRow}>
          <SectionHeader icon="🔗" title="Links para azafatos" />
          <div style={S.actionGroup}>
            <button style={S.btnPrimary} onClick={handleLoadLinks} disabled={linksLoading}>
              {linksLoading ? '⏳ Cargando…' : 'Cargar links'}
            </button>
            <button
              style={copiedAll ? S.btnDone : S.btnOutline}
              onClick={handleCopyAll}
              disabled={linksLoading || !linksData || linksData.linksPorStaff.length === 0 || copiedAll}
            >
              {copiedAll ? 'Copiado ✅' : '📋 Copiar todos (WA)'}
            </button>
            <button
              style={S.btnGreen}
              onClick={handleOpenAllWhatsApp}
              disabled={linksLoading || !linksData || !linksData.linksPorStaff.some(it => it.waLink)}
            >
              💬 WhatsApp todos
            </button>
            <button
              style={S.btnOutline}
              onClick={handleDownloadCsv}
              disabled={!linksData || linksData.linksPorStaff.length === 0}
            >
              ⬇ CSV
            </button>
          </div>
        </div>

        {waBlockedWarning && (
          <AlertBox type="warning">
            Tu navegador puede bloquear múltiples pestañas. Usa el botón individual por fila.
          </AlertBox>
        )}

        {linksError && <AlertBox type="error"><strong>Error:</strong> {linksError}</AlertBox>}

        {linksData && (
          <>
            <p style={{ ...S.muted, marginTop: 8, marginBottom: 12 }}>
              Estos links ya incluyen token y rellenan el formulario automáticamente.
            </p>
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Nombre</th>
                    <th style={S.th}>Teléfono</th>
                    <th style={S.th}>Staff ID</th>
                    <th style={S.th}>Turno</th>
                    <th style={S.th}>Estado</th>
                    <th style={S.th}>Link</th>
                    <th style={S.th}>WA</th>
                    <th style={S.th}>Copiar</th>
                  </tr>
                </thead>
                <tbody>
                  {linksData.linksPorStaff.map((item, i) => {
                    const missing = !item.staffTokenPresent || !item.link
                    return (
                      <tr key={i} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                        <td style={{ ...S.td, color: '#cbd5e1', fontWeight: 500 }}>{item.name || '—'}</td>
                        <td style={S.td}>{item.phone || '—'}</td>
                        <td style={{ ...S.td, ...S.mono }}>{item.staffId}</td>
                        <td style={{ ...S.td, ...S.mono }}>{item.shiftId}</td>
                        <td style={S.td}>
                          <span style={{ ...S.badge, background: STATUS_COLORS[item.status] ?? '#334155' }}>
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </td>
                        <td style={{ ...S.td, maxWidth: 260 }}>
                          {missing ? (
                            <span style={{ color: '#f87171', fontSize: 12, fontStyle: 'italic' }}>Falta staffToken</span>
                          ) : (
                            <input style={S.linkInput} readOnly value={item.link} />
                          )}
                        </td>
                        <td style={S.td}>
                          {item.waLink ? (
                            <button style={S.btnWa} onClick={() => window.open(item.waLink!, '_blank')}>WA</button>
                          ) : (
                            <button style={S.btnWa} disabled>{missing ? 'Sin token' : '—'}</button>
                          )}
                        </td>
                        <td style={S.td}>
                          <button
                            style={copiedRows[i] ? { ...S.btnDone, padding: '6px 12px' } : S.btnOutlineSm}
                            onClick={() => handleCopy(item.link, i)}
                            disabled={missing || !!copiedRows[i]}
                          >
                            {copiedRows[i] ? '✅' : '📋'}
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
      </DarkCard>

      {/* D — Admin */}
      <DarkCard>
        <button style={S.adminToggle} onClick={() => setAdminOpen(v => !v)}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.sectionIcon}>⚙️</span>
            <span style={S.sectionTitle}>Admin — Gestión de datos</span>
          </span>
          <span style={{ color: '#334155', fontSize: 13 }}>{adminOpen ? '▴ Ocultar' : '▾ Mostrar'}</span>
        </button>

        {adminOpen && (
          <div style={S.adminGrid}>

            {/* D1 — Crear evento */}
            <div style={S.adminCard}>
              <div style={S.adminCardTitle}>📅 Crear / editar evento</div>
              <div style={S.adminForm}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Event ID</label>
                  <input style={S.input} value={newEvtId} onChange={e => setNewEvtId(e.target.value)} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Nombre</label>
                  <input style={S.input} value={newEvtName} onChange={e => setNewEvtName(e.target.value)} placeholder="Nombre del evento" />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Ubicación</label>
                  <input style={S.input} value={newEvtLocation} onChange={e => setNewEvtLocation(e.target.value)} placeholder="IFEMA Madrid…" />
                </div>
              </div>
              <div style={S.adminBtnRow}>
                <button
                  style={evtCopied ? { ...S.btnDone, padding: '6px 12px', fontSize: 12 } : S.btnOutlineSm}
                  onClick={() => handleAdminCopy({ action: 'upsert-event', eventId: newEvtId, name: newEvtName, ...(newEvtLocation ? { location: newEvtLocation } : {}) }, 'evt')}
                >
                  {evtCopied ? 'Copiado ✅' : 'JSON'}
                </button>
                <button style={S.btnPrimary} onClick={handleUpsertEvent} disabled={evtLoading}>
                  {evtLoading ? 'Guardando…' : 'Guardar evento'}
                </button>
              </div>
              {evtError && <AlertBox type="error">{evtError}</AlertBox>}
              {evtResult && <pre style={S.pre}>{JSON.stringify(evtResult, null, 2)}</pre>}
            </div>

            {/* D2 — Crear turno */}
            <div style={S.adminCard}>
              <div style={S.adminCardTitle}>🕐 Crear / editar turno</div>
              <div style={S.adminForm}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Event ID</label>
                  <input style={S.input} value={newShEvtId} onChange={e => setNewShEvtId(e.target.value)} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Shift ID</label>
                  <input style={S.input} value={newShId} onChange={e => setNewShId(e.target.value)} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Nombre del turno</label>
                  <input style={S.input} value={newShName} onChange={e => setNewShName(e.target.value)} placeholder="Turno tarde" />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Inicio</label>
                  <input style={S.input} type="datetime-local" value={newShStartsAt} onChange={e => setNewShStartsAt(e.target.value)} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Fin</label>
                  <input style={S.input} type="datetime-local" value={newShEndsAt} onChange={e => setNewShEndsAt(e.target.value)} />
                </div>
              </div>
              <div style={S.adminBtnRow}>
                <button
                  style={shCopied ? { ...S.btnDone, padding: '6px 12px', fontSize: 12 } : S.btnOutlineSm}
                  onClick={() => {
                    const p: Record<string, unknown> = { action: 'upsert-shift', eventId: newShEvtId, shiftId: newShId, shiftName: newShName }
                    if (newShStartsAt) p.startsAt = new Date(newShStartsAt).toISOString()
                    if (newShEndsAt)   p.endsAt   = new Date(newShEndsAt).toISOString()
                    handleAdminCopy(p, 'sh')
                  }}
                >
                  {shCopied ? 'Copiado ✅' : 'JSON'}
                </button>
                <button style={S.btnPrimary} onClick={handleUpsertShift} disabled={shLoading}>
                  {shLoading ? 'Guardando…' : 'Guardar turno'}
                </button>
              </div>
              {shError && <AlertBox type="error">{shError}</AlertBox>}
              {shResult && <pre style={S.pre}>{JSON.stringify(shResult, null, 2)}</pre>}
            </div>

            {/* D3 — Crear azafato */}
            <div style={S.adminCard}>
              <div style={S.adminCardTitle}>👤 Crear / editar azafato</div>
              <div style={S.adminForm}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Nombre</label>
                  <input style={S.input} value={stfName} onChange={e => setStfName(e.target.value)} placeholder="Nombre completo" />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Teléfono</label>
                  <input style={S.input} value={stfPhone} onChange={e => setStfPhone(e.target.value)} placeholder="600000000" />
                </div>
                <button style={S.advancedToggle} onClick={() => setStfShowAdvanced(v => !v)}>
                  {stfShowAdvanced ? 'Avanzado ▴' : 'Avanzado ▾'}
                </button>
                {stfShowAdvanced && (
                  <div style={S.fieldGroup}>
                    <label style={S.label}>Staff ID <span style={{ color: '#334155', fontWeight: 400 }}>(opcional)</span></label>
                    <input style={S.input} value={stfId} onChange={e => setStfId(e.target.value)} placeholder="Auto-generado si vacío" />
                  </div>
                )}
              </div>
              <div style={S.adminBtnRow}>
                <button
                  style={stfCopied ? { ...S.btnDone, padding: '6px 12px', fontSize: 12 } : S.btnOutlineSm}
                  onClick={() => handleAdminCopy({
                    action: 'upsert-staff',
                    ...(stfId.trim() ? { staffId: stfId.trim() } : {}),
                    name: stfName, phone: stfPhone, agencyId: 'AG01',
                  }, 'stf')}
                >
                  {stfCopied ? 'Copiado ✅' : 'JSON'}
                </button>
                <button style={S.btnPrimary} onClick={handleUpsertStaff} disabled={stfLoading}>
                  {stfLoading ? 'Guardando…' : 'Guardar azafato'}
                </button>
              </div>
              {stfError && <AlertBox type="error">{stfError}</AlertBox>}
              {stfResult && <pre style={S.pre}>{JSON.stringify(stfResult, null, 2)}</pre>}
            </div>

            {/* D4 — Asignar staff */}
            <div style={S.adminCard}>
              <div style={S.adminCardTitle}>🔀 Asignar staff a turno</div>
              <div style={S.adminForm}>

                <div style={S.fieldGroup}>
                  <label style={S.label}>Event ID</label>
                  <input
                    style={S.input}
                    value={newAsEvtId}
                    onChange={e => { setNewAsEvtId(e.target.value); setSelectedShiftId('') }}
                  />
                </div>

                <div style={S.fieldGroup}>
                  <label style={S.label}>Turno</label>
                  {shiftListLoading && <span style={S.muted}>Cargando turnos…</span>}
                  {!shiftListLoading && shiftList.length === 0 && (
                    <span style={S.muted}>
                      {newAsEvtId ? 'Sin turnos (guarda uno primero)' : 'Escribe un Event ID'}
                    </span>
                  )}
                  {!shiftListLoading && shiftList.length > 0 && (
                    <select
                      style={S.select}
                      value={selectedShiftId}
                      onChange={e => setSelectedShiftId(e.target.value)}
                    >
                      <option value="">— Selecciona turno —</option>
                      {shiftList.map(s => (
                        <option key={s.shiftid} value={s.shiftid}>
                          {s.name ?? s.shiftid}
                          {s.starts_at ? ` · ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div style={S.fieldGroup}>
                  <label style={S.label}>Azafato</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      style={{ ...S.input, flex: 1 }}
                      value={staffSearch}
                      onChange={e => setStaffSearch(e.target.value)}
                      placeholder="Buscar por nombre…"
                    />
                    <button style={S.btnOutlineSm} onClick={handleLoadStaff} disabled={staffListLoading}>
                      {staffListLoading ? '…' : 'Cargar'}
                    </button>
                  </div>

                  {selectedStaff && (
                    <div style={S.selectedStaff}>
                      <span>✓ {selectedStaff.name}</span>
                      <span style={{ color: '#64748b', fontSize: 12 }}>{selectedStaff.phone} · {selectedStaff.staffid}</span>
                      <button style={S.clearBtn} onClick={() => setSelectedStaff(null)}>✕</button>
                    </div>
                  )}

                  {staffList.length > 0 && !selectedStaff && (
                    <div style={S.staffResults}>
                      {staffList
                        .filter(s => !staffSearch || s.name.toLowerCase().includes(staffSearch.toLowerCase()))
                        .slice(0, 10)
                        .map(s => (
                          <div
                            key={s.staffid}
                            style={S.staffResultItem}
                            onClick={() => { setSelectedStaff(s); setStaffSearch('') }}
                          >
                            <span style={{ fontWeight: 600, color: '#cbd5e1' }}>{s.name}</span>
                            <span style={{ color: '#475569', fontSize: 12, marginLeft: 8 }}>{s.phone} · {s.staffid}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={S.adminBtnRow}>
                <button
                  style={asCopied ? { ...S.btnDone, padding: '6px 12px', fontSize: 12 } : S.btnOutlineSm}
                  onClick={() => handleAdminCopy({
                    action: 'assign-staff',
                    eventId: newAsEvtId,
                    shiftId: selectedShiftId,
                    staffId: selectedStaff?.staffid ?? '',
                  }, 'as')}
                >
                  {asCopied ? 'Copiado ✅' : 'JSON'}
                </button>
                <button
                  style={S.btnPrimary}
                  onClick={handleAssignStaff}
                  disabled={asLoading || !selectedStaff || !selectedShiftId}
                >
                  {asLoading ? 'Asignando…' : 'Asignar'}
                </button>
              </div>
              {asError && <AlertBox type="error">{asError}</AlertBox>}
              {asResult && <pre style={S.pre}>{JSON.stringify(asResult, null, 2)}</pre>}
            </div>

          </div>
        )}
      </DarkCard>

    </div>
  )
}
