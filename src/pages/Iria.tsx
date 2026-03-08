import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import {
  getEventStatus, getEventLinks, getEventInfo,
  adminUpsertEvent, adminUpsertShift, adminAssignStaff,
  adminUpsertStaff, adminListStaff, adminListEvents,
  adminListEventAssignments, adminUpdateShiftTime, adminUpdateAssignmentTime, adminRemoveAssignment,
  adminListIncidents,
  EventInfo, AdminStaff, EventItem, EventStatusResponse, EventLinksResponse, Assignment, StaffItem, IncidentRow,
} from '../api'

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  DESPIERTO: 'Despierto',
  DE_CAMINO: 'De camino',
  EN_SITIO: 'En sitio',
  SIN_ESTADO: 'Sin estado',
}
const STATUS_COLORS: Record<string, string> = {
  DESPIERTO: '#3b82f6',
  DE_CAMINO: '#f59e0b',
  EN_SITIO: '#22c55e',
  SIN_ESTADO: '#334155',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateEventId(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'EVT'
  return `${slug}${Date.now().toString(36).toUpperCase().slice(-5)}`
}

// ── Types ────────────────────────────────────────────────────────────────────
interface IndividualSched { date: string; startTime: string; endTime: string }
interface ChartSlice { color: string; value: number; label: string }
type ManageTab = 'all' | 'individual' | 'remove' | 'add'

// ── Incidents ────────────────────────────────────────────────────────────────
// IncidentRow is imported from api.ts
interface IncidentCounts {
  total: number
  demora: number
  incidencia: number
  rows: IncidentRow[]
}

/**
 * Loads incidents for a given event.
 *
 * PRIMARY path  → adminListIncidents (admin Edge Function, service_role, bypasses RLS).
 * FALLBACK path → direct Supabase query (requires SELECT policy on incidents for anon role).
 *
 * Root cause of "always 0": Supabase RLS silently returns [] for anon when no policy exists.
 * If the fallback also returns 0, add this policy in the Supabase SQL editor:
 *   CREATE POLICY "anon_read_incidents" ON incidents FOR SELECT TO anon USING (true);
 */
async function fetchIncidents(token: string, evtId: string): Promise<IncidentCounts> {
  console.log('[incidents] selectedEventId real:', evtId)

  let rows: IncidentRow[] = []
  let adminOk = false

  // ── PRIMARY: admin backend (service_role → bypasses RLS) ──────────────────
  // NOTE: if backend returns HTTP 200 but action is not implemented it will
  // return an empty array WITHOUT throwing — so we check rows.length too.
  try {
    rows = await adminListIncidents(token, evtId)
    console.log('[incidents] admin backend raw rows:', JSON.stringify(rows))
    if (rows.length > 0) {
      adminOk = true
    } else {
      console.warn(
        '[incidents] admin backend returned 0 rows.',
        '\n→ If "list-incidents" is not yet implemented in the admin Edge Function,',
        '\n  add it (see backend instructions in fetchIncidents comment).',
        '\n→ Falling back to Supabase direct query.'
      )
    }
  } catch (adminErr) {
    console.warn('[incidents] admin backend threw — falling back to Supabase direct:', adminErr)
  }

  // ── FALLBACK: direct Supabase anon query ──────────────────────────────────
  // Triggered if admin returned 0 rows OR threw an error.
  // Requires a SELECT policy on the incidents table for anon role:
  //   CREATE POLICY "anon_read_incidents" ON incidents FOR SELECT TO anon USING (true);
  if (!adminOk) {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('eventid', evtId)
      .order('created_at', { ascending: false })

    console.log('[incidents] Supabase fallback — error:', error?.message ?? null)
    console.log('[incidents] incidents raw rows:', JSON.stringify(data))

    if (error) {
      console.error('[incidents] Supabase error:', error.message)
    } else if (!data || data.length === 0) {
      console.warn(
        '[incidents] Supabase returned 0 rows for eventid:', evtId,
        '\n→ If there are rows in DB, RLS is blocking the anon key.',
        '\n→ Fix (Supabase SQL editor):',
        "\n    CREATE POLICY \"anon_read_incidents\" ON incidents FOR SELECT TO anon USING (true);",
        '\n→ Or implement action="list-incidents" in the admin Edge Function (service_role bypasses RLS).'
      )
    }

    rows = (data ?? []) as IncidentRow[]
  }

  const total = rows.length
  const demora = rows.filter(r => r.type === 'DEMORA').length
  const incidencia = rows.filter(r => r.type === 'INCIDENCIA').length

  console.log('[incidents] incidents total:', total)
  console.log('[incidents] demoraCount:', demora)
  console.log('[incidents] incidenciaCount:', incidencia)

  return { total, demora, incidencia, rows }
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Time helpers (Europe/Madrid ↔ UTC) ───────────────────────────────────────
//
// Spain uses CET (UTC+1, winter) and CEST (UTC+2, summer).
// All times the user types are interpreted as Europe/Madrid local time.
// All times stored in Supabase are UTC (timestamptz).
//
// SAVE direction  → madridToUtcIso()   converts user input to UTC before sending
// DISPLAY direction → isoToDateInput() / isoToTimeInput() show Madrid local time

/**
 * Converts a date + time entered by the user (Europe/Madrid) to a UTC ISO string.
 * Works regardless of the browser's own timezone. Handles DST automatically.
 *
 * Example (winter, UTC+1): madridToUtcIso("2026-03-08", "01:40") → "2026-03-08T00:40:00.000Z"
 * Example (summer, UTC+2): madridToUtcIso("2026-07-01", "01:40") → "2026-06-30T23:40:00.000Z"
 */
function madridToUtcIso(date: string, time: string): string | undefined {
  if (!date || !time) return undefined
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes]   = time.split(':').map(Number)

  // 1. Treat the user's numbers as UTC (a "fake" UTC timestamp)
  const fakeUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0)

  // 2. Ask Intl what Madrid's clock would show at that fake UTC instant
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(fakeUtcMs))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')

  // 3. Offset = how many minutes ahead Madrid is relative to our fake UTC
  const madridMinutes = (get('hour') % 24) * 60 + get('minute')
  const inputMinutes  = hours * 60 + minutes
  let offsetMinutes   = madridMinutes - inputMinutes
  // Normalize across midnight (Spain is at most UTC+2, never more than a few hours off)
  if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60
  if (offsetMinutes >  12 * 60) offsetMinutes -= 24 * 60

  // 4. Actual UTC = fake UTC minus the Madrid offset
  return new Date(fakeUtcMs - offsetMinutes * 60_000).toISOString()
}

/** Extracts the "YYYY-MM-DD" portion of a UTC ISO string, displayed in Madrid timezone. */
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Extracts the "HH:MM" portion of a UTC ISO string, displayed in Madrid timezone. */
function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value ?? '00'
  const m = parts.find(p => p.type === 'minute')?.value ?? '00'
  // Intl can return "24" for midnight — normalize to "00"
  return `${h === '24' ? '00' : h}:${m}`
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1140, margin: '0 auto', padding: '32px 24px 72px', display: 'flex', flexDirection: 'column', gap: 18 },
  blockHeader: { paddingBottom: 2 },
  blockTitle: { fontSize: 18, fontWeight: 800, color: '#e2e8f0', margin: '0 0 2px', letterSpacing: '-0.01em' },
  blockSubtitle: { fontSize: 13, color: '#334155', margin: 0 },
  card: { background: '#111827', border: '1px solid #1e293b', borderRadius: 14, padding: '22px 26px', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.01em' },
  sectionSubtitle: { fontSize: 12, color: '#475569', marginTop: 1 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' },
  input: { padding: '9px 12px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 14, color: '#e2e8f0', outline: 'none', width: '100%', boxSizing: 'border-box' },
  select: { padding: '9px 12px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 14, color: '#e2e8f0', cursor: 'pointer', outline: 'none' },
  muted: { fontSize: 13, color: '#475569', fontStyle: 'italic' },
  // Buttons
  btnPrimary: { padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSuccess: { padding: '9px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnIndigo: { padding: '9px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnOutline: { padding: '9px 16px', background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnOutlineSm: { padding: '6px 12px', background: 'transparent', color: '#64748b', border: '1px solid #1e293b', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDone: { padding: '9px 16px', background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'default', whiteSpace: 'nowrap' },
  btnGreen: { padding: '9px 16px', background: 'rgba(37,211,102,0.1)', color: '#25d366', border: '1px solid rgba(37,211,102,0.22)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnWa: { padding: '5px 10px', background: 'rgba(37,211,102,0.1)', color: '#25d366', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDanger: { padding: '7px 14px', background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnGhost: { padding: '6px 14px', background: 'transparent', color: '#64748b', border: '1px solid #1e293b', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  pillOn: { padding: '8px 18px', background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.28)', borderRadius: 99, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  pillOff: { padding: '8px 18px', background: 'transparent', color: '#334155', border: '1px solid #1e293b', borderRadius: 99, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  // Stats
  statCard: { flex: '1 1 110px', minWidth: 100, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 11, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  statValue: { fontSize: 30, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 },
  // Table
  tableWrapper: { overflowX: 'auto', borderRadius: 10, border: '1px solid #1e293b' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { background: '#0b1120', padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1e293b', whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', color: '#94a3b8', verticalAlign: 'middle', borderBottom: '1px solid #0f172a' },
  trEven: { background: '#111827' },
  trOdd: { background: '#0e1826' },
  linkInput: { width: '100%', padding: '5px 8px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11, color: '#64748b', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' },
  // Wizard
  wizardWrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  wizardStepTitle: { fontSize: 17, fontWeight: 700, color: '#e2e8f0', marginBottom: 20 },
  chip: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 99, fontSize: 13, color: '#a5b4fc', fontWeight: 500 },
  chipX: { background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 },
  modeTabActive: { padding: '8px 16px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  modeTabInactive: { padding: '8px 16px', background: 'transparent', color: '#475569', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  // Accordion
  accordion: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' },
}

// ── Small UI helpers ──────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...S.card, ...style }}>{children}</div>
}

function AlertBox({ type, children }: { type: 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const t = {
    error:   { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  color: '#fca5a5' },
    success: { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  color: '#86efac' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', color: '#fcd34d' },
  }[type]
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px', color: t.color, fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 99, background: STATUS_COLORS[status] ?? '#1e293b', color: '#fff', fontSize: 11, fontWeight: 700 }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ── SVG Donut chart ───────────────────────────────────────────────────────────
function DonutChart({ data, size = 170 }: { data: ChartSlice[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const cx = size / 2, cy = size / 2
  const outerR = size * 0.42, innerR = size * 0.27

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={(outerR + innerR) / 2} fill="none" stroke="#1e293b" strokeWidth={outerR - innerR} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="#334155" fontSize={Math.round(size * 0.08)}>Sin datos</text>
      </svg>
    )
  }

  const slices: { color: string; path: string }[] = []
  let cumAngle = -Math.PI / 2
  for (const d of data) {
    if (d.value <= 0) continue
    const angle = (d.value / total) * 2 * Math.PI
    const x1 = cx + outerR * Math.cos(cumAngle)
    const y1 = cy + outerR * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + outerR * Math.cos(cumAngle)
    const y2 = cy + outerR * Math.sin(cumAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const ix1 = cx + innerR * Math.cos(cumAngle - angle)
    const iy1 = cy + innerR * Math.sin(cumAngle - angle)
    const ix2 = cx + innerR * Math.cos(cumAngle)
    const iy2 = cy + innerR * Math.sin(cumAngle)
    slices.push({ color: d.color, path: `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z` })
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
      <circle cx={cx} cy={cy} r={innerR} fill="#0f172a" />
      <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="middle" fill="#f1f5f9" fontSize={Math.round(size * 0.13)} fontWeight="800">{total}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" dominantBaseline="middle" fill="#334155" fontSize={Math.round(size * 0.072)} letterSpacing="1">TOTAL</text>
    </svg>
  )
}

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 32 }}>
      {steps.map((label, i) => {
        const done = i + 1 < current, active = i + 1 === current
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 60 }}>
              <div style={{ width: 32, height: 32, borderRadius: 99, background: done ? '#16a34a' : active ? '#6366f1' : '#0f172a', border: `2px solid ${done ? '#16a34a' : active ? '#6366f1' : '#1e293b'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: done || active ? '#fff' : '#334155', transition: 'all 0.2s' }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: active ? '#e2e8f0' : done ? '#86efac' : '#334155', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap', textAlign: 'center' }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#16a34a' : '#1e293b', margin: '15px 4px 0', transition: 'background 0.3s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── EventWizard ───────────────────────────────────────────────────────────────
function EventWizard({ token, onComplete, onCancel }: {
  token: string
  onComplete: (eventId: string, eventName: string) => void
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)

  // Step 1
  const [evtName, setEvtName] = useState('')
  const [evtLocation, setEvtLocation] = useState('')

  // Step 2
  const [allStaff, setAllStaff] = useState<AdminStaff[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const [selectedStaff, setSelectedStaff] = useState<AdminStaff[]>([])

  // Step 3
  const [scheduleMode, setScheduleMode] = useState<'same' | 'individual'>('same')
  const [sharedDate, setSharedDate] = useState('')
  const [sharedStart, setSharedStart] = useState('')
  const [sharedEnd, setSharedEnd] = useState('')
  const [indivSchedules, setIndivSchedules] = useState<Record<string, IndividualSched>>({})

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [doneEventId, setDoneEventId] = useState('')

  useEffect(() => {
    if (!token) return
    setStaffLoading(true)
    adminListStaff(token).then(setAllStaff).catch(() => setAllStaff([])).finally(() => setStaffLoading(false))
  }, [token])

  useEffect(() => {
    setIndivSchedules(prev => {
      const next: Record<string, IndividualSched> = {}
      for (const s of selectedStaff) next[s.staffid] = prev[s.staffid] ?? { date: '', startTime: '', endTime: '' }
      return next
    })
  }, [selectedStaff])

  function toggleStaff(staff: AdminStaff) {
    setSelectedStaff(prev =>
      prev.some(s => s.staffid === staff.staffid)
        ? prev.filter(s => s.staffid !== staff.staffid)
        : [...prev, staff]
    )
  }

  async function handleCreate() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const eventId = generateEventId(evtName)
      await adminUpsertEvent(token, { eventId, name: evtName, ...(evtLocation ? { location: evtLocation } : {}) })

      if (scheduleMode === 'same') {
        const shiftId = `${eventId}S1`
        const startsAt = madridToUtcIso(sharedDate, sharedStart)
        const endsAt   = madridToUtcIso(sharedDate, sharedEnd)
        await adminUpsertShift(token, { eventId, shiftId, shiftName: 'Turno', ...(startsAt ? { startsAt } : {}), ...(endsAt ? { endsAt } : {}) })
        for (const staff of selectedStaff) {
          await adminAssignStaff(token, { eventId, shiftId, staffId: staff.staffid })
        }
      } else {
        for (const staff of selectedStaff) {
          const sched = indivSchedules[staff.staffid]
          const shiftId = `${eventId}${staff.staffid.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6)}`
          const startsAt = madridToUtcIso(sched?.date ?? '', sched?.startTime ?? '')
          const endsAt   = madridToUtcIso(sched?.date ?? '', sched?.endTime   ?? '')
          await adminUpsertShift(token, { eventId, shiftId, shiftName: staff.name, ...(startsAt ? { startsAt } : {}), ...(endsAt ? { endsAt } : {}) })
          await adminAssignStaff(token, { eventId, shiftId, staffId: staff.staffid })
        }
      }
      setDoneEventId(eventId)
      setDone(true)
    } catch (e) { setSubmitError((e as Error).message) }
    finally { setSubmitting(false) }
  }

  const filtered = allStaff.filter(s => !staffSearch || s.name.toLowerCase().includes(staffSearch.toLowerCase()))

  const step1Valid = evtName.trim().length > 0
  const step2Valid = selectedStaff.length > 0
  const step3Valid: boolean = scheduleMode === 'same'
    ? Boolean(sharedDate && sharedStart && sharedEnd)
    : selectedStaff.length > 0 && selectedStaff.every(s => {
        const sc = indivSchedules[s.staffid]
        return Boolean(sc?.date && sc?.startTime && sc?.endTime)
      })

  const canNext = (step === 1 && step1Valid) || (step === 2 && step2Valid) || (step === 3 && step3Valid)

  if (done) {
    return (
      <div style={S.wizardWrap}>
        <Card style={{ textAlign: 'center', padding: '52px 32px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
          <h2 style={{ color: '#86efac', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Evento creado correctamente</h2>
          <p style={{ color: '#e2e8f0', fontSize: 16, margin: '0 0 4px', fontWeight: 600 }}>{evtName}</p>
          {evtLocation && <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 4px' }}>📍 {evtLocation}</p>}
          <p style={{ color: '#334155', fontSize: 12, margin: '0 0 28px', fontFamily: 'monospace' }}>ID: {doneEventId}</p>
          <button style={{ ...S.btnIndigo, fontSize: 15, padding: '12px 32px' }} onClick={() => onComplete(doneEventId, evtName)}>
            Ver en dashboard →
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div style={S.wizardWrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 20, margin: 0 }}>✨ Crear nuevo evento</h2>
        <button style={S.btnGhost} onClick={onCancel}>✕ Cancelar</button>
      </div>

      <Card>
        <Stepper steps={['Datos del evento', 'Personal', 'Horarios', 'Confirmar']} current={step} />

        {/* STEP 1 — Datos del evento */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={S.wizardStepTitle}>Datos del evento</div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Nombre del evento *</label>
              <input style={S.input} value={evtName} onChange={e => setEvtName(e.target.value)} placeholder="Ej: Gala de fin de año 2025" autoFocus />
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Localización</label>
              <input style={S.input} value={evtLocation} onChange={e => setEvtLocation(e.target.value)} placeholder="Ej: IFEMA Madrid, Palacio de Congresos…" />
            </div>
          </div>
        )}

        {/* STEP 2 — Seleccionar staff */}
        {step === 2 && (
          <div>
            <div style={S.wizardStepTitle}>Seleccionar personal</div>
            <input
              style={{ ...S.input, marginBottom: 12 }}
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              placeholder="🔍 Buscar por nombre…"
            />
            {selectedStaff.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {selectedStaff.map(s => (
                  <div key={s.staffid} style={S.chip}>
                    {s.name}
                    <button style={S.chipX} onClick={() => toggleStaff(s)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {staffLoading ? (
              <div style={{ color: '#334155', fontSize: 13, padding: 16, textAlign: 'center' }}>Cargando personal…</div>
            ) : (
              <div style={{ border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ color: '#334155', fontSize: 13, padding: 20, textAlign: 'center' }}>
                    {allStaff.length === 0 ? 'No hay personal registrado. Añade azafatos primero.' : 'Sin resultados.'}
                  </div>
                ) : filtered.map(s => {
                  const sel = selectedStaff.some(x => x.staffid === s.staffid)
                  return (
                    <div key={s.staffid} onClick={() => toggleStaff(s)} style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid #0f172a', background: sel ? 'rgba(99,102,241,0.1)' : '#111827', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${sel ? '#6366f1' : '#1e293b'}`, background: sel ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, color: '#fff' }}>
                        {sel && '✓'}
                      </div>
                      <div>
                        <div style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 14 }}>{s.name}</div>
                        <div style={{ color: '#334155', fontSize: 12 }}>{s.phone}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {selectedStaff.length > 0 && (
              <div style={{ marginTop: 10, color: '#6366f1', fontSize: 13, fontWeight: 600 }}>
                {selectedStaff.length} persona{selectedStaff.length !== 1 ? 's' : ''} seleccionada{selectedStaff.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Horarios */}
        {step === 3 && (
          <div>
            <div style={S.wizardStepTitle}>Asignar horarios</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
              <button style={scheduleMode === 'same' ? S.modeTabActive : S.modeTabInactive} onClick={() => setScheduleMode('same')}>
                🕐 Mismo horario para todos
              </button>
              <button style={scheduleMode === 'individual' ? S.modeTabActive : S.modeTabInactive} onClick={() => setScheduleMode('individual')}>
                📋 Horario individual
              </button>
            </div>

            {scheduleMode === 'same' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Fecha *</label>
                  <input style={S.input} type="date" value={sharedDate} onChange={e => setSharedDate(e.target.value)} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Hora inicio *</label>
                  <input style={S.input} type="time" value={sharedStart} onChange={e => setSharedStart(e.target.value)} />
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Hora fin *</label>
                  <input style={S.input} type="time" value={sharedEnd} onChange={e => setSharedEnd(e.target.value)} />
                </div>
              </div>
            )}

            {scheduleMode === 'individual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedStaff.map(staff => (
                  <div key={staff.staffid} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{staff.name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div style={S.fieldGroup}>
                        <label style={S.label}>Fecha</label>
                        <input style={S.input} type="date" value={indivSchedules[staff.staffid]?.date ?? ''} onChange={e => setIndivSchedules(p => ({ ...p, [staff.staffid]: { ...p[staff.staffid], date: e.target.value } }))} />
                      </div>
                      <div style={S.fieldGroup}>
                        <label style={S.label}>Inicio</label>
                        <input style={S.input} type="time" value={indivSchedules[staff.staffid]?.startTime ?? ''} onChange={e => setIndivSchedules(p => ({ ...p, [staff.staffid]: { ...p[staff.staffid], startTime: e.target.value } }))} />
                      </div>
                      <div style={S.fieldGroup}>
                        <label style={S.label}>Fin</label>
                        <input style={S.input} type="time" value={indivSchedules[staff.staffid]?.endTime ?? ''} onChange={e => setIndivSchedules(p => ({ ...p, [staff.staffid]: { ...p[staff.staffid], endTime: e.target.value } }))} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 4 — Confirmar */}
        {step === 4 && (
          <div>
            <div style={S.wizardStepTitle}>Revisar y confirmar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Evento</div>
                <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 18 }}>{evtName}</div>
                {evtLocation && <div style={{ color: '#64748b', fontSize: 13, marginTop: 3 }}>📍 {evtLocation}</div>}
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Personal ({selectedStaff.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedStaff.map(s => (
                    <span key={s.staffid} style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, padding: '3px 10px', fontSize: 13, color: '#a5b4fc' }}>{s.name}</span>
                  ))}
                </div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Horarios</div>
                {scheduleMode === 'same' ? (
                  <div style={{ color: '#e2e8f0', fontSize: 14 }}>
                    <span style={{ color: '#64748b' }}>Todos: </span>{sharedDate} · {sharedStart} – {sharedEnd}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedStaff.map(s => {
                      const sc = indivSchedules[s.staffid]
                      return (
                        <div key={s.staffid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#cbd5e1', fontWeight: 500, fontSize: 13 }}>{s.name}</span>
                          <span style={{ color: '#475569', fontSize: 13 }}>{sc?.date} · {sc?.startTime} – {sc?.endTime}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            {submitError && <AlertBox type="error">{submitError}</AlertBox>}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, paddingTop: 20, borderTop: '1px solid #1e293b' }}>
          <button style={S.btnGhost} onClick={step > 1 ? () => setStep(s => s - 1) : onCancel}>
            {step > 1 ? '← Atrás' : 'Cancelar'}
          </button>
          {step < 4 && (
            <button
              style={{ ...S.btnIndigo, opacity: canNext ? 1 : 0.35, cursor: canNext ? 'pointer' : 'not-allowed' }}
              onClick={() => canNext && setStep(s => s + 1)}
              disabled={!canNext}
            >
              Siguiente →
            </button>
          )}
          {step === 4 && (
            <button style={{ ...S.btnSuccess, padding: '10px 28px', fontSize: 15 }} onClick={handleCreate} disabled={submitting}>
              {submitting ? '⏳ Creando…' : '🎉 Crear evento'}
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── IncidentsModal ────────────────────────────────────────────────────────────
function IncidentsModal({ incidents, onClose }: { incidents: IncidentCounts; onClose: () => void }) {
  function fmtMadridTime(iso: string): string {
    try {
      return new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso))
    } catch { return iso.slice(0, 16).replace('T', ' ') }
  }

  const I: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' },
    panel: { background: '#0d1525', border: '1px solid #1e293b', borderRadius: 14, width: '100%', maxWidth: 680, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #1e293b' },
    title: { color: '#f1f5f9', fontWeight: 800, fontSize: 18 },
    close: { background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 },
    body: { padding: '8px 0 16px' },
    tableWrapper: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { padding: '10px 16px', textAlign: 'left' as const, fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase' as const, letterSpacing: '0.07em', borderBottom: '1px solid #1e293b' },
    trEven: { background: 'transparent' },
    trOdd: { background: 'rgba(255,255,255,0.015)' },
    td: { padding: '11px 16px', color: '#94a3b8', verticalAlign: 'top' as const },
    emptyState: { color: '#334155', textAlign: 'center' as const, padding: '40px 0', fontSize: 14 },
  }

  return (
    <div style={I.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={I.panel}>
        <div style={I.header}>
          <div>
            <span style={I.title}>🚨 Incidencias del evento</span>
            <span style={{ marginLeft: 12, fontSize: 12, color: '#475569' }}>
              {incidents.total} {incidents.total === 1 ? 'reporte' : 'reportes'} ·{' '}
              <span style={{ color: '#f59e0b' }}>{incidents.demora} demora{incidents.demora !== 1 ? 's' : ''}</span>{' · '}
              <span style={{ color: '#f87171' }}>{incidents.incidencia} incidencia{incidents.incidencia !== 1 ? 's' : ''}</span>
            </span>
          </div>
          <button style={I.close} onClick={onClose}>×</button>
        </div>

        <div style={I.body}>
          {incidents.rows.length === 0 ? (
            <div style={I.emptyState}>Sin incidencias registradas para este evento.</div>
          ) : (
            <div style={I.tableWrapper}>
              <table style={I.table}>
                <thead>
                  <tr>
                    <th style={I.th}>Hora</th>
                    <th style={I.th}>Staff ID</th>
                    <th style={I.th}>Tipo</th>
                    <th style={I.th}>Mensaje</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.rows.map((row, i) => (
                    <tr key={row.incidentid} style={i % 2 === 0 ? I.trEven : I.trOdd}>
                      <td style={{ ...I.td, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', color: '#475569' }}>
                        {fmtMadridTime(row.created_at)}
                      </td>
                      <td style={{ ...I.td, fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
                        {row.staffid}
                      </td>
                      <td style={{ ...I.td, whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                          fontSize: 11, fontWeight: 700,
                          background: row.type === 'DEMORA' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                          color: row.type === 'DEMORA' ? '#fbbf24' : '#f87171',
                        }}>
                          {row.type}
                        </span>
                      </td>
                      <td style={{ ...I.td, color: '#e2e8f0' }}>{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ManagePersonalModal ───────────────────────────────────────────────────────
function ManagePersonalModal({
  token, eventId, onClose, onRefresh,
}: {
  token: string; eventId: string; onClose: () => void; onRefresh: () => void
}) {
  const [tab, setTab] = useState<ManageTab>('all')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Tab 1 — shift-level edits
  const [shiftEdits, setShiftEdits] = useState<Record<string, { date: string; start: string; end: string }>>({})
  const [shiftSaving, setShiftSaving] = useState<Record<string, boolean>>({})
  const [shiftDone, setShiftDone] = useState<Record<string, boolean>>({})
  const [shiftErrors, setShiftErrors] = useState<Record<string, string>>({})

  // Tab 2 — individual override edits
  const [indivEdits, setIndivEdits] = useState<Record<string, { date: string; start: string; end: string }>>({})
  const [indivSaving, setIndivSaving] = useState<Record<string, boolean>>({})
  const [indivDone, setIndivDone] = useState<Record<string, boolean>>({})
  const [indivErrors, setIndivErrors] = useState<Record<string, string>>({})

  // Tab 3 — remove
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [removeSaving, setRemoveSaving] = useState<Record<string, boolean>>({})
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({})

  // Tab 4 — add staff
  const [allStaff, setAllStaff] = useState<AdminStaff[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addShiftId, setAddShiftId] = useState('')
  const [addingSaving, setAddingSaving] = useState<Record<string, boolean>>({})
  const [addingDone, setAddingDone] = useState<Record<string, string>>({})  // staffid → shiftid
  const [addingErrors, setAddingErrors] = useState<Record<string, string>>({})

  async function loadAssignments() {
    setLoading(true); setLoadError(null)
    try {
      const list = await adminListEventAssignments(token, eventId)
      setAssignments(list)
      const newShiftEdits: Record<string, { date: string; start: string; end: string }> = {}
      const seen = new Set<string>()
      for (const a of list) {
        if (!seen.has(a.shiftid)) {
          seen.add(a.shiftid)
          newShiftEdits[a.shiftid] = {
            date: isoToDateInput(a.shift?.starts_at),
            start: isoToTimeInput(a.shift?.starts_at),
            end: isoToTimeInput(a.shift?.ends_at),
          }
        }
      }
      setShiftEdits(newShiftEdits)
      const newIndivEdits: Record<string, { date: string; start: string; end: string }> = {}
      for (const a of list) {
        newIndivEdits[a.assignmentid] = {
          date: isoToDateInput(a.starts_at_override ?? a.effective_starts_at),
          start: isoToTimeInput(a.starts_at_override ?? a.effective_starts_at),
          end: isoToTimeInput(a.ends_at_override ?? a.effective_ends_at),
        }
      }
      setIndivEdits(newIndivEdits)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAssignments() }, []) // eslint-disable-line

  // Load all staff when "add" tab is first opened
  useEffect(() => {
    if (tab !== 'add' || allStaff.length > 0 || staffLoading) return
    setStaffLoading(true)
    adminListStaff(token)
      .then(list => setAllStaff(list))
      .catch(() => {})
      .finally(() => setStaffLoading(false))
  }, [tab]) // eslint-disable-line

  // Auto-select first shift for "add" tab when assignments load
  useEffect(() => {
    if (!addShiftId && assignments.length > 0) {
      setAddShiftId(assignments[0].shiftid)
    }
  }, [assignments, addShiftId])

  const uniqueShifts = Object.values(
    assignments.reduce<Record<string, Assignment>>((acc, a) => { if (!acc[a.shiftid]) acc[a.shiftid] = a; return acc }, {})
  )

  async function handleAddStaff(staffId: string) {
    if (!addShiftId) return
    setAddingSaving(s => ({ ...s, [staffId]: true }))
    setAddingErrors(s => ({ ...s, [staffId]: '' }))
    try {
      await adminAssignStaff(token, { eventId, shiftId: addShiftId, staffId })
      setAddingDone(s => ({ ...s, [staffId]: addShiftId }))
      await loadAssignments()
      onRefresh()
    } catch (e) {
      setAddingErrors(s => ({ ...s, [staffId]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setAddingSaving(s => ({ ...s, [staffId]: false }))
    }
  }

  async function handleUpdateShift(shiftId: string) {
    const edit = shiftEdits[shiftId]
    setShiftSaving(s => ({ ...s, [shiftId]: true }))
    setShiftErrors(s => ({ ...s, [shiftId]: '' }))
    try {
      await adminUpdateShiftTime(token, {
        eventId, shiftId,
        startsAt: madridToUtcIso(edit.date, edit.start),
        endsAt: madridToUtcIso(edit.date, edit.end),
      })
      setShiftDone(s => ({ ...s, [shiftId]: true }))
      setTimeout(() => setShiftDone(s => ({ ...s, [shiftId]: false })), 2000)
      await loadAssignments(); onRefresh()
    } catch (e) {
      setShiftErrors(s => ({ ...s, [shiftId]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setShiftSaving(s => ({ ...s, [shiftId]: false }))
    }
  }

  async function handleUpdateIndividual(assignmentId: string) {
    const edit = indivEdits[assignmentId]
    setIndivSaving(s => ({ ...s, [assignmentId]: true }))
    setIndivErrors(s => ({ ...s, [assignmentId]: '' }))
    try {
      await adminUpdateAssignmentTime(token, {
        assignmentId,
        startsAt: madridToUtcIso(edit.date, edit.start),
        endsAt: madridToUtcIso(edit.date, edit.end),
      })
      setIndivDone(s => ({ ...s, [assignmentId]: true }))
      setTimeout(() => setIndivDone(s => ({ ...s, [assignmentId]: false })), 2000)
      await loadAssignments(); onRefresh()
    } catch (e) {
      setIndivErrors(s => ({ ...s, [assignmentId]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setIndivSaving(s => ({ ...s, [assignmentId]: false }))
    }
  }

  async function handleClearOverride(assignmentId: string) {
    setIndivSaving(s => ({ ...s, [assignmentId]: true }))
    setIndivErrors(s => ({ ...s, [assignmentId]: '' }))
    try {
      await adminUpdateAssignmentTime(token, { assignmentId, clearOverride: true })
      setIndivDone(s => ({ ...s, [assignmentId]: true }))
      setTimeout(() => setIndivDone(s => ({ ...s, [assignmentId]: false })), 2000)
      await loadAssignments(); onRefresh()
    } catch (e) {
      setIndivErrors(s => ({ ...s, [assignmentId]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setIndivSaving(s => ({ ...s, [assignmentId]: false }))
    }
  }

  async function handleRemove(assignmentId: string) {
    setRemoveSaving(s => ({ ...s, [assignmentId]: true }))
    setRemoveErrors(s => ({ ...s, [assignmentId]: '' }))
    try {
      await adminRemoveAssignment(token, assignmentId)
      setConfirmRemove(null)
      await loadAssignments(); onRefresh()
    } catch (e) {
      setRemoveErrors(s => ({ ...s, [assignmentId]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setRemoveSaving(s => ({ ...s, [assignmentId]: false }))
    }
  }

  const M: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' },
    panel: { background: '#0d1525', border: '1px solid #1e293b', borderRadius: 14, width: '100%', maxWidth: 720, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #1e293b' },
    title: { color: '#f1f5f9', fontWeight: 800, fontSize: 18 },
    close: { background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 },
    tabs: { display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 24px' },
    tabBtn: { padding: '12px 16px', border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1, letterSpacing: '0.04em' },
    body: { padding: 24 },
    shiftRow: { background: '#111827', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 18px', marginBottom: 12 },
    shiftName: { color: '#e2e8f0', fontWeight: 700, fontSize: 14, marginBottom: 10 },
    inlineForm: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
    fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
    fieldLabel: { color: '#475569', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' },
    inputSm: { background: '#0b1020', border: '1px solid #1e293b', borderRadius: 6, color: '#e2e8f0', padding: '6px 10px', fontSize: 13, outline: 'none' },
    badge: { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 },
    personRow: { background: '#111827', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 18px', marginBottom: 10 },
    personName: { color: '#e2e8f0', fontWeight: 700, fontSize: 14 },
    personSub: { color: '#475569', fontSize: 12, marginTop: 2, marginBottom: 10 },
    removeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#111827', border: '1px solid #1e293b', borderRadius: 10, marginBottom: 10 },
    errText: { color: '#f87171', fontSize: 12, marginTop: 6 },
    emptyState: { color: '#334155', textAlign: 'center', padding: '40px 0', fontSize: 14 },
  }

  const TABS: { id: ManageTab; label: string }[] = [
    { id: 'all', label: '⏱ Aplicar a todos' },
    { id: 'individual', label: '✏️ Individual' },
    { id: 'remove', label: '🗑 Quitar azafato' },
    { id: 'add', label: '➕ Añadir azafato' },
  ]

  // Derived for tab 4
  const assignedByShift = assignments.reduce<Record<string, Set<string>>>((acc, a) => {
    if (!acc[a.shiftid]) acc[a.shiftid] = new Set()
    acc[a.shiftid].add(a.staffid)
    return acc
  }, {})
  const assignedStaffIds = new Set(assignments.map(a => a.staffid))
  function assignStatus(staffId: string): 'same-shift' | 'other-shift' | 'none' {
    if (!assignedStaffIds.has(staffId)) return 'none'
    if (addShiftId && assignedByShift[addShiftId]?.has(staffId)) return 'same-shift'
    return 'other-shift'
  }
  const filteredStaff = allStaff.filter(s =>
    !addSearch || s.name.toLowerCase().includes(addSearch.toLowerCase())
  )

  return (
    <div style={M.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={M.panel}>
        <div style={M.header}>
          <span style={M.title}>⚙️ Gestionar personal</span>
          <button style={M.close} onClick={onClose}>×</button>
        </div>

        <div style={M.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              style={{ ...M.tabBtn, color: tab === t.id ? '#6366f1' : '#475569', borderBottomColor: tab === t.id ? '#6366f1' : 'transparent' }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={M.body}>
          {loading && <div style={M.emptyState}>Cargando asignaciones…</div>}
          {loadError && <div style={{ ...M.errText, textAlign: 'center', padding: '20px 0' }}>{loadError}</div>}

          {!loading && !loadError && assignments.length === 0 && tab !== 'add' && (
            <div style={M.emptyState}>No hay asignaciones para este evento.</div>
          )}

          {/* ── Tab 1: Aplicar a todos ───────────────────────────────────── */}
          {!loading && !loadError && tab === 'all' && assignments.length > 0 && (
            <div>
              <p style={{ color: '#475569', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                Establece el horario de un turno completo. Afecta a todos los azafatos del turno (salvo que tengan override individual).
              </p>
              {uniqueShifts.map(a => {
                const sid = a.shiftid
                const edit = shiftEdits[sid] ?? { date: '', start: '', end: '' }
                const saving = shiftSaving[sid]
                const done = shiftDone[sid]
                const err = shiftErrors[sid]
                const staffInShift = assignments.filter(x => x.shiftid === sid)
                return (
                  <div key={sid} style={M.shiftRow}>
                    <div style={M.shiftName}>
                      {a.shift?.name ?? sid}
                      <span style={{ color: '#334155', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                        {staffInShift.length} persona{staffInShift.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={M.inlineForm}>
                      <div style={M.fieldGroup}>
                        <span style={M.fieldLabel}>Fecha</span>
                        <input type="date" style={M.inputSm} value={edit.date}
                          onChange={e => setShiftEdits(s => ({ ...s, [sid]: { ...edit, date: e.target.value } }))} />
                      </div>
                      <div style={M.fieldGroup}>
                        <span style={M.fieldLabel}>Inicio</span>
                        <input type="time" style={M.inputSm} value={edit.start}
                          onChange={e => setShiftEdits(s => ({ ...s, [sid]: { ...edit, start: e.target.value } }))} />
                      </div>
                      <div style={M.fieldGroup}>
                        <span style={M.fieldLabel}>Fin</span>
                        <input type="time" style={M.inputSm} value={edit.end}
                          onChange={e => setShiftEdits(s => ({ ...s, [sid]: { ...edit, end: e.target.value } }))} />
                      </div>
                      <button
                        style={{ ...S.btnPrimary, alignSelf: 'flex-end', opacity: saving ? 0.6 : 1 }}
                        onClick={() => handleUpdateShift(sid)}
                        disabled={saving}
                      >
                        {done ? '✅ Guardado' : saving ? '⏳…' : 'Actualizar turno'}
                      </button>
                    </div>
                    {err && <div style={M.errText}>{err}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Tab 2: Individual ────────────────────────────────────────── */}
          {!loading && !loadError && tab === 'individual' && assignments.length > 0 && (
            <div>
              <p style={{ color: '#475569', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                Override de horario por persona. Si se establece, tiene prioridad sobre el horario del turno.
              </p>
              {assignments.map(a => {
                const aid = a.assignmentid
                const edit = indivEdits[aid] ?? { date: '', start: '', end: '' }
                const saving = indivSaving[aid]
                const done = indivDone[aid]
                const err = indivErrors[aid]
                const hasOverride = !!(a.starts_at_override || a.ends_at_override)
                return (
                  <div key={aid} style={M.personRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={M.personName}>{a.staff?.name ?? a.staffid}</span>
                      <span style={{
                        ...M.badge,
                        background: hasOverride ? 'rgba(99,102,241,0.15)' : 'rgba(51,65,85,0.4)',
                        color: hasOverride ? '#a5b4fc' : '#475569',
                      }}>
                        {hasOverride ? 'Personalizado' : 'General'}
                      </span>
                    </div>
                    <div style={M.personSub}>
                      Turno: {a.shift?.name ?? a.shiftid}
                      {a.staff?.phone ? ` · ${a.staff.phone}` : ''}
                    </div>
                    <div style={M.inlineForm}>
                      <div style={M.fieldGroup}>
                        <span style={M.fieldLabel}>Fecha</span>
                        <input type="date" style={M.inputSm} value={edit.date}
                          onChange={e => setIndivEdits(s => ({ ...s, [aid]: { ...edit, date: e.target.value } }))} />
                      </div>
                      <div style={M.fieldGroup}>
                        <span style={M.fieldLabel}>Inicio</span>
                        <input type="time" style={M.inputSm} value={edit.start}
                          onChange={e => setIndivEdits(s => ({ ...s, [aid]: { ...edit, start: e.target.value } }))} />
                      </div>
                      <div style={M.fieldGroup}>
                        <span style={M.fieldLabel}>Fin</span>
                        <input type="time" style={M.inputSm} value={edit.end}
                          onChange={e => setIndivEdits(s => ({ ...s, [aid]: { ...edit, end: e.target.value } }))} />
                      </div>
                      <button
                        style={{ ...S.btnPrimary, alignSelf: 'flex-end', opacity: saving ? 0.6 : 1 }}
                        onClick={() => handleUpdateIndividual(aid)}
                        disabled={saving}
                      >
                        {done ? '✅' : saving ? '⏳' : 'Aplicar'}
                      </button>
                      {hasOverride && (
                        <button
                          style={{ ...S.btnOutline, alignSelf: 'flex-end', opacity: saving ? 0.6 : 1 }}
                          onClick={() => handleClearOverride(aid)}
                          disabled={saving}
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                    {err && <div style={M.errText}>{err}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Tab 4: Añadir azafato ────────────────────────────────────── */}
          {!loading && !loadError && tab === 'add' && (
            <div>
              <p style={{ color: '#475569', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                Añade personal de la base de datos a este evento. Selecciona el turno y pulsa Añadir.
              </p>

              {uniqueShifts.length === 0 ? (
                <div style={M.emptyState}>No hay turnos definidos en este evento todavía.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div style={{ ...M.fieldGroup, flex: '1 1 200px' }}>
                      <span style={M.fieldLabel}>Turno destino</span>
                      <select
                        style={{ ...M.inputSm, width: '100%' }}
                        value={addShiftId}
                        onChange={e => setAddShiftId(e.target.value)}
                      >
                        {uniqueShifts.map(a => (
                          <option key={a.shiftid} value={a.shiftid}>
                            {a.shift?.name ?? a.shiftid}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ ...M.fieldGroup, flex: '2 1 260px' }}>
                      <span style={M.fieldLabel}>Buscar por nombre</span>
                      <input
                        style={M.inputSm}
                        placeholder="Escribe un nombre…"
                        value={addSearch}
                        onChange={e => setAddSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {staffLoading && <div style={M.emptyState}>Cargando personal…</div>}
                  {!staffLoading && filteredStaff.length === 0 && (
                    <div style={M.emptyState}>{allStaff.length === 0 ? 'No hay azafatos en la base de datos.' : 'Sin resultados.'}</div>
                  )}
                  {!staffLoading && filteredStaff.map(staff => {
                    const status = assignStatus(staff.staffid)
                    const saving = addingSaving[staff.staffid]
                    const doneShift = addingDone[staff.staffid]
                    const err = addingErrors[staff.staffid]
                    const justAdded = doneShift === addShiftId
                    return (
                      <div key={staff.staffid} style={{ ...M.removeRow, alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{staff.name}</span>
                            {status === 'same-shift' && (
                              <span style={{ ...M.badge, background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>Ya asignado</span>
                            )}
                            {status === 'other-shift' && (
                              <span style={{ ...M.badge, background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>En otro turno</span>
                            )}
                          </div>
                          <div style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                            {staff.phone}
                            <span style={{ marginLeft: 10, color: '#1e293b', fontFamily: 'monospace', fontSize: 11 }}>{staff.staffid}</span>
                          </div>
                          {err && <div style={M.errText}>{err}</div>}
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {status === 'same-shift' ? (
                            <span style={{ color: '#334155', fontSize: 12 }}>—</span>
                          ) : justAdded ? (
                            <span style={{ ...M.badge, background: 'rgba(34,197,94,0.12)', color: '#86efac', padding: '6px 12px' }}>✅ Añadido</span>
                          ) : (
                            <button
                              style={{ ...S.btnPrimary, fontSize: 13, padding: '7px 14px', opacity: saving ? 0.6 : 1 }}
                              onClick={() => handleAddStaff(staff.staffid)}
                              disabled={saving}
                            >
                              {saving ? '⏳…' : '+ Añadir'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* ── Tab 3: Quitar azafato ────────────────────────────────────── */}
          {!loading && !loadError && tab === 'remove' && assignments.length > 0 && (
            <div>
              <p style={{ color: '#475569', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                Elimina la asignación de un azafato a este evento.
              </p>
              {assignments.map(a => {
                const aid = a.assignmentid
                const saving = removeSaving[aid]
                const err = removeErrors[aid]
                const isConfirming = confirmRemove === aid
                return (
                  <div key={aid} style={M.removeRow}>
                    <div>
                      <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{a.staff?.name ?? a.staffid}</span>
                      <span style={{ color: '#334155', fontSize: 12, marginLeft: 8 }}>Turno: {a.shift?.name ?? a.shiftid}</span>
                      {err && <div style={M.errText}>{err}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {isConfirming ? (
                        <>
                          <span style={{ color: '#f87171', fontSize: 12, fontWeight: 600 }}>¿Confirmar?</span>
                          <button
                            style={{ ...S.btnDanger, opacity: saving ? 0.6 : 1 }}
                            onClick={() => handleRemove(aid)}
                            disabled={saving}
                          >
                            {saving ? '⏳' : 'Sí, quitar'}
                          </button>
                          <button style={S.btnOutline} onClick={() => setConfirmRemove(null)} disabled={saving}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button style={S.btnDanger} onClick={() => setConfirmRemove(aid)}>
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── StaffDatabasePanel ────────────────────────────────────────────────────────
function StaffDatabasePanel({ token }: { token: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [advancedId, setAdvancedId] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const [list, setList] = useState<AdminStaff[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [search, setSearch] = useState('')

  async function loadList() {
    if (!token) return
    setListLoading(true)
    try { setList(await adminListStaff(token)) } catch { setList([]) } finally { setListLoading(false) }
  }

  async function handleSave() {
    if (!token) { setSaveError('Token requerido'); return }
    if (!name.trim() || !phone.trim()) { setSaveError('Nombre y teléfono son obligatorios'); return }
    setSaving(true); setSaveError(null); setSaveOk(false)
    try {
      await adminUpsertStaff(token, {
        ...(advancedId.trim() ? { staffId: advancedId.trim() } : {}),
        name: name.trim(), phone: phone.trim(), agencyId: 'AG01',
      })
      setSaveOk(true)
      setName(''); setPhone(''); setAdvancedId('')
      setTimeout(() => setSaveOk(false), 3000)
      loadList()
    } catch (e) { setSaveError((e as Error).message) }
    finally { setSaving(false) }
  }

  const filtered = list.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      {/* Add form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <div style={S.fieldGroup}>
          <label style={S.label}>Nombre *</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        <div style={S.fieldGroup}>
          <label style={S.label}>Teléfono *</label>
          <input style={S.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="600 000 000" onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button style={S.btnSuccess} onClick={handleSave} disabled={saving}>
          {saving ? '⏳ Guardando…' : '+ Añadir azafato'}
        </button>
        <button style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: 12, padding: 0 }} onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '▴ Ocultar avanzado' : '▾ Staff ID manual'}
        </button>
      </div>

      {showAdvanced && (
        <div style={{ ...S.fieldGroup, marginBottom: 10 }}>
          <label style={S.label}>Staff ID (opcional — se genera automáticamente si vacío)</label>
          <input style={{ ...S.input, maxWidth: 240 }} value={advancedId} onChange={e => setAdvancedId(e.target.value)} placeholder="STF001" />
        </div>
      )}

      {saveError && <AlertBox type="error">{saveError}</AlertBox>}
      {saveOk && <AlertBox type="success">Azafato añadido correctamente.</AlertBox>}

      {/* List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 10px' }}>
        <span style={{ color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Personal registrado</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...S.input, padding: '5px 10px', fontSize: 12, width: 150 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" />
          <button style={S.btnOutlineSm} onClick={loadList} disabled={listLoading}>{listLoading ? '…' : '🔄 Cargar'}</button>
        </div>
      </div>

      {list.length === 0 ? (
        <div style={{ color: '#1e293b', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          {listLoading ? 'Cargando…' : 'Pulsa "Cargar" para ver el personal registrado.'}
        </div>
      ) : (
        <div style={{ border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden' }}>
          {filtered.map((s, i) => (
            <div key={s.staffid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: i % 2 === 0 ? '#111827' : '#0e1826', borderBottom: '1px solid #0f172a' }}>
              <div style={{ width: 34, height: 34, borderRadius: 99, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 14 }}>{s.name}</div>
                <div style={{ color: '#334155', fontSize: 12 }}>{s.phone}</div>
              </div>
              <div style={{ color: '#1e293b', fontSize: 11, fontFamily: 'monospace' }}>{s.staffid}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Iria page ────────────────────────────────────────────────────────────
export default function Iria() {
  // Event state
  const [eventId, setEventId] = useState(() => localStorage.getItem('lastEventId') ?? '')
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') ?? '')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<EventStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Event list (for selector)
  const [eventList, setEventList] = useState<EventItem[]>([])
  const [eventListLoading, setEventListLoading] = useState(false)

  // Event info
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [eventInfoLoading, setEventInfoLoading] = useState(false)
  const [eventInfoError, setEventInfoError] = useState<string | null>(null)
  const [timeSinceLabel, setTimeSinceLabel] = useState('')

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(10000)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const loadingRef = useRef(false)

  // Links
  const [linksLoading, setLinksLoading] = useState(false)
  const [linksData, setLinksData] = useState<EventLinksResponse | null>(null)
  const [linksError, setLinksError] = useState<string | null>(null)
  const [copiedRows, setCopiedRows] = useState<Record<number, boolean>>({})
  const [copiedAll, setCopiedAll] = useState(false)
  const [waBlockedWarning, setWaBlockedWarning] = useState(false)
  const [showLinks, setShowLinks] = useState(false)

  // Assignments (source of truth for total staff count)
  const [assignments, setAssignments] = useState<Assignment[]>([])

  // ── NEW: Incidents ────────────────────────────────────────────────────────
  const [incidents, setIncidents] = useState<IncidentCounts | null>(null)
  // ─────────────────────────────────────────────────────────────────────────

  // UI sections
  const [showWizard, setShowWizard] = useState(false)
  const [showStaffDb, setShowStaffDb] = useState(false)
  const [showManagePanel, setShowManagePanel] = useState(false)
  const [showIncidentsModal, setShowIncidentsModal] = useState(false) // NEW

  // ── Effects (identical logic to Jefa.tsx) ────────────────────────────────
  useEffect(() => {
    if (!eventId.trim()) { setEventInfo(null); setEventInfoError(null); setEventInfoLoading(false); return }
    let cancelled = false
    setEventInfoLoading(true); setEventInfoError(null)
    const tid = setTimeout(async () => {
      try {
        const res = await getEventInfo(eventId)
        if (import.meta.env.DEV) console.log('[event-info]', res)
        if (cancelled) return
        setEventInfoLoading(false)
        if (res.ok && res.event) setEventInfo(res.event)
        else { setEventInfo(null); setEventInfoError('Evento no encontrado') }
      } catch (err: unknown) {
        if (cancelled) return
        setEventInfoLoading(false)
        const e = err as Error & { status?: number }
        setEventInfo(null)
        setEventInfoError(e.status === 404 ? 'Evento no encontrado' : (e.status === 401 || e.status === 403) ? 'Sin permisos' : 'Error al cargar evento')
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(tid) }
  }, [eventId])

  useEffect(() => {
    if (!lastRefreshed) return
    const calc = () => {
      const secs = Math.round((Date.now() - lastRefreshed.getTime()) / 1000)
      setTimeSinceLabel(`Actualizado hace ${secs}s`)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [lastRefreshed])

  useEffect(() => {
    if (!autoRefresh || !token || !eventId) return
    refreshStatus()
    const id = setInterval(() => refreshStatus(), refreshIntervalMs)
    return () => clearInterval(id)
  }, [autoRefresh, refreshIntervalMs, eventId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist token + eventId to localStorage
  useEffect(() => { if (token) localStorage.setItem('adminToken', token) }, [token])
  useEffect(() => { if (eventId) localStorage.setItem('lastEventId', eventId) }, [eventId])

  // Load event list when token changes
  useEffect(() => {
    if (!token.trim()) { setEventList([]); return }
    let cancelled = false
    setEventListLoading(true)
    const tid = setTimeout(async () => {
      try {
        const list = await adminListEvents(token)
        if (cancelled) return
        setEventList(list)
        // Auto-select: if only one event and current eventId not in list, select it
        if (list.length === 1) {
          setEventId(prev => list.some(e => e.eventid === prev) ? prev : list[0].eventid)
        }
      } catch { if (!cancelled) setEventList([]) }
      finally { if (!cancelled) setEventListLoading(false) }
    }, 400)
    return () => { cancelled = true; clearTimeout(tid) }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear stale data when event changes
  useEffect(() => {
    setData(null)
    setLinksData(null)
    setShowLinks(false)
    setError(null)
    setLinksError(null)
    setAssignments([])
    setIncidents(null) // clear incidents when switching event
  }, [eventId])

  // Auto-load incidents when event + token are ready
  useEffect(() => {
    if (!eventId || !token) return
    let cancelled = false
    const tid = setTimeout(async () => {
      try {
        const result = await fetchIncidents(token, eventId)
        if (!cancelled) setIncidents(result)
      } catch { /* ignore */ }
    }, 300)
    return () => { cancelled = true; clearTimeout(tid) }
  }, [eventId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function refreshStatus(clearData = false) {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true); setError(null)
    if (clearData) setData(null)
    try {
      const [statusRes, assignRes, incidentRes] = await Promise.allSettled([
        getEventStatus(token, eventId),
        adminListEventAssignments(token, eventId),
        fetchIncidents(token, eventId), // load incident counts in parallel
      ])
      if (statusRes.status === 'fulfilled') { setData(statusRes.value); setLastRefreshed(new Date()) }
      else throw statusRes.reason
      if (assignRes.status === 'fulfilled') setAssignments(assignRes.value)
      if (incidentRes.status === 'fulfilled') setIncidents(incidentRes.value) // NEW
    } catch (err: unknown) { setError((err as Error).message) }
    finally { loadingRef.current = false; setLoading(false) }
  }

  async function handleRefresh() {
    if (!token) { setError('El token no puede estar vacío.'); return }
    await refreshStatus(true)
  }

  async function handleLoadLinks() {
    if (!token) { setLinksError('El token no puede estar vacío.'); return }
    setLinksLoading(true); setLinksError(null); setLinksData(null); setCopiedRows({})
    try { setLinksData(await getEventLinks(token, eventId)) }
    catch (err: unknown) { setLinksError((err as Error).message) }
    finally { setLinksLoading(false) }
  }

  async function handleCopyAll() {
    if (!linksData) return
    const items = linksData.linksPorStaff
    const lines = [
      `Evento ${eventId}`,
      ...items.filter(it => it.staffTokenPresent && it.link).map(it => `- ${it.name || it.staffId} (${it.shiftId}): ${it.link}`)
    ]
    const missing = items.filter(it => !it.staffTokenPresent || !it.link)
    if (missing.length > 0) lines.push(`\nSin staffToken: ${missing.map(it => it.name || it.staffId).join(', ')}`)
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500) } catch { /* unavailable */ }
  }

  function handleDownloadCsv() {
    if (!linksData) return
    const header = 'staffId,name,phone,shiftId,status,link'
    const rows = linksData.linksPorStaff.map(it =>
      [it.staffId, it.name, it.phone, it.shiftId, it.status, it.link]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `event-links-${eventId}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function handleOpenAllWhatsApp() {
    if (!linksData) return
    const items = linksData.linksPorStaff.filter(it => it.waLink)
    if (!items.length) return
    setWaBlockedWarning(false)
    items.forEach((it, idx) => setTimeout(() => {
      const win = window.open(it.waLink!, '_blank')
      if (!win) setWaBlockedWarning(true)
    }, idx * 300))
  }

  async function handleCopy(link: string, index: number) {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedRows(prev => ({ ...prev, [index]: true }))
      setTimeout(() => setCopiedRows(prev => ({ ...prev, [index]: false })), 1500)
    } catch { /* unavailable */ }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const rows = data?.rows ?? []
  // Merge check-ins with full assignment list so all assigned staff appear in the table.
  // Staff without a check-in get status 'SIN_ESTADO'.
  const checkinMap = new Map(rows.map(r => [r.staffid, r]))
  const mergedRows: StaffItem[] = assignments.length > 0
    ? assignments.map(a => checkinMap.get(a.staffid) ?? {
        eventid: a.eventid,
        shiftid: a.shiftid,
        staffid: a.staffid,
        status: 'SIN_ESTADO',
        ts: '',
        staff: a.staff ?? undefined,
      })
    : rows  // fallback when assignments haven't loaded yet
  const counts = {
    EN_SITIO:  mergedRows.filter(r => r.status === 'EN_SITIO').length,
    DE_CAMINO: mergedRows.filter(r => r.status === 'DE_CAMINO').length,
    DESPIERTO: mergedRows.filter(r => r.status === 'DESPIERTO').length,
  }
  const noStatus = mergedRows.filter(r => r.status === 'SIN_ESTADO').length
  const chartData: ChartSlice[] = [
    { label: 'En sitio',  value: counts.EN_SITIO,  color: '#22c55e' },
    { label: 'De camino', value: counts.DE_CAMINO, color: '#f59e0b' },
    { label: 'Despierto', value: counts.DESPIERTO, color: '#3b82f6' },
    { label: 'Sin estado', value: noStatus,        color: '#1e293b' },
  ]

  // ── Wizard mode: replace full page ───────────────────────────────────────
  if (showWizard) {
    return (
      <div style={S.page}>
        <EventWizard
          token={token}
          onComplete={(evtId) => { setEventId(evtId); setShowWizard(false) }}
          onCancel={() => setShowWizard(false)}
        />
      </div>
    )
  }

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <>
    <div style={S.page}>

      {/* ═══════════ BLOQUE 1: DASHBOARD ══════════════════════════════════ */}
      <div style={S.blockHeader}>
        <h2 style={S.blockTitle}>📊 Dashboard del evento</h2>
        <p style={S.blockSubtitle}>Estado en tiempo real del personal</p>
      </div>

      {/* Control */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 16 }}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Evento</label>
            {eventListLoading ? (
              <div style={{ ...S.input, color: '#334155', pointerEvents: 'none' }}>Cargando eventos…</div>
            ) : (
              <select
                style={{ ...S.select, width: '100%' }}
                value={eventId}
                onChange={e => setEventId(e.target.value)}
              >
                <option value="">— Selecciona un evento —</option>
                {eventList.map(evt => (
                  <option key={evt.eventid} value={evt.eventid}>
                    {evt.name ?? evt.eventid}{evt.location ? ` — ${evt.location}` : ''}
                  </option>
                ))}
              </select>
            )}
            {!eventListLoading && eventList.length === 0 && token && (
              <span style={S.muted}>Sin eventos. Verifica el token o crea uno.</span>
            )}
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Token (Bearer)</label>
            <input style={S.input} type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Pega tu token aquí" />
          </div>
        </div>

        {eventId && (
          <div style={{ marginBottom: 14, minHeight: 20 }}>
            {eventInfoLoading && <span style={S.muted}>Cargando evento…</span>}
            {!eventInfoLoading && eventInfoError && <span style={{ color: '#f87171', fontSize: 13 }}>{eventInfoError}</span>}
            {!eventInfoLoading && eventInfo && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{eventInfo.name ?? eventInfo.eventid}</div>
                  <div style={{ color: '#475569', fontSize: 13, marginTop: 2 }}>📍 {eventInfo.location ?? '—'}</div>
                </div>
                {data && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 99, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 15 }}>👥</span>
                    <span style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 15 }}>{mergedRows.length}</span>
                    <span style={{ color: '#6366f1', fontSize: 13 }}>azafato{mergedRows.length !== 1 ? 's' : ''} asignado{mergedRows.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <button style={S.btnPrimary} onClick={handleRefresh} disabled={loading}>
            {loading ? '⏳ Cargando…' : '🔄 Refrescar estado'}
          </button>
          <button style={autoRefresh ? S.pillOn : S.pillOff} onClick={() => setAutoRefresh(v => !v)}>
            {autoRefresh ? '● Auto ON' : '○ Auto OFF'}
          </button>
          <select style={{ ...S.select, width: 'auto' }} value={refreshIntervalMs} onChange={e => setRefreshIntervalMs(Number(e.target.value))}>
            <option value={5000}>5 s</option>
            <option value={10000}>10 s</option>
            <option value={15000}>15 s</option>
            <option value={30000}>30 s</option>
          </select>
          {timeSinceLabel && <span style={S.muted}>{timeSinceLabel}</span>}
        </div>

        {error && <AlertBox type="error">{error}</AlertBox>}
      </Card>

      {/* Stats + chart */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'stretch' }}>
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 28px', gap: 16 }}>
            <DonutChart data={chartData} size={180} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chartData.filter(d => d.value > 0 && d.color !== '#1e293b').map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#64748b' }}>{d.label}</span>
                  <span style={{ fontSize: 12, color: d.color, fontWeight: 700, marginLeft: 'auto' }}>{d.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ color: '#334155', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, marginBottom: 16 }}>Resumen del personal</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={S.statCard}>
                <span style={S.statLabel}>Total</span>
                <span style={{ ...S.statValue, color: '#f1f5f9' }}>{mergedRows.length}</span>
              </div>
              {[
                { key: 'EN_SITIO',  label: 'En sitio',  color: '#22c55e' },
                { key: 'DE_CAMINO', label: 'De camino', color: '#f59e0b' },
                { key: 'DESPIERTO', label: 'Despierto', color: '#3b82f6' },
              ].map(({ key, label, color }) => (
                <div key={key} style={{ ...S.statCard, borderTop: `3px solid ${color}` }}>
                  <span style={S.statLabel}>{label}</span>
                  <span style={{ ...S.statValue, color }}>{counts[key as keyof typeof counts]}</span>
                </div>
              ))}

              {/* ── Incidents card ───────────────────────────────────────── */}
              <div style={{ ...S.statCard, borderTop: '3px solid #ef4444', alignItems: 'flex-start', minWidth: 130 }}>
                <span style={S.statLabel}>Incidencias</span>
                {incidents == null ? (
                  <span style={{ ...S.statValue, color: '#334155' }}>—</span>
                ) : (
                  <>
                    <span style={{ ...S.statValue, color: '#f87171' }}>{incidents.total}</span>
                    <span style={{ fontSize: 10, color: '#334155', marginTop: 1 }}>
                      {incidents.total === 1 ? 'reporte' : 'reportes'}
                    </span>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Demoras</span>
                        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 800 }}>{incidents.demora}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>Incidencias</span>
                        <span style={{ fontSize: 11, color: '#f87171', fontWeight: 800 }}>{incidents.incidencia}</span>
                      </div>
                    </div>
                  </>
                )}
                <button
                  style={{ marginTop: 10, width: '100%', padding: '5px 0', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
                  onClick={() => setShowIncidentsModal(true)}
                >
                  Ver →
                </button>
              </div>
              {/* ─────────────────────────────────────────────────────────── */}

            </div>
          </Card>
        </div>
      )}

      {/* Staff table */}
      {data && (
        <Card>
          <div style={S.sectionHeader}>
            <div>
              <div style={S.sectionTitle}>👥 Personal del evento</div>
              <div style={S.sectionSubtitle}>{mergedRows.length} persona{mergedRows.length !== 1 ? 's' : ''} asignada{mergedRows.length !== 1 ? 's' : ''}</div>
            </div>
            <button style={S.btnGhost} onClick={() => setShowManagePanel(true)}>
              ⚙️ Gestionar personal
            </button>
          </div>
          {mergedRows.length === 0 ? (
            <div style={{ color: '#334155', fontSize: 14, textAlign: 'center', padding: '28px 0' }}>
              Sin asignaciones. Usa "Gestionar personal" para gestionar el equipo.
            </div>
          ) : (
            <div style={S.tableWrapper}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Nombre</th>
                    <th style={S.th}>Teléfono</th>
                    <th style={S.th}>Turno</th>
                    <th style={S.th}>Estado</th>
                    <th style={S.th}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.map((item, i) => (
                    <tr key={i} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                      <td style={{ ...S.td, color: '#e2e8f0', fontWeight: 500 }}>{item.staff?.name ?? '—'}</td>
                      <td style={S.td}>{item.staff?.phone ?? '—'}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{item.shiftid}</td>
                      <td style={S.td}><StatusBadge status={item.status} /></td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11 }}>{item.ts ? new Date(item.ts).toLocaleString('es-ES') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Links */}
      <Card>
        <div style={S.sectionHeader}>
          <div>
            <div style={S.sectionTitle}>🔗 Links para azafatos</div>
            <div style={S.sectionSubtitle}>Links con token incluido para enviar por WhatsApp</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={S.btnPrimary} onClick={() => { setShowLinks(true); handleLoadLinks() }} disabled={linksLoading}>
              {linksLoading ? '⏳ Cargando…' : 'Cargar links'}
            </button>
            {linksData && (
              <>
                <button style={copiedAll ? S.btnDone : S.btnOutline} onClick={handleCopyAll} disabled={!linksData.linksPorStaff.length || copiedAll}>
                  {copiedAll ? 'Copiado ✅' : '📋 Copiar todos (WA)'}
                </button>
                <button style={S.btnGreen} onClick={handleOpenAllWhatsApp} disabled={!linksData.linksPorStaff.some(it => it.waLink)}>
                  💬 WA todos
                </button>
                <button style={S.btnOutline} onClick={handleDownloadCsv} disabled={!linksData.linksPorStaff.length}>⬇ CSV</button>
              </>
            )}
          </div>
        </div>

        {waBlockedWarning && <AlertBox type="warning">Tu navegador puede bloquear múltiples pestañas. Usa el botón individual por fila.</AlertBox>}
        {linksError && <AlertBox type="error"><strong>Error:</strong> {linksError}</AlertBox>}

        {showLinks && linksData && (
          <div style={S.tableWrapper}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Nombre</th>
                  <th style={S.th}>Teléfono</th>
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
                      <td style={{ ...S.td, color: '#e2e8f0', fontWeight: 500 }}>{item.name || '—'}</td>
                      <td style={S.td}>{item.phone || '—'}</td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12 }}>{item.shiftId}</td>
                      <td style={S.td}><StatusBadge status={item.status} /></td>
                      <td style={{ ...S.td, maxWidth: 240 }}>
                        {missing
                          ? <span style={{ color: '#f87171', fontSize: 12, fontStyle: 'italic' }}>Falta staffToken</span>
                          : <input style={S.linkInput} readOnly value={item.link} />}
                      </td>
                      <td style={S.td}>
                        <button style={S.btnWa} onClick={() => item.waLink && window.open(item.waLink, '_blank')} disabled={!item.waLink}>WA</button>
                      </td>
                      <td style={S.td}>
                        <button style={copiedRows[i] ? { ...S.btnDone, padding: '5px 10px', fontSize: 12 } : S.btnOutlineSm} onClick={() => handleCopy(item.link, i)} disabled={missing || !!copiedRows[i]}>
                          {copiedRows[i] ? '✅' : '📋'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ═══════════ SEPARADOR ════════════════════════════════════════════ */}
      <div style={{ borderTop: '1px solid #0f1e30', margin: '8px 0' }} />

      {/* ═══════════ BLOQUE 2: PREPARACIÓN ═══════════════════════════════ */}
      <div style={S.blockHeader}>
        <h2 style={S.blockTitle}>⚙️ Preparación</h2>
        <p style={S.blockSubtitle}>Crea eventos y gestiona el equipo</p>
      </div>

      {/* CTA Crear evento */}
      <Card style={{ background: 'linear-gradient(135deg, #1a1560 0%, #0f172a 60%)', border: '1px solid #312e81' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ color: '#818cf8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>Asistente guiado</div>
            <div style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Crear nuevo evento</div>
            <div style={{ color: '#6366f1', fontSize: 13 }}>Datos · Personal · Horarios · Confirmar</div>
          </div>
          <button
            style={{ ...S.btnIndigo, fontSize: 15, padding: '13px 30px', borderRadius: 10 }}
            onClick={() => setShowWizard(true)}
          >
            + Crear evento →
          </button>
        </div>
      </Card>

      {/* Staff database accordion */}
      <Card>
        <button style={S.accordion} onClick={() => setShowStaffDb(v => !v)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>👥</span>
            <div>
              <div style={S.sectionTitle}>Base de datos de personal</div>
              <div style={S.sectionSubtitle}>Azafatos registrados en la agencia</div>
            </div>
          </div>
          <span style={{ color: '#334155', fontSize: 14 }}>{showStaffDb ? '▴' : '▾'}</span>
        </button>
        {showStaffDb && (
          <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid #1e293b' }}>
            <StaffDatabasePanel token={token} />
          </div>
        )}
      </Card>

    </div>

    {showManagePanel && eventId && (
      <ManagePersonalModal
        token={token}
        eventId={eventId}
        onClose={() => setShowManagePanel(false)}
        onRefresh={handleRefresh}
      />
    )}

    {/* NEW: incidents detail modal */}
    {showIncidentsModal && incidents && (
      <IncidentsModal
        incidents={incidents}
        onClose={() => setShowIncidentsModal(false)}
      />
    )}
    </>
  )
}
