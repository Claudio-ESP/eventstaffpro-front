import { useMemo, useState } from 'react'
import Azafato from './pages/Azafato'
import Iria from './pages/Iria'

type Tab = 'staff' | 'iria'

function getQueryParam(params: URLSearchParams, keys: string[]) {
  for (const k of keys) {
    const v = params.get(k)
    if (v && v.trim() !== '') return v.trim()
  }
  return ''
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('iria')

  const { isStaffMode } = useMemo(() => {
    const p = new URLSearchParams(window.location.search)
    const staffId = getQueryParam(p, ['staffId', 'staffid', 'staffID', 'staff'])
    const token = getQueryParam(p, ['token', 't', 'staffToken'])
    return { isStaffMode: Boolean(staffId && token) }
  }, [])

  if (isStaffMode) {
    return (
      <div style={S.root}>
        <header style={S.header}>
          <span style={S.logo}>EventStaffPro</span>
        </header>
        <main style={S.main}>
          <Azafato />
        </main>
      </div>
    )
  }

  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.logo}>EventStaffPro</span>
        <span style={S.logoSub}>· Gestión de personal</span>
      </header>

      <nav style={S.nav}>
        <button
          style={{ ...S.tab, ...(activeTab === 'iria' ? S.tabActive : S.tabInactive) }}
          onClick={() => setActiveTab('iria')}
        >
          IRIA
        </button>
        <button
          style={{ ...S.tab, ...(activeTab === 'staff' ? S.tabActive : S.tabInactive) }}
          onClick={() => setActiveTab('staff')}
        >
          STAFF
        </button>
      </nav>

      <main style={S.main}>
        {activeTab === 'iria' ? <Iria /> : <Azafato />}
      </main>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    minHeight: '100vh',
    background: '#0b1020',
  },
  header: {
    background: '#060c18',
    borderBottom: '1px solid #0f1e30',
    color: '#e2e8f0',
    padding: '14px 28px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#f1f5f9',
  },
  logoSub: {
    fontSize: 13,
    color: '#334155',
    fontWeight: 400,
  },
  nav: {
    display: 'flex',
    background: '#060c18',
    borderBottom: '1px solid #0f1e30',
    padding: '0 28px',
  },
  tab: {
    padding: '12px 24px',
    border: 'none',
    background: 'transparent',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    letterSpacing: '0.08em',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: '#6366f1',
    borderBottomColor: '#6366f1',
  },
  tabInactive: {
    color: '#334155',
  },
  main: {
    padding: 0,
  },
}
