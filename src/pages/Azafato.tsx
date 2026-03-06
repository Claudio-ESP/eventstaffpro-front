import { useEffect, useRef, useState } from 'react'
import { postCheckin, postIncident, getStaffSchedule, CheckinPayload, IncidentPayload, ScheduleItem } from '../api'
import { supabase } from '../supabase'

type Status = CheckinPayload['status']
type IncidentType = IncidentPayload['type']

const STATUS_LABELS: Record<string, string> = {
  DESPIERTO: 'Despierto',
  DE_CAMINO: 'De camino',
  EN_SITIO: 'En sitio',
}

const STATUS_COLORS: Record<string, string> = {
  DESPIERTO: '#2563eb',
  DE_CAMINO: '#d97706',
  EN_SITIO:  '#16a34a',
  SIN_ESTADO: '#475569',
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

  // ── Check-in state ────────────────────────────────────────────────────────
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [checkinResult, setCheckinResult] = useState<{ ok: boolean; data: unknown } | null>(null)
  const [checkinSuccess, setCheckinSuccess] = useState<Status | null>(null)
  const checkinSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Schedule state ────────────────────────────────────────────────────────
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleData, setScheduleData] = useState<ScheduleItem[] | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // ── Supabase test (easy to remove) ───────────────────────────────────────
  const [supabaseStatus, setSupabaseStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    const testSupabase = async () => {
      try {
        const { data, error } = await supabase.from('agencies').select('*').limit(1)
        if (error) { console.error('Supabase test error', error); setSupabaseStatus('error') }
        else { console.log('Supabase test OK', data); setSupabaseStatus('ok') }
      } catch (err) {
        console.error('Supabase unexpected error', err)
        setSupabaseStatus('error')
      }
    }
    testSupabase()
  }, [])
  // ─────────────────────────────────────────────────────────────────────────

  // ── NEW: Incident state ───────────────────────────────────────────────────
  const [incidentType, setIncidentType] = useState<IncidentType>('INCIDENCIA')
  const [incidentMessage, setIncidentMessage] = useState('')
  const [incidentLoading, setIncidentLoading] = useState(false)
  const [incidentOk, setIncidentOk] = useState(false)
  const [incidentError, setIncidentError] = useState<string | null>(null)
  // ─────────────────────────────────────────────────────────────────────────

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

  // ── NEW: Send incident ────────────────────────────────────────────────────
  async function handleSendIncident() {
    if (!incidentMessage.trim()) return
    if (!token) { setIncidentError('El token no puede estar vacío.'); return }
    setIncidentLoading(true)
    setIncidentOk(false)
    setIncidentError(null)
    try {
      await postIncident(token, { eventId, shiftId, staffId, type: incidentType, message: incidentMessage.trim() })
      setIncidentOk(true)
      setIncidentMessage('')
      setTimeout(() => setIncidentOk(false), 3500)
    } catch (err: unknown) {
      setIncidentError((err as Error).message)
    } finally {
      setIncidentLoading(false)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>

      {/* ── Supabase test badge (easy to remove) ── */}
      <p style={S.supabaseBadge}>
        {supabaseStatus === 'loading' && '⏳ Probando conexión...'}
        {supabaseStatus === 'ok'      && ''}
        {supabaseStatus === 'error'   && '⚠ Error de conexión (ver consola)'}
      </p>

      {/* ── TU ESTADO AHORA ─────────────────────────────────────────────── */}
      <section style={S.card}>
        <h3 style={S.sectionTitle}>Tu estado ahora</h3>

        <div style={S.form}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Event ID</label>
            <input
              style={eventFromUrl ? S.inputLocked : S.input}
              value={eventId}
              onChange={e => setEventId(e.target.value)}
              disabled={eventFromUrl}
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Shift ID</label>
            <input
              style={shiftFromUrl ? S.inputLocked : S.input}
              value={shiftId}
              onChange={e => setShiftId(e.target.value)}
              disabled={shiftFromUrl}
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Staff ID</label>
            <input
              style={staffFromUrl ? S.inputLocked : S.input}
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              disabled={staffFromUrl}
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Token (Bearer)</label>
            <input
              style={tokenFromUrl ? S.inputLocked : S.input}
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              disabled={tokenFromUrl}
              placeholder="Pega tu token aquí"
            />
          </div>
        </div>

        <div style={S.buttonRow}>
          <button
            style={{ ...S.statusBtn, background: '#2563eb' }}
            onClick={() => handleCheckin('DESPIERTO')}
            disabled={checkinLoading}
          >
            Estoy despierto
          </button>
          <button
            style={{ ...S.statusBtn, background: '#d97706' }}
            onClick={() => handleCheckin('DE_CAMINO')}
            disabled={checkinLoading}
          >
            Voy de camino
          </button>
          <button
            style={{ ...S.statusBtn, background: '#16a34a' }}
            onClick={() => handleCheckin('EN_SITIO')}
            disabled={checkinLoading}
          >
            Estoy en sitio
          </button>
        </div>

        {checkinLoading && <p style={S.hint}>Enviando...</p>}

        {checkinSuccess && (
          <div style={S.successBox}>
            ✔ Check-in enviado · {STATUS_LABELS[checkinSuccess] ?? checkinSuccess}
          </div>
        )}

        {checkinResult && !checkinResult.ok && (
          <div style={S.errorBox}>
            <p style={{ color: '#f87171', fontWeight: 700, margin: '0 0 8px' }}>
              ✗ Error al enviar
            </p>
            <pre style={S.pre}>{JSON.stringify(checkinResult.data, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* ── MI HORARIO ──────────────────────────────────────────────────── */}
      <section style={S.card}>
        <div style={S.scheduleHeader}>
          <h3 style={{ ...S.sectionTitle, margin: 0 }}>Mi horario</h3>
          <button
            style={S.actionBtn}
            onClick={handleLoadSchedule}
            disabled={scheduleLoading}
          >
            {scheduleLoading ? 'Cargando...' : 'Cargar mi horario'}
          </button>
        </div>

        {scheduleError && (
          <div style={S.errorBox}>
            <strong>Error:</strong> {scheduleError}
          </div>
        )}

        {scheduleData !== null && (
          scheduleData.length === 0 ? (
            <p style={S.emptyMsg}>Aún no tienes turnos asignados.</p>
          ) : (
            <>
              {/* Banner turno actual */}
              {(() => {
                const cur = scheduleData.find(it => it.eventId === eventId && it.shiftId === shiftId)
                if (!cur) return null
                return (
                  <div style={S.currentBanner}>
                    <strong>Ahora:</strong>{' '}
                    {cur.eventName ?? cur.eventId} · {cur.shiftName ?? cur.shiftId} ·{' '}
                    <span style={{ ...S.statusBadgeSm, background: STATUS_COLORS[cur.status] ?? '#475569' }}>
                      {cur.status}
                    </span>
                    {(cur.startsAt || cur.endsAt) && ` · ${fmtTime(cur.startsAt)} – ${fmtTime(cur.endsAt)}`}
                  </div>
                )
              })()}

              {/* Tarjetas de turno */}
              <div style={S.cardsGrid}>
                {scheduleData.map((item, i) => {
                  const isCurrent = item.eventId === eventId && item.shiftId === shiftId
                  const hasTime = !!(item.startsAt || item.endsAt)
                  return (
                    <div key={i} style={{ ...S.shiftCard, ...(isCurrent ? S.shiftCardCurrent : {}) }}>
                      <div style={S.cardTop}>
                        <span style={{ ...S.statusBadge, background: STATUS_COLORS[item.status] ?? '#475569' }}>
                          {item.status}
                        </span>
                      </div>
                      <p style={S.cardEventName}>{item.eventName ?? item.eventId}</p>
                      {item.location && <p style={S.cardLocation}>📍 {item.location}</p>}
                      <p style={S.cardShiftName}>{item.shiftName ?? item.shiftId}</p>
                      <p style={S.cardDate}>{fmtDate(item.startsAt)}</p>
                      {hasTime ? (
                        <p style={S.cardTime}>{fmtTime(item.startsAt)} – {fmtTime(item.endsAt)}</p>
                      ) : (
                        <p style={S.cardTimePending}>Horario pendiente</p>
                      )}
                      {item.statusTs && <p style={S.cardUpdated}>Actualizado: {fmtDateTime(item.statusTs)}</p>}
                    </div>
                  )
                })}
              </div>
            </>
          )
        )}
      </section>

      {/* ── NEW: INCIDENCIAS ─────────────────────────────────────────────── */}
      <section style={S.card}>
        <h3 style={S.sectionTitle}>Incidencias</h3>

        {/* Selector de tipo */}
        <div style={S.fieldGroup}>
          <label style={S.label}>Tipo</label>
          <select
            style={S.input}
            value={incidentType}
            onChange={e => setIncidentType(e.target.value as IncidentType)}
          >
            <option value="INCIDENCIA">Incidencia</option>
            <option value="DEMORA">Demora</option>
          </select>
        </div>

        {/* Textarea */}
        <div style={{ ...S.fieldGroup, marginTop: 12 }}>
          <label style={S.label}>Descripción</label>
          <textarea
            style={S.textarea}
            placeholder="Escribe aquí la incidencia o demora..."
            value={incidentMessage}
            onChange={e => setIncidentMessage(e.target.value)}
            rows={4}
          />
        </div>

        {/* Botón enviar */}
        <button
          style={{ ...S.actionBtn, marginTop: 14, width: '100%', justifyContent: 'center' }}
          onClick={handleSendIncident}
          disabled={incidentLoading || !incidentMessage.trim()}
        >
          {incidentLoading ? 'Enviando...' : 'Enviar incidencia'}
        </button>

        {/* Feedback éxito */}
        {incidentOk && (
          <div style={S.successBox}>
            ✔ Incidencia enviada correctamente
          </div>
        )}

        {/* Feedback error */}
        {incidentError && (
          <div style={{ ...S.errorBox, marginTop: 12 }}>
            <strong>Error:</strong> {incidentError}
          </div>
        )}
      </section>
      {/* ── END: INCIDENCIAS ─────────────────────────────────────────────── */}

    </div>
  )
}

// ── Dark premium styles (matching IRIA dashboard) ─────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },

  // Card — matches IRIA's dark card
  card: {
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '22px 24px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginTop: 0,
    marginBottom: 18,
  },

  // Form grid
  form: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px 16px',
    marginBottom: 20,
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
    border: '1px solid #1e293b',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    background: '#0b1020',
    color: '#e2e8f0',
  },
  inputLocked: {
    padding: '9px 12px',
    border: '1px solid #1e293b',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    background: '#0b1020',
    color: '#334155',
    cursor: 'not-allowed',
    opacity: 0.7,
  },

  // NEW: Textarea — same dark style as input
  textarea: {
    padding: '10px 12px',
    border: '1px solid #1e293b',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    background: '#0b1020',
    color: '#e2e8f0',
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: 1.6,
  },

  // Status buttons — unchanged behavior, dark-compatible colors
  buttonRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  statusBtn: {
    flex: 1,
    minWidth: 140,
    padding: '13px 16px',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.01em',
  },

  // Generic action button (indigo, matches IRIA's btnIndigo)
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '9px 20px',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },

  hint: {
    color: '#475569',
    fontStyle: 'italic',
    fontSize: 14,
    margin: '12px 0 0',
  },

  // Success box — dark green tint (matches IRIA's btnDone palette)
  successBox: {
    marginTop: 14,
    background: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.25)',
    borderRadius: 8,
    padding: '13px 16px',
    color: '#86efac',
    fontWeight: 700,
    fontSize: 15,
  },

  // Error box — dark red tint
  errorBox: {
    marginTop: 12,
    background: 'rgba(239,68,68,0.07)',
    border: '1px solid rgba(239,68,68,0.22)',
    borderRadius: 8,
    padding: '12px 14px',
    color: '#f87171',
    fontSize: 14,
  },

  pre: {
    margin: '8px 0 0',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    background: '#0b1020',
    color: '#64748b',
    padding: 10,
    borderRadius: 6,
  },

  // Schedule header row
  scheduleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    flexWrap: 'wrap',
    gap: 12,
  },

  emptyMsg: {
    color: '#334155',
    fontSize: 14,
    fontStyle: 'italic',
    padding: '8px 0',
    margin: 0,
  },

  // Current shift banner — indigo tint (matches IRIA's indigo accent)
  currentBanner: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    background: 'rgba(99,102,241,0.08)',
    border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    color: '#a5b4fc',
    marginBottom: 14,
    fontWeight: 600,
  },

  // Shift cards grid
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 14,
  },
  shiftCard: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  shiftCardCurrent: {
    background: 'rgba(99,102,241,0.06)',
    border: '1px solid rgba(99,102,241,0.25)',
    borderLeft: '4px solid #6366f1',
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
    color: '#f1f5f9',
  },
  cardShiftName: {
    margin: 0,
    fontSize: 13,
    color: '#475569',
    marginBottom: 6,
  },
  cardDate: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  cardTime: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: '#6366f1',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  cardTimePending: {
    margin: 0,
    fontSize: 13,
    color: '#334155',
    fontStyle: 'italic',
  },
  cardLocation: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#64748b',
  },
  cardUpdated: {
    margin: '8px 0 0',
    fontSize: 11,
    color: '#334155',
  },

  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 99,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
  },
  statusBadgeSm: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 99,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
  },

  // Supabase test badge (easy to remove)
  supabaseBadge: {
    margin: 0,
    fontSize: 12,
    color: '#1e293b',
    minHeight: 16,
  },
}
