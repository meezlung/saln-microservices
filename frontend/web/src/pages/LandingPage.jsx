import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi, clearSession, getAuthToken } from '../lib/api'

export default function LandingPage() {
  const [authenticated, setAuthenticated] = useState(() => !!getAuthToken())

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setAuthenticated(false)
      return
    }

    authApi
      .me()
      .then(() => setAuthenticated(true))
      .catch(() => {
        clearSession()
        setAuthenticated(false)
      })
  }, [])

  return (
    <>
      <header style={{ backgroundColor: 'var(--bg-white)', borderBottom: '1px solid var(--border-color)', padding: '16px 0', position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <h3 className="logo-text" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>SALN Filing System</h3>
            <Link to={authenticated ? '/dashboard' : '/login'} className="btn btn-primary">
              {authenticated ? 'Dashboard' : 'Login'}
            </Link>
          </div>
        </div>
      </header>

      <div className="container-narrow hero-section fade-in">
        <div className="text-center" style={{ marginBottom: '64px', marginTop: '32px' }}>
          <h1 style={{ marginBottom: '24px' }}>Simplify Your SALN Filing</h1>
          <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 32px' }}>
            A modern, user-friendly way to complete your Statement of Assets, Liabilities, and Net Worth.
          </p>
          <Link to={authenticated ? '/dashboard' : '/login'} className="btn btn-primary" style={{ fontSize: '18px', padding: '14px 32px' }}>
            {authenticated ? 'Open Dashboard' : 'Get Started'}
          </Link>
        </div>

        <div className="feature-grid" style={{ marginBottom: '48px' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="feature-icon">✨</div>
            <h3>Easier SALN Completion</h3>
            <p style={{ marginBottom: 0 }}>Clean form interface with clear sections and safer data flow.</p>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="feature-icon">📄</div>
            <h3>Official Document Output</h3>
            <p style={{ marginBottom: 0 }}>Document microservice generates final output separately.</p>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="feature-icon">🔒</div>
            <h3>Privacy-First Design</h3>
            <p style={{ marginBottom: 0 }}>Independent auth and form services improve access boundaries.</p>
          </div>
        </div>
      </div>
    </>
  )
}
