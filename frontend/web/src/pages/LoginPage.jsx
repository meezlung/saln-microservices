import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authApi, clearSession, getAuthToken, setSession } from '../lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      return
    }

    authApi
      .me()
      .then(() => {
        navigate('/dashboard', { replace: true })
      })
      .catch(() => {
        clearSession()
      })
  }, [navigate])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('reason') === 'expired') {
      setInfo('Session expired. Please request a new verification code.')
    } else {
      setInfo('')
    }
  }, [location.search])

  async function handleSendCode(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const response = await authApi.sendCode(email)
      setDevCode(response.data.dev_code || '')
      setStep(2)
    } catch (err) {
      const message = err?.response?.data?.message || 'Failed to send verification code.'
      const errorDetail = err?.response?.data?.error
      setError(errorDetail ? `${message} (${errorDetail})` : message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyLogin(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const response = await authApi.verifyLogin({ email, code })
      const { token, user, inactivity_notice: inactivityNotice } = response.data

      setSession(token, user)
      navigate('/dashboard', {
        state: {
          inactivityNotice: !!inactivityNotice,
        },
      })
    } catch (err) {
      const message = err?.response?.data?.message || 'Invalid login details.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="card login-card" style={{ maxWidth: '480px', margin: '0 auto', width: '90%' }}>
        <div className="text-center" style={{ marginBottom: '24px' }}>
          <h2 style={{ marginBottom: '8px' }}>Welcome Back</h2>
          <p className="text-muted">Enter your email to get started</p>
        </div>

        <div className="step-indicator">
          <div className={`step-dot ${step === 1 ? 'active' : ''}`} />
          <div className={`step-dot ${step === 2 ? 'active' : ''}`} />
        </div>

        {info ? <div className="alert alert-info">{info}</div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        {step === 1 ? (
          <form onSubmit={handleSendCode}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                required
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="form-help">We&apos;ll send you a 6-digit verification code</p>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyLogin}>
            <div className="form-group">
              <label>Verification Code</label>
              <input
                type="text"
                required
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              />
              {devCode ? (
                <p className="form-help" style={{ color: 'var(--success-color)', fontWeight: 600 }}>
                  Development code: {devCode}
                </p>
              ) : null}
            </div>

            <p className="form-help" style={{ marginBottom: '16px' }}>
              Login session lasts 1 hour. After expiry, request a new verification code.
            </p>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify and Login'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '12px' }}
              onClick={() => setStep(1)}
            >
              Back
            </button>
          </form>
        )}
      </div>
      <div className="text-center" style={{ marginTop: '16px' }}>
        <Link to="/" className="back-link">Back to home</Link>
      </div>
    </div>
  )
}
