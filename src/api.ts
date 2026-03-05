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
  eventName: string
  location: string
  date: string
  startTime: string
  endTime: string
}

export interface StaffScheduleResponse {
  ok: boolean
  staffId: string
  schedule: ScheduleItem[]
}

export async function getStaffSchedule(
  token: string,
  staffId: string
): Promise<StaffScheduleResponse> {
  const url = `${ADMIN_URL}?action=staff-schedule&staffId=${encodeURIComponent(staffId)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
