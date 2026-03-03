import { useEffect, useState } from 'react'
import { postCheckin, getStaffSchedule, CheckinPayload, ScheduleItem } from '../api'

type Status = CheckinPayload['status']

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default function Azafato() {
  const [eventId, setEventId] = useState('EVT001')
  const [shiftId, setShiftId] = useState('T1')
  const [staffId, setStaffId] = useState('STF01')
  const [token, setToken] = useState('')

  const [checkinLoading, setCheckinLoading] = useState(false)
  const [checkinResult, setCheckinResult] = useState<{ ok: boolean; data: unknown } | null>(null)

  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleData, setScheduleData] = useState<ScheduleItem[] | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  const urlParams = new URLSearchParams(window.location.search)
  const eventFromUrl = urlParams.has('eventId')
  const shiftFromUrl = urlParams.has('shiftId')
  const staffFromUrl = urlParams.has('staffId')
  const tokenFromUrl = urlParams.has('token')

  // Auto-fill inputs from URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const eid = params.get('eventId')
    const sid = params.get('shiftId')
    const stid = params.get('staffId')
    const t = params.get('token')
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
    try {
      const data = await postCheckin({ eventId, shiftId, staffId, status }, token)
      setCheckinResult({ ok: true, data })
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
      const res = await getStaffSchedule(token, staffId)
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
          {!tokenFromUrl && (
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
          )}
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

        {checkinResult && (
          <div style={{ ...styles.resultBox, borderColor: checkinResult.ok ? '#16a34a' : '#dc2626' }}>
            <p style={{ color: checkinResult.ok ? '#16a34a' : '#dc2626', fontWeight: 700, margin: '0 0 8px' }}>
              {checkinResult.ok ? '✓ Check-in enviado correctamente' : '✗ Error al enviar'}
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
            <p style={styles.hint}>No tienes turnos asignados.</p>
          ) : (
            <div style={styles.scheduleGrid}>
              {scheduleData.map((item, i) => (
                <div key={i} style={styles.shiftCard}>
                  <p style={styles.shiftEvent}>{item.eventName}</p>
                  <p style={styles.shiftTime}>
                    {item.startTime} – {item.endTime}
                  </p>
                  <p style={styles.shiftDate}>{formatDate(item.date)}</p>
                  {item.location && (
                    <p style={styles.shiftLocation}>📍 {item.location}</p>
                  )}
                </div>
              ))}
            </div>
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
  scheduleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16,
  },
  shiftCard: {
    background: '#f8faff',
    border: '1px solid #c7d7fe',
    borderLeft: '4px solid #4f46e5',
    borderRadius: 10,
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  shiftEvent: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#1e1b4b',
  },
  shiftTime: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: '#4f46e5',
    letterSpacing: '-0.02em',
  },
  shiftDate: {
    margin: 0,
    fontSize: 13,
    color: '#6b7280',
  },
  shiftLocation: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#374151',
  },
}
