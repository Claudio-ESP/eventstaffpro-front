import { useEffect, useRef, useState } from 'react'
import { postCheckin, getStaffSchedule, CheckinPayload, ScheduleItem } from '../api'
import { supabase } from '../supabase'

type Status = CheckinPayload['status']

const STATUS_LABELS: Record<string, string> = {
  DESPIERTO: 'Despierto',
  DE_CAMINO: 'De camino',
  EN_SITIO: 'En sitio',
}

const STATUS_COLORS: Record<string, string> = {
  DESPIERTO: '#2563eb',
  DE_CAMINO: '#d97706',
  EN_SITIO:  '#16a34a',
  SIN_ESTADO: '#6b7280',
}

function fmtMadrid(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...opts }).format(new Date(iso))
  } catch {
    return iso
  }
}
const fmtDateTime = (iso: string | null | undefined) =>
  fmtMadrid(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtTime = (iso: string | null | undefined) =>
  fmtMadrid(iso, { hour: '2-digit', minute: '2-digit' })
const fmtDate = (iso: string | null | undefined) =>
  fmtMadrid(iso, { weekday: 'short', day: 'numeric', month: 'short' })

export default function Azafato() {
  const [eventId, setEventId] = useState('EVT001')
  const [shiftId, setShiftId] = useState('SHIFT1')
  const [staffId, setStaffId] = useState('STF01')
  const [token, setToken] = useState('')

  const [checkinLoading, setCheckinLoading] = useState(false)
  const [checkinResult, setCheckinResult] = useState<{ ok: boolean; data: unknown } | null>(null)
  const [checkinSuccess, setCheckinSuccess] = useState<Status | null>(null)
  const checkinSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleData, setScheduleData] = useState<ScheduleItem[] | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // ── Supabase test (easy to remove) ──────────────────────────────────────
const [supabaseStatus, setSupabaseStatus] = useState<'loading' | 'ok' | 'error'>('loading')

useEffect(() => {
  const testSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .limit(1)

      if (error) {
        console.error('Supabase test error', error)
        setSupabaseStatus('error')
      } else {
        console.log('Supabase test OK', data)
        setSupabaseStatus('ok')
      }
    } catch (err) {
      console.error('Supabase unexpected error', err)
      setSupabaseStatus('error')
    }
  }

  testSupabase()
}, [])
  // ────────────────────────────────────────────────────────────────────────

  const urlParams = new URLSearchParams(window.location.search)
  const eventFromUrl = urlParams.has('eventId')
  const shiftFromUrl = urlParams.has('shiftId')
  const staffFromUrl = urlParams.has('staffId')
  const tokenFromUrl = urlParams.has('staffToken') || urlParams.has('token')
    || urlParams.has('stafftoken') || urlParams.has('staff_token')

  // Auto-fill inputs from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const eid = params.get('eventId')
    const sid = params.get('shiftId')
    const stid = params.get('staffId')
    const t = params.get('staffToken')
      ?? params.get('token')
      ?? params.get('stafftoken')
      ?? params.get('staff_token')
      ?? ''
    if (import.meta.env.DEV) {
      console.log('URL params', Object.fromEntries(params.entries()))
      console.log('tokenFromUrl', t)
    }
    if (eid) setEventId(eid)
    if (sid) setShiftId(sid)
    if (stid) setStaffId(stid)
    if (t) setToken(t)
  }, [])

  async function handleCheckin(status: Status) {
    if (!token) {
      setCheckinResult({ ok: false, data: { error: 'El token no puede estar vacío.' } })
      return
    }
    setCheckinLoading(true)
    setCheckinResult(null)
    setCheckinSuccess(null)
    try {
      const payload: CheckinPayload = { eventId, shiftId, staffId, staffToken: token, status }
      console.log('CHECKIN payload', payload)
      await postCheckin(payload)
      setCheckinSuccess(status)
      if (checkinSuccessTimer.current) clearTimeout(checkinSuccessTimer.current)
      checkinSuccessTimer.current = setTimeout(() => setCheckinSuccess(null), 3500)
    } catch (err: unknown) {
      const error = err as Error & { data?: unknown }
      setCheckinResult({ ok: false, data: error.data ?? { error: error.message } })
    } finally {
      setCheckinLoading(false)
    }
  }

  async function handleLoadSchedule() {
    if (!token) {
      setScheduleError('El token no puede estar vacío.')
      return
    }
    setScheduleLoading(true)
    setScheduleError(null)
    setScheduleData(null)
    try {
      const res = await getStaffSchedule(staffId, token)
      setScheduleData(res.schedule)
    } catch (err: unknown) {
      setScheduleError((err as Error).message)
    } finally {
      setScheduleLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>Azafato</h2>

      {/* ── Supabase test badge (easy to remove) ── */}
      <p style={styles.supabaseBadge}>
        {supabaseStatus === 'loading' && '⏳ Probando Supabase...'}
        {supabaseStatus === 'ok'      && '✅ Supabase OK'}
        {supabaseStatus === 'error'   && '❌ Supabase ERROR (mira consola)'}
      </p>

      {/* ── Check-in section ── */}
      <section style={styles.card}>
        <h3 style={styles.sectionTitle}>Tu estado ahora</h3>

        <div style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Event ID</label>
            <input
              style={eventFromUrl ? styles.inputLocked : styles.input}
              value={eventId}
              onChange={e => setEventId(e.target.value)}
              disabled={eventFromUrl}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Shift ID</label>
            <input
              style={shiftFromUrl ? styles.inputLocked : styles.input}
              value={shiftId}
              onChange={e => setShiftId(e.target.value)}
              disabled={shiftFromUrl}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Staff ID</label>
            <input
              style={staffFromUrl ? styles.inputLocked : styles.input}
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              disabled={staffFromUrl}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Token (Bearer)</label>
            <input
              style={tokenFromUrl ? styles.inputLocked : styles.input}
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              disabled={tokenFromUrl}
              placeholder="Pega tu token aquí"
            />
          </div>
        </div>

        <div style={styles.buttonRow}>
          <button
            style={{ ...styles.statusBtn, background: '#2563eb' }}
            onClick={() => handleCheckin('DESPIERTO')}
            disabled={checkinLoading}
          >
            Estoy despierto
          </button>
          <button
            style={{ ...styles.statusBtn, background: '#d97706' }}
            onClick={() => handleCheckin('DE_CAMINO')}
            disabled={checkinLoading}
          >
            Voy de camino
          </button>
          <button
            style={{ ...styles.statusBtn, background: '#16a34a' }}
            onClick={() => handleCheckin('EN_SITIO')}
            disabled={checkinLoading}
          >
            Estoy en sitio
          </button>
        </div>

        {checkinLoading && <p style={styles.hint}>Enviando...</p>}

        {checkinSuccess && (
          <div style={styles.checkinSuccessBox}>
            ✔ Check-in enviado · {STATUS_LABELS[checkinSuccess] ?? checkinSuccess}
          </div>
        )}

        {checkinResult && !checkinResult.ok && (
          <div style={{ ...styles.resultBox, borderColor: '#dc2626' }}>
            <p style={{ color: '#dc2626', fontWeight: 700, margin: '0 0 8px' }}>
              ✗ Error al enviar
            </p>
            <pre style={styles.pre}>{JSON.stringify(checkinResult.data, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* ── Mi horario section ── */}
      <section style={styles.card}>
        <div style={styles.scheduleHeader}>
          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Mi horario</h3>
          <button
            style={styles.loadBtn}
            onClick={handleLoadSchedule}
            disabled={scheduleLoading}
          >
            {scheduleLoading ? 'Cargando...' : 'Cargar mi horario'}
          </button>
        </div>

        {scheduleError && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {scheduleError}
          </div>
        )}

        {scheduleData !== null && (
          scheduleData.length === 0 ? (
            <p style={styles.emptyMsg}>Aún no tienes turnos asignados.</p>
          ) : (
            <>
              {/* Banner turno actual */}
              {(() => {
                const cur = scheduleData.find(it => it.eventId === eventId && it.shiftId === shiftId)
                if (!cur) return null
                return (
                  <div style={styles.currentBanner}>
                    <strong>Ahora:</strong>{' '}
                    {cur.eventName ?? cur.eventId} · {cur.shiftName ?? cur.shiftId} ·{' '}
                    <span style={{ ...styles.statusBadgeSm, background: STATUS_COLORS[cur.status] ?? '#6b7280' }}>
                      {cur.status}
                    </span>
                    {(cur.startsAt || cur.endsAt) && ` · ${fmtTime(cur.startsAt)} – ${fmtTime(cur.endsAt)}`}
                  </div>
                )
              })()}

              {/* Tarjetas */}
              <div style={styles.cardsGrid}>
                {scheduleData.map((item, i) => {
                  const isCurrent = item.eventId === eventId && item.shiftId === shiftId
                  const hasTime = !!(item.startsAt || item.endsAt)
                  return (
                    <div key={i} style={{ ...styles.shiftCard, ...(isCurrent ? styles.shiftCardCurrent : {}) }}>
                      <div style={styles.cardTop}>
                        <span style={{ ...styles.statusBadge, background: STATUS_COLORS[item.status] ?? '#6b7280' }}>
                          {item.status}
                        </span>
                      </div>
                      <p style={styles.cardEventName}>{item.eventName ?? item.eventId}</p>
                      {item.location && <p style={styles.cardLocation}>📍 {item.location}</p>}
                      <p style={styles.cardShiftName}>{item.shiftName ?? item.shiftId}</p>
                      <p style={styles.cardDate}>{fmtDate(item.startsAt)}</p>
                      {hasTime ? (
                        <p style={styles.cardTime}>{fmtTime(item.startsAt)} – {fmtTime(item.endsAt)}</p>
                      ) : (
                        <p style={styles.cardTimePending}>Horario pendiente</p>
                      )}
                      {item.statusTs && <p style={styles.cardUpdated}>Actualizado: {fmtDateTime(item.statusTs)}</p>}
                    </div>
                  )
                })}
              </div>
            </>
          )
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
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
  inputLocked: {
    padding: '9px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    background: '#f3f4f6',
    color: '#6b7280',
    cursor: 'not-allowed',
  },
  buttonRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  statusBtn: {
    flex: 1,
    minWidth: 140,
    padding: '12px 16px',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  hint: {
    color: '#9ca3af',
    fontStyle: 'italic',
    fontSize: 14,
    margin: '12px 0 0',
  },
  checkinSuccessBox: {
    marginTop: 16,
    background: '#f0fdf4',
    border: '1.5px solid #16a34a',
    borderRadius: 8,
    padding: '14px 16px',
    color: '#15803d',
    fontWeight: 700,
    fontSize: 15,
  },
  resultBox: {
    marginTop: 16,
    border: '1.5px solid',
    borderRadius: 8,
    padding: 16,
    background: '#f9fafb',
  },
  pre: {
    margin: 0,
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    background: '#f3f4f6',
    padding: 10,
    borderRadius: 6,
  },
  scheduleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  loadBtn: {
    padding: '9px 20px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#dc2626',
    fontSize: 14,
    marginBottom: 8,
  },
  emptyMsg: {
    color: '#6b7280',
    fontSize: 14,
    fontStyle: 'italic',
    padding: '8px 0',
  },
  currentBanner: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    color: '#1e40af',
    marginBottom: 16,
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 16,
  },
  shiftCard: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  shiftCardCurrent: {
    background: '#eff6ff',
    border: '1px solid #93c5fd',
    borderLeft: '4px solid #2563eb',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  cardEventName: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#111827',
  },
  cardShiftName: {
    margin: 0,
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  cardDate: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    textTransform: 'capitalize',
  },
  cardTime: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: '#2563eb',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  cardTimePending: {
    margin: 0,
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  cardLocation: {
    margin: '6px 0 0',
    fontSize: 13,
    color: '#374151',
  },
  cardUpdated: {
    margin: '8px 0 0',
    fontSize: 11,
    color: '#9ca3af',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 99,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
  },
  statusBadgeSm: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 99,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
  },
  // ── Supabase test badge (easy to remove) ──
  supabaseBadge: {
    margin: 0,
    fontSize: 13,
    color: '#6b7280',
  },
}
