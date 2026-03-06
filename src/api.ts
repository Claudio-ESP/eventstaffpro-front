const SUPABASE_URL = 'https://xwclwrcggvmsngflbpcq.supabase.co'
const API_BASE = `${SUPABASE_URL}/functions/v1`
const CHECKIN_URL = `${API_BASE}/staff-checkin`
const ADMIN_URL = `${API_BASE}/admin`

export interface CheckinPayload {
  eventId: string
  shiftId: string
  staffId: string
  staffToken: string
  status: 'DESPIERTO' | 'DE_CAMINO' | 'EN_SITIO'
}

export interface CheckinResponse {
  [key: string]: unknown
}

export interface StaffItem {
  eventid: string
  shiftid: string
  staffid: string
  status: string
  ts: string
  staff?: {
    staffid: string
    name: string
    phone: string
  }
}

export interface EventStatusResponse {
  ok: boolean
  rows: StaffItem[]
}

export async function postCheckin(payload: CheckinPayload): Promise<CheckinResponse> {
  const res = await fetch(CHECKIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload),
  })

  let data: any
  try { data = await res.json() } 
  catch { data = { error: await res.text().catch(() => 'Respuesta no legible') } }

  if (!res.ok) throw new Error(data?.error || `Error ${res.status}: ${res.statusText}`)
  return data as CheckinResponse
}

export interface ScheduleItem {
  eventId: string
  eventName?: string
  location?: string | null
  shiftId: string
  shiftName?: string
  startsAt?: string | null
  endsAt?: string | null
  status: string
  statusTs?: string | null
}

export interface StaffScheduleResponse {
  ok: boolean
  staffId?: string
  schedule: ScheduleItem[]
}

export async function getStaffSchedule(
  staffId: string,
  staffToken: string
): Promise<StaffScheduleResponse> {
  const res = await fetch(`${API_BASE}/staff-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ staffId, staffToken }),
  })

  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = { error: await res.text().catch(() => 'Respuesta no legible') }
  }

  if (!res.ok) {
    const msg = (data as Record<string, unknown>)?.error ?? `Error ${res.status}: ${res.statusText}`
    throw new Error(String(msg))
  }

  return data as StaffScheduleResponse
}

export interface EventLinkItem {
  staffId: string
  shiftId: string
  status: string
  staffTokenPresent: boolean
  link: string
  name?: string
  phone?: string
  waLink?: string
}

export interface EventLinksResponse {
  ok: boolean
  eventId: string
  totalAsignaciones: number
  linksPorStaff: EventLinkItem[]
}

export async function getEventLinks(
  token: string,
  eventId: string
): Promise<EventLinksResponse> {
  const res = await fetch(ADMIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'event-links', eventId }),
  })

  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = { error: await res.text().catch(() => 'Respuesta no legible') }
  }

  if (!res.ok) {
    const msg = (data as Record<string, unknown>)?.error ?? `Error ${res.status}: ${res.statusText}`
    throw new Error(String(msg))
  }

  return data as EventLinksResponse
}

export interface EventInfo {
  eventid: string
  name: string | null
  location: string | null
}

export interface EventInfoResponse {
  ok: boolean
  event: EventInfo
}

export async function getEventInfo(eventId: string): Promise<EventInfoResponse> {
  const res = await fetch(`${API_BASE}/event-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ eventId }),
  })

  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = { error: await res.text().catch(() => 'Respuesta no legible') }
  }

  if (!res.ok) {
    const d = data as Record<string, unknown>
    const msg = d?.error ?? `Error ${res.status}: ${res.statusText}`
    const err = new Error(String(msg)) as Error & { status: number }
    err.status = res.status
    throw err
  }

  return data as EventInfoResponse
}

export interface AdminResponse {
  ok: boolean
  [key: string]: unknown
}

async function adminPost(token: string, body: Record<string, unknown>): Promise<AdminResponse> {
  const res = await fetch(ADMIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  let data: unknown
  try { data = await res.json() }
  catch { data = { error: await res.text().catch(() => 'Respuesta no legible') } }
  if (!res.ok) {
    const msg = (data as Record<string, unknown>)?.error ?? `Error ${res.status}: ${res.statusText}`
    throw new Error(String(msg))
  }
  return data as AdminResponse
}

export async function adminUpsertEvent(
  token: string,
  payload: { eventId: string; name: string; location?: string }
): Promise<AdminResponse> {
  return adminPost(token, { action: 'upsert-event', ...payload })
}

export async function adminUpsertShift(
  token: string,
  payload: { eventId: string; shiftId: string; shiftName: string; startsAt?: string; endsAt?: string }
): Promise<AdminResponse> {
  return adminPost(token, { action: 'upsert-shift', ...payload })
}

export async function adminAssignStaff(
  token: string,
  payload: { eventId: string; shiftId: string; staffId: string }
): Promise<AdminResponse> {
  return adminPost(token, { action: 'assign-staff', ...payload })
}

export interface AdminStaff {
  staffid: string
  name: string
  phone: string
  agencyid?: string
  stafftoken?: string
}

export interface AdminShift {
  shiftid: string
  eventid?: string
  name: string | null
  starts_at: string | null
  ends_at: string | null
}

export async function adminUpsertStaff(
  token: string,
  payload: { staffId?: string; name: string; phone: string; agencyId?: string }
): Promise<AdminResponse> {
  return adminPost(token, { action: 'upsert-staff', ...payload })
}

// TODO backend: action="list-staff" → { staff: AdminStaff[] }
export async function adminListStaff(token: string): Promise<AdminStaff[]> {
  const res = await adminPost(token, { action: 'list-staff' })
  return ((res.staff ?? res.rows ?? res.data ?? []) as AdminStaff[])
}

// TODO backend: action="list-shifts" with { eventId } → { shifts: AdminShift[] }
export async function adminListShifts(token: string, eventId: string): Promise<AdminShift[]> {
  const res = await adminPost(token, { action: 'list-shifts', eventId })
  return ((res.shifts ?? res.rows ?? res.data ?? []) as AdminShift[])
}

export interface EventItem {
  eventid: string
  name: string | null
  location: string | null
}

// TODO backend: action="list-events" → { events: EventItem[] }
export async function adminListEvents(token: string): Promise<EventItem[]> {
  const res = await adminPost(token, { action: 'list-events' })
  return ((res.events ?? res.rows ?? res.data ?? []) as EventItem[])
}

export interface Assignment {
  assignmentid: string
  eventid: string
  shiftid: string
  staffid: string
  starts_at_override: string | null
  ends_at_override: string | null
  effective_starts_at: string | null
  effective_ends_at: string | null
  staff: { staffid: string; name: string; phone: string } | null
  shift: { shiftid: string; name: string | null; starts_at: string | null; ends_at: string | null } | null
}

export async function adminListEventAssignments(token: string, eventId: string): Promise<Assignment[]> {
  const res = await adminPost(token, { action: 'list-event-assignments', eventId })
  return ((res.assignments ?? res.rows ?? res.data ?? []) as Assignment[])
}

export async function adminUpdateShiftTime(
  token: string,
  payload: { eventId: string; shiftId: string; startsAt?: string; endsAt?: string }
): Promise<AdminResponse> {
  return adminPost(token, { action: 'update-shift-time', ...payload })
}

export async function adminUpdateAssignmentTime(
  token: string,
  payload: { assignmentId: string; startsAt?: string; endsAt?: string; clearOverride?: boolean }
): Promise<AdminResponse> {
  return adminPost(token, { action: 'update-assignment-time', ...payload })
}

// TODO backend: implement action="remove-assignment"
export async function adminRemoveAssignment(token: string, assignmentId: string): Promise<AdminResponse> {
  return adminPost(token, { action: 'remove-assignment', assignmentId })
}

export async function getEventStatus(adminToken: string, eventId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/event-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ eventId, adminToken }),
  })

  let data: any
  try {
    data = await res.json()
  } catch {
    data = { error: await res.text().catch(() => 'Respuesta no legible') }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Error ${res.status}: ${res.statusText}`)
  }

  return data
}
