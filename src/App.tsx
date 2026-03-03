import { useState } from 'react'
import Azafato from './pages/Azafato'
import Jefa from './pages/Jefa'

type Tab = 'azafato' | 'jefa'

// Staff mode: URL contains both staffId and token — show only Azafato, no tabs
const isStaffMode = (() => {
  const p = new URLSearchParams(window.location.search)
  return p.has('staffId') && p.has('token')
})()

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('azafato')

  if (isStaffMode) {
    return (
      <div style={styles.root}>
        <header style={styles.header}>
          <span style={styles.logo}>EventStaffPro</span>
        </header>
        <main style={styles.main}>
          <Azafato />
        </main>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <span style={styles.logo}>EventStaffPro</span>
      </header>

      <nav style={styles.nav}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'azafato' ? styles.tabActive : styles.tabInactive),
          }}
          onClick={() => setActiveTab('azafato')}
        >
          Azafato
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'jefa' ? styles.tabActive : styles.tabInactive),
          }}
          onClick={() => setActiveTab('jefa')}
        >
          Jefa
        </button>
      </nav>

      <main style={styles.main}>
        {activeTab === 'azafato' ? <Azafato /> : <Jefa />}
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    minHeight: '100vh',
    background: '#f3f4f6',
  },
  header: {
    background: '#1e1b4b',
    color: '#fff',
    padding: '14px 24px',
    display: 'flex',
    alignItems: 'center',
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  nav: {
    display: 'flex',
    borderBottom: '2px solid #e5e7eb',
    background: '#fff',
    padding: '0 24px',
  },
  tab: {
    padding: '12px 24px',
    border: 'none',
    background: 'transparent',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    borderBottom: '3px solid transparent',
    marginBottom: -2,
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: '#4f46e5',
    borderBottomColor: '#4f46e5',
  },
  tabInactive: {
    color: '#6b7280',
  },
  main: {
    padding: '24px 16px',
  },
}
