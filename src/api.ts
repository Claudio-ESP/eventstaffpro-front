const API_BASE = 'https://n8n.eventstaffpro.tech/webhook/api'
const CHECKIN_URL = `${API_BASE}/checkin`
const STATUS_URL = `${API_BASE}/event-status`
const ADMIN_URL = `${API_BASE}/admin`

export interface CheckinPayload {
  eventId: string
  shiftId: string
  staffId: string
  status: 'DESPIERTO' | 'DE_CAMINO' | 'EN_SITIO'
}

export interface CheckinResponse {
  [key: string]: unknown
}

export interface StaffItem {
  staffId: string
  shiftId: string
  status: string
  ts: string
}

export interface EventStatusResponse {
  total: number
  counts: {
    DESPIERTO?: number
    DE_CAMINO?: number
    EN_SITIO?: number
    [key: string]: number | undefined
  }
  items: StaffItem[]
}

export async function postCheckin(
  payload: CheckinPayload,
  token: string
): Promise<CheckinResponse> {
  const res = await fetch(CHECKIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({ error: 'Respuesta no es JSON' }))

  if (!res.ok) {
    throw Object.assign(
      new Error(`Error ${res.status}: ${res.statusText}`),
      { data }
    )
  }

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
  const url = `${ADMIN_URL}?action=event-links&eventId=${encodeURIComponent(eventId)}`
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

  return data as EventLinksResponse
}

export async function getEventStatus(
  eventId: string,
  token: string
): Promise<EventStatusResponse> {
  const url = `${STATUS_URL}?eventId=${encodeURIComponent(eventId)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const data = await res.json().catch(() => ({ error: 'Respuesta no es JSON' }))

  if (!res.ok) {
    throw Object.assign(
      new Error(`Error ${res.status}: ${res.statusText}`),
      { data }
    )
  }

  return data as EventStatusResponse
}
