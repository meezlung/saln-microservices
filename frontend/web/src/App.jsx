import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  authApi,
  clearSession,
  documentApi,
  formApi,
  getAuthToken,
  getCurrentUser,
  setSession,
} from './lib/api'

const THEME_STORAGE_KEY = 'theme'

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createEmptyForm() {
  // Set default values for new forms
  const now = new Date()
  const lastYear = now.getFullYear() - 1
  const defaultAsOfDate = `${lastYear}-12-31`
  return {
    schema_version: '1.0.0',
    form_metadata: {
      form_type: 'SALN_2025',
      compliance_type: 'ASSUMPTION',
      as_of_date: defaultAsOfDate,
      filing_type: 'JOINT',
      csc_resolution_no: '',
      promulgated_on: '',
    },
    declarant: {
      personal_information: {
        last_name: '',
        first_name: '',
        middle_initial: '',
        position: '',
        agency_office: '',
        office_address: '',
        government_id: {
          type: '',
          id_number: '',
          date_issued: '',
        },
      },
    },
    spouse: null,
    children_below_18: [],
    assets: {
      real_properties: [],
      personal_properties: [],
    },
    liabilities: [],
    business_interests: {
      has_business_interest: false,
      entries: [],
    },
    relatives_in_government: {
      has_relatives: false,
      entries: [],
    },
    certification: {
      date_signed: '',
      authorization_to_verify: false,
    },
  }
}

function normalizeFormData(raw) {
  const base = createEmptyForm()
  const data = raw && typeof raw === 'object' ? raw : {}

  return {
    ...base,
    ...data,
    form_metadata: {
      ...base.form_metadata,
      ...(data.form_metadata || {}),
    },
    declarant: {
      ...base.declarant,
      ...(data.declarant || {}),
      personal_information: {
        ...base.declarant.personal_information,
        ...(data.declarant?.personal_information || {}),
        government_id: {
          ...base.declarant.personal_information.government_id,
          ...(data.declarant?.personal_information?.government_id || {}),
        },
      },
    },
    spouse: data.spouse ? { ...data.spouse } : null,
    children_below_18: Array.isArray(data.children_below_18) ? data.children_below_18 : [],
    assets: {
      ...base.assets,
      ...(data.assets || {}),
      real_properties: Array.isArray(data.assets?.real_properties) ? data.assets.real_properties : [],
      personal_properties: Array.isArray(data.assets?.personal_properties) ? data.assets.personal_properties : [],
    },
    liabilities: Array.isArray(data.liabilities) ? data.liabilities : [],
    business_interests: {
      ...base.business_interests,
      ...(data.business_interests || {}),
      entries: Array.isArray(data.business_interests?.entries) ? data.business_interests.entries : [],
    },
    relatives_in_government: {
      ...base.relatives_in_government,
      ...(data.relatives_in_government || {}),
      entries: Array.isArray(data.relatives_in_government?.entries) ? data.relatives_in_government.entries : [],
    },
    certification: {
      ...base.certification,
      ...(data.certification || {}),
    },
  }
}

function formatCurrency(value) {
  const number = Number(value || 0)
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  function handleToggleTheme() {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <button
        type="button"
        className="theme-toggle"
        onClick={handleToggleTheme}
        aria-label="Toggle dark mode"
        aria-pressed={theme === 'dark'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ) : (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        )}
      </button>
    </>
  )
}

function LandingPage() {
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

function LoginPage() {
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
      setError(message)
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
              <p className="form-help">We'll send you a 6-digit verification code</p>
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

function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const importFileRef = useRef(null)
  const dashboardFormRef = useRef(null)
  const [user] = useState(() => getCurrentUser())
  const [formData, setFormData] = useState(createEmptyForm())
  const [openSections, setOpenSections] = useState({
    formInfo: true,
    personal: true,
    spouse: false,
    children: false,
    realProperties: false,
    personalProperties: false,
    liabilities: false,
    business: false,
    relatives: false,
    certification: false,
  })
  const [statusText, setStatusText] = useState('Draft')
  const [statusSaved, setStatusSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState('Never')
  const [noticeType, setNoticeType] = useState('info')
  const [notice, setNotice] = useState('')
  const [showInactivityModal, setShowInactivityModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isDirty, setIsDirty] = useState(false)
  const [sectionEmptyCounts, setSectionEmptyCounts] = useState({})

  const formDataRef = useRef(formData)
  const dirtyRef = useRef(isDirty)

  useEffect(() => {
    formDataRef.current = formData
  }, [formData])

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  const realTotal = formData.assets.real_properties.reduce(
    (sum, item) => sum + Number(item.fair_market_value || 0),
    0,
  )
  const personalTotal = formData.assets.personal_properties.reduce(
    (sum, item) => sum + Number(item.acquisition_cost || 0),
    0,
  )
  const liabilitiesTotal = formData.liabilities.reduce(
    (sum, item) => sum + Number(item.outstanding_balance || 0),
    0,
  )
  const assetsTotal = realTotal + personalTotal
  const netWorth = assetsTotal - liabilitiesTotal

  useEffect(() => {
    const token = getAuthToken()

    if (!token || !user) {
      navigate('/login', { replace: true })
      return
    }

    authApi.me().catch(() => {
      clearSession()
      navigate('/login', { replace: true })
    })

    formApi
      .latest()
      .then((response) => {
        const payload = response?.data?.data?.form_data
        let nextForm = createEmptyForm()
        if (payload && typeof payload === 'object') {
          nextForm = normalizeFormData(payload)
        }

        // Set defaults if fields are empty
        const now = new Date()
        const lastYear = now.getFullYear() - 1
        const defaultAsOfDate = `${lastYear}-12-31`
        if (!nextForm.form_metadata.compliance_type) {
          nextForm.form_metadata.compliance_type = 'ASSUMPTION'
        }
        if (!nextForm.form_metadata.filing_type) {
          nextForm.form_metadata.filing_type = 'JOINT'
        }
        if (!nextForm.form_metadata.as_of_date) {
          nextForm.form_metadata.as_of_date = defaultAsOfDate
        }

        setFormData(nextForm)
        setShowInactivityModal(!!location.state?.inactivityNotice)
      })
      .catch(() => {
        // If no draft, set defaults for new form
        const now = new Date()
        const lastYear = now.getFullYear() - 1
        const defaultAsOfDate = `${lastYear}-12-31`
        const nextForm = createEmptyForm()
        nextForm.form_metadata.compliance_type = 'ASSUMPTION'
        nextForm.form_metadata.filing_type = 'JOINT'
        nextForm.form_metadata.as_of_date = defaultAsOfDate
        setFormData(nextForm)
        setNoticeType('info')
        setNotice('No saved draft found yet.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [location.state, navigate, user])

  useEffect(() => {
    if (loading || !isDirty) {
      return
    }

    const timeout = setTimeout(() => {
      handleSave(true)
    }, 700)

    return () => clearTimeout(timeout)
  }, [formData, isDirty, loading])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        handleSave(true)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirtyRef.current) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useLayoutEffect(() => {
    if (loading) {
      return
    }

    const formRoot = dashboardFormRef.current
    if (!formRoot) {
      return
    }

    const selector = 'input[type="text"], input[type="number"], input[type="date"], select, textarea'

    const applyEmptyIndicators = () => {
      const fields = formRoot.querySelectorAll(selector)

      fields.forEach((field) => {
        const value = typeof field.value === 'string' ? field.value.trim() : ''
        field.classList.toggle('field-empty', value === '')
      })

      const nextCounts = {}
      const sections = formRoot.querySelectorAll('[data-section]')

      sections.forEach((section) => {
        const key = section.dataset.section
        if (!key) {
          return
        }

        nextCounts[key] = section.querySelectorAll('.field-empty').length
      })

      setSectionEmptyCounts(nextCounts)
    }

    applyEmptyIndicators()
    formRoot.addEventListener('input', applyEmptyIndicators)
    formRoot.addEventListener('change', applyEmptyIndicators)

    return () => {
      formRoot.removeEventListener('input', applyEmptyIndicators)
      formRoot.removeEventListener('change', applyEmptyIndicators)
    }
  }, [formData, openSections, loading])

  function renderSectionStatus(sectionKey) {
    const emptyCount = sectionEmptyCounts[sectionKey] ?? 0

    if (emptyCount === 0) {
      return <span className="section-status complete">Complete</span>
    }

    return <span className="section-status incomplete">{emptyCount} empty</span>
  }

  function updateForm(updater) {
    setStatusSaved(false)
    setStatusText('Draft')
    setIsDirty(true)
    setFormData((prev) => {
      const next = structuredClone(prev)
      updater(next)
      return next
    })
  }

  function setMetaField(field, value) {
    updateForm((next) => {
      next.form_metadata[field] = value
    })
  }

  function setPersonalField(field, value) {
    updateForm((next) => {
      next.declarant.personal_information[field] = value
    })
  }

  function setGovIdField(field, value) {
    updateForm((next) => {
      next.declarant.personal_information.government_id[field] = value
    })
  }

  function setSpouseEnabled(enabled) {
    updateForm((next) => {
      next.spouse = enabled
        ? {
            is_public_official: false,
            last_name: '',
            first_name: '',
            middle_initial: '',
            position: '',
            agency_office: '',
            office_address: '',
          }
        : null
    })
  }

  function setSpouseField(field, value) {
    updateForm((next) => {
      if (!next.spouse) {
        next.spouse = {
          is_public_official: false,
          last_name: '',
          first_name: '',
          middle_initial: '',
          position: '',
          agency_office: '',
          office_address: '',
        }
      }

      next.spouse[field] = value
    })
  }

  function addItem(key, templateFactory) {
    updateForm((next) => {
      next[key].push(templateFactory())
    })
  }

  function removeItem(key, index) {
    updateForm((next) => {
      next[key].splice(index, 1)
    })
  }

  function addAssetItem(key, templateFactory) {
    updateForm((next) => {
      next.assets[key].push(templateFactory())
    })
  }

  function removeAssetItem(key, index) {
    updateForm((next) => {
      next.assets[key].splice(index, 1)
    })
  }

  function addBusinessEntry() {
    updateForm((next) => {
      next.business_interests.entries.push({
        entity_name: '',
        business_address: '',
        nature_of_interest: '',
        date_acquired: '',
      })
    })
  }

  function removeBusinessEntry(index) {
    updateForm((next) => {
      next.business_interests.entries.splice(index, 1)
    })
  }

  function addRelativeEntry() {
    updateForm((next) => {
      next.relatives_in_government.entries.push({
        relative_name: '',
        relationship: '',
        position: '',
        agency_office: '',
      })
    })
  }

  function removeRelativeEntry(index) {
    updateForm((next) => {
      next.relatives_in_government.entries.splice(index, 1)
    })
  }

  async function handleSave(isAuto = false) {
    try {
      await formApi.save(formDataRef.current)
      setStatusSaved(true)
      setStatusText('Saved')
      setIsDirty(false)
      setLastSavedAt(new Date().toLocaleString())
      if (!isAuto) {
        setNoticeType('success')
        setNotice('Form saved successfully.')
      }
      setTimeout(() => setStatusSaved(false), 1500)
    } catch {
      if (!isAuto) {
        setNoticeType('error')
        setNotice('Failed to save form.')
      }
    }
  }

  async function handleNewEntry() {
    try {
      await formApi.newEntry()
      // Set default values for new entry
      const now = new Date()
      const lastYear = now.getFullYear() - 1
      const defaultAsOfDate = `${lastYear}-12-31`
      const nextForm = createEmptyForm()
      nextForm.form_metadata.compliance_type = 'ASSUMPTION'
      nextForm.form_metadata.filing_type = 'JOINT'
      nextForm.form_metadata.as_of_date = defaultAsOfDate
      setFormData(nextForm)
      setStatusSaved(false)
      setStatusText('Draft')
      setIsDirty(false)
      setLastSavedAt('Never')
      setNoticeType('success')
      setNotice('New form entry started.')
    } catch {
      setNoticeType('error')
      setNotice('Failed to start a new entry.')
    }
  }

  async function handleExport() {
    try {
      const response = await formApi.export()
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'saln-form.json'
      anchor.click()
      URL.revokeObjectURL(url)
      setNoticeType('success')
      setNotice('Form exported as JSON.')
    } catch {
      setNoticeType('error')
      setNotice('No form data available to export.')
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      await formApi.importData(parsed)
      setFormData(normalizeFormData(parsed))
      setStatusText('Draft')
      setIsDirty(false)
      setNoticeType('success')
      setNotice('Form imported successfully.')
    } catch {
      setNoticeType('error')
      setNotice('Invalid JSON file.')
    } finally {
      e.target.value = ''
    }
  }

  async function handleGeneratePdf() {
    try {
      await documentApi.generate(formData)
      setNoticeType('success')
      setNotice('Document generation request sent.')
    } catch {
      setNoticeType('error')
      setNotice('Failed to send document generation request.')
    }
  }

  function toggleSection(key) {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  async function handleLogout() {
    try {
      await authApi.logout()
    } finally {
      clearSession()
      navigate('/login', { replace: true })
    }
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '48px' }}>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <>
      {showInactivityModal ? (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Session Expired</h3>
            </div>
            <div className="modal-body">
              <p>
                Your account was inactive for over 5 days. For privacy reasons, previously entered SALN data was deleted.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setShowInactivityModal(false)}>
                Continue and Start Fresh
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <header style={{ backgroundColor: 'var(--bg-white)', borderBottom: '1px solid var(--border-color)', padding: '12px 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>SALN Filing System</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{user?.email}</span>
            <button type="button" onClick={handleLogout} className="btn btn-secondary" style={{ padding: '8px 16px' }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <nav className="navbar" style={{ top: 'auto', position: 'sticky' }}>
        <div className="container">
          <div className="navbar-content">
            <div className="navbar-left">
              <button type="button" className="btn btn-secondary" onClick={handleNewEntry}>New Entry</button>
              <button type="button" className="btn btn-secondary" onClick={() => importFileRef.current?.click()}>Import JSON</button>
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
              <button type="button" className="btn btn-secondary" onClick={handleExport}>Export JSON</button>
              <button type="button" className="btn btn-success" onClick={handleSave}>Save</button>
              <button type="button" className="btn btn-primary" onClick={handleGeneratePdf}>Generate PDF</button>
            </div>
            <div className="navbar-right">
              <span className={`status-indicator ${statusSaved ? 'saved-indicator' : ''}`}>{statusText}</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: '32px', paddingBottom: '80px' }} ref={dashboardFormRef}>
        {notice ? <div className={`alert alert-${noticeType === 'error' ? 'error' : noticeType === 'success' ? 'success' : 'info'}`}>{notice}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <h2 style={{ margin: 0 }}>SALN Form 2025</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            <strong>Last saved:</strong> {lastSavedAt}
          </p>
        </div>

        <p className="form-help" style={{ marginBottom: '20px' }}>
          Empty fields are highlighted so you can quickly spot unfinished items.
        </p>

        <div className="form-section" data-section="formInfo">
          <div className="section-header" onClick={() => toggleSection('formInfo')}>
            <div className="section-header-main">
              <h3>Form Information</h3>
              {renderSectionStatus('formInfo')}
            </div>
            <span className="section-toggle">{openSections.formInfo ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.formInfo ? 'active' : ''}`}>
            <div className="form-row">
              <div className="form-group">
                <label>Compliance Type</label>
                <select
                  value={formData.form_metadata?.compliance_type || ''}
                  onChange={(e) => setMetaField('compliance_type', e.target.value)}
                >
                  <option value="">Select</option>
                  <option value="ASSUMPTION">Assumption</option>
                  <option value="ANNUAL">Annual</option>
                  <option value="EXIT">Exit</option>
                </select>
              </div>
              <div className="form-group">
                <label>As of Date</label>
                <input
                  type="date"
                  value={formData.form_metadata?.as_of_date || ''}
                  onChange={(e) => setMetaField('as_of_date', e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Filing Type</label>
                <select
                  value={formData.form_metadata?.filing_type || ''}
                  onChange={(e) => setMetaField('filing_type', e.target.value)}
                >
                  <option value="">Select</option>
                  <option value="JOINT">Joint</option>
                  <option value="SEPARATE">Separate</option>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="form-section" data-section="personal">
          <div className="section-header" onClick={() => toggleSection('personal')}>
            <div className="section-header-main">
              <h3>Personal Information</h3>
              {renderSectionStatus('personal')}
            </div>
            <span className="section-toggle">{openSections.personal ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.personal ? 'active' : ''}`}>
            <div className="form-row-3">
              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  value={formData.declarant?.personal_information?.last_name || ''}
                  onChange={(e) => setPersonalField('last_name', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  value={formData.declarant?.personal_information?.first_name || ''}
                  onChange={(e) => setPersonalField('first_name', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Middle Initial</label>
                <input
                  type="text"
                  value={formData.declarant?.personal_information?.middle_initial || ''}
                  onChange={(e) => setPersonalField('middle_initial', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Position</label>
              <input
                type="text"
                value={formData.declarant?.personal_information?.position || ''}
                onChange={(e) => setPersonalField('position', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Agency/Office</label>
              <input
                type="text"
                value={formData.declarant?.personal_information?.agency_office || ''}
                onChange={(e) => setPersonalField('agency_office', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Office Address</label>
              <textarea
                rows={2}
                value={formData.declarant?.personal_information?.office_address || ''}
                onChange={(e) => setPersonalField('office_address', e.target.value)}
              />
            </div>

            <h4 style={{ marginTop: '24px', marginBottom: '16px' }}>Government ID</h4>
            <div className="form-row">
              <div className="form-group">
                <label>ID Type</label>
                <input
                  type="text"
                  value={formData.declarant?.personal_information?.government_id?.type || ''}
                  onChange={(e) => setGovIdField('type', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>ID Number</label>
                <input
                  type="text"
                  value={formData.declarant?.personal_information?.government_id?.id_number || ''}
                  onChange={(e) => setGovIdField('id_number', e.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Date Issued</label>
              <input
                type="date"
                value={formData.declarant?.personal_information?.government_id?.date_issued || ''}
                onChange={(e) => setGovIdField('date_issued', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="form-section" data-section="spouse">
          <div className="section-header" onClick={() => toggleSection('spouse')}>
            <div className="section-header-main">
              <h3>Spouse Information</h3>
              {renderSectionStatus('spouse')}
            </div>
            <span className="section-toggle">{openSections.spouse ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.spouse ? 'active' : ''}`}>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={!formData.spouse}
                  onChange={(e) => setSpouseEnabled(!e.target.checked)}
                />{' '}
                N/A
              </label>
            </div>
            {formData.spouse ? (
              <>
                <div className="form-row-3">
                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={formData.spouse.last_name || ''}
                      onChange={(e) => setSpouseField('last_name', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={formData.spouse.first_name || ''}
                      onChange={(e) => setSpouseField('first_name', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Middle Initial</label>
                    <input
                      type="text"
                      value={formData.spouse.middle_initial || ''}
                      onChange={(e) => setSpouseField('middle_initial', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!formData.spouse.is_public_official}
                      onChange={(e) => setSpouseField('is_public_official', e.target.checked)}
                    />{' '}
                    Is a public official
                  </label>
                </div>

                <div className="form-group">
                  <label>Position</label>
                  <input
                    type="text"
                    value={formData.spouse.position || ''}
                    onChange={(e) => setSpouseField('position', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Agency/Office</label>
                  <input
                    type="text"
                    value={formData.spouse.agency_office || ''}
                    onChange={(e) => setSpouseField('agency_office', e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="form-section" data-section="children">
          <div className="section-header" onClick={() => toggleSection('children')}>
            <div className="section-header-main">
              <h3>Children Below 18</h3>
              {renderSectionStatus('children')}
            </div>
            <span className="section-toggle">{openSections.children ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.children ? 'active' : ''}`}>
            {formData.children_below_18.map((child, index) => (
              <div className="repeater-item" key={`child-${index}`}>
                <button type="button" className="repeater-remove" onClick={() => removeItem('children_below_18', index)}>
                  ×
                </button>
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={child.name || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.children_below_18[index].name = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Age</label>
                    <input
                      type="number"
                      min={0}
                      max={17}
                      value={child.age || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.children_below_18[index].age = e.target.value
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-add-item"
              onClick={() => addItem('children_below_18', () => ({ name: '', age: '' }))}
            >
              + Add Child
            </button>
          </div>
        </div>

        <div className="form-section" data-section="realProperties">
          <div className="section-header" onClick={() => toggleSection('realProperties')}>
            <div className="section-header-main">
              <h3>Real Properties</h3>
              {renderSectionStatus('realProperties')}
            </div>
            <span className="section-toggle">{openSections.realProperties ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.realProperties ? 'active' : ''}`}>
            {formData.assets.real_properties.map((item, index) => (
              <div className="repeater-item" key={`real-${index}`}>
                <button type="button" className="repeater-remove" onClick={() => removeAssetItem('real_properties', index)}>
                  ×
                </button>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) =>
                      updateForm((next) => {
                        next.assets.real_properties[index].description = e.target.value
                      })
                    }
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Kind</label>
                    <select
                      value={item.kind || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.real_properties[index].kind = e.target.value
                        })
                      }
                    >
                      <option value="">Select</option>
                      <option value="RESIDENTIAL">Residential</option>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="INDUSTRIAL">Industrial</option>
                      <option value="AGRICULTURAL">Agricultural</option>
                      <option value="MIXED_USE">Mixed Use</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Location</label>
                    <input
                      type="text"
                      value={item.exact_location || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.real_properties[index].exact_location = e.target.value
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Assessed Value (PHP)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.assessed_value || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.real_properties[index].assessed_value = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Fair Market Value (PHP)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.fair_market_value || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.real_properties[index].fair_market_value = e.target.value
                        })
                      }
                    />
                  </div>
                </div>

                <h4 style={{ marginTop: '16px' }}>Acquisition</h4>
                <div className="form-row-3">
                  <div className="form-group">
                    <label>Year</label>
                    <input
                      type="number"
                      min={1900}
                      max={2100}
                      value={item.acquisition?.year || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.real_properties[index].acquisition.year = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Mode</label>
                    <select
                      value={item.acquisition?.mode || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.real_properties[index].acquisition.mode = e.target.value
                        })
                      }
                    >
                      <option value="">Select</option>
                      <option value="PURCHASE">Purchase</option>
                      <option value="INHERITANCE">Inheritance</option>
                      <option value="DONATION">Donation</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cost (PHP)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.acquisition?.cost || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.real_properties[index].acquisition.cost = e.target.value
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() =>
                addAssetItem('real_properties', () => ({
                  description: '',
                  kind: '',
                  exact_location: '',
                  assessed_value: '',
                  fair_market_value: '',
                  acquisition: { year: '', mode: '', cost: '' },
                }))
              }
            >
              + Add Real Property
            </button>
          </div>
        </div>

        <div className="form-section" data-section="personalProperties">
          <div className="section-header" onClick={() => toggleSection('personalProperties')}>
            <div className="section-header-main">
              <h3>Personal Properties</h3>
              {renderSectionStatus('personalProperties')}
            </div>
            <span className="section-toggle">{openSections.personalProperties ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.personalProperties ? 'active' : ''}`}>
            {formData.assets.personal_properties.map((item, index) => (
              <div className="repeater-item" key={`personal-${index}`}>
                <button type="button" className="repeater-remove" onClick={() => removeAssetItem('personal_properties', index)}>
                  ×
                </button>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) =>
                      updateForm((next) => {
                        next.assets.personal_properties[index].description = e.target.value
                      })
                    }
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Year Acquired</label>
                    <input
                      type="number"
                      min={1900}
                      max={2100}
                      value={item.acquisition_year || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.personal_properties[index].acquisition_year = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Acquisition Cost (PHP)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.acquisition_cost || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.assets.personal_properties[index].acquisition_cost = e.target.value
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() =>
                addAssetItem('personal_properties', () => ({
                  description: '',
                  acquisition_year: '',
                  acquisition_cost: '',
                }))
              }
            >
              + Add Personal Property
            </button>
          </div>
        </div>

        <div className="form-section" data-section="liabilities">
          <div className="section-header" onClick={() => toggleSection('liabilities')}>
            <div className="section-header-main">
              <h3>Liabilities</h3>
              {renderSectionStatus('liabilities')}
            </div>
            <span className="section-toggle">{openSections.liabilities ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.liabilities ? 'active' : ''}`}>
            {formData.liabilities.map((item, index) => (
              <div className="repeater-item" key={`liability-${index}`}>
                <button type="button" className="repeater-remove" onClick={() => removeItem('liabilities', index)}>
                  ×
                </button>

                <div className="form-row-3">
                  <div className="form-group">
                    <label>Nature</label>
                    <input
                      type="text"
                      value={item.nature || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.liabilities[index].nature = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Creditor Name</label>
                    <input
                      type="text"
                      value={item.creditor_name || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.liabilities[index].creditor_name = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Outstanding Balance (PHP)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.outstanding_balance || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.liabilities[index].outstanding_balance = e.target.value
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() => addItem('liabilities', () => ({ nature: '', creditor_name: '', outstanding_balance: '' }))}
            >
              + Add Liability
            </button>
          </div>
        </div>

        <div className="form-section" data-section="business">
          <div className="section-header" onClick={() => toggleSection('business')}>
            <div className="section-header-main">
              <h3>Business Interests and Financial Connections</h3>
              {renderSectionStatus('business')}
            </div>
            <span className="section-toggle">{openSections.business ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.business ? 'active' : ''}`}>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={!formData.business_interests.has_business_interest}
                  onChange={(e) =>
                    updateForm((next) => {
                      const isNotApplicable = e.target.checked
                      next.business_interests.has_business_interest = !isNotApplicable
                      if (isNotApplicable) {
                        next.business_interests.entries = []
                      }
                    })
                  }
                />{' '}
                N/A
              </label>
            </div>

            {formData.business_interests.has_business_interest
              ? formData.business_interests.entries.map((item, index) => (
                  <div className="repeater-item" key={`business-${index}`}>
                    <button type="button" className="repeater-remove" onClick={() => removeBusinessEntry(index)}>
                      ×
                    </button>

                    <div className="form-group">
                      <label>Entity Name</label>
                      <input
                        type="text"
                        value={item.entity_name || ''}
                        onChange={(e) =>
                          updateForm((next) => {
                            next.business_interests.entries[index].entity_name = e.target.value
                          })
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label>Business Address</label>
                      <input
                        type="text"
                        value={item.business_address || ''}
                        onChange={(e) =>
                          updateForm((next) => {
                            next.business_interests.entries[index].business_address = e.target.value
                          })
                        }
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Nature of Interest</label>
                        <input
                          type="text"
                          value={item.nature_of_interest || ''}
                          onChange={(e) =>
                            updateForm((next) => {
                              next.business_interests.entries[index].nature_of_interest = e.target.value
                            })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Date Acquired</label>
                        <input
                          type="date"
                          value={item.date_acquired || ''}
                          onChange={(e) =>
                            updateForm((next) => {
                              next.business_interests.entries[index].date_acquired = e.target.value
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              : null}

            {formData.business_interests.has_business_interest ? (
              <button type="button" className="btn btn-add-item" onClick={addBusinessEntry}>
                + Add Business Interest
              </button>
            ) : null}
          </div>
        </div>

        <div className="form-section" data-section="relatives">
          <div className="section-header" onClick={() => toggleSection('relatives')}>
            <div className="section-header-main">
              <h3>Relatives in Government Service</h3>
              {renderSectionStatus('relatives')}
            </div>
            <span className="section-toggle">{openSections.relatives ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.relatives ? 'active' : ''}`}>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={!formData.relatives_in_government.has_relatives}
                  onChange={(e) =>
                    updateForm((next) => {
                      const isNotApplicable = e.target.checked
                      next.relatives_in_government.has_relatives = !isNotApplicable
                      if (isNotApplicable) {
                        next.relatives_in_government.entries = []
                      }
                    })
                  }
                />{' '}
                N/A
              </label>
            </div>

            {formData.relatives_in_government.has_relatives
              ? formData.relatives_in_government.entries.map((item, index) => (
                  <div className="repeater-item" key={`relative-${index}`}>
                    <button type="button" className="repeater-remove" onClick={() => removeRelativeEntry(index)}>
                      ×
                    </button>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Name</label>
                        <input
                          type="text"
                          value={item.relative_name || ''}
                          onChange={(e) =>
                            updateForm((next) => {
                              next.relatives_in_government.entries[index].relative_name = e.target.value
                            })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Relationship</label>
                        <input
                          type="text"
                          value={item.relationship || ''}
                          onChange={(e) =>
                            updateForm((next) => {
                              next.relatives_in_government.entries[index].relationship = e.target.value
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Position</label>
                        <input
                          type="text"
                          value={item.position || ''}
                          onChange={(e) =>
                            updateForm((next) => {
                              next.relatives_in_government.entries[index].position = e.target.value
                            })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Agency/Office</label>
                        <input
                          type="text"
                          value={item.agency_office || ''}
                          onChange={(e) =>
                            updateForm((next) => {
                              next.relatives_in_government.entries[index].agency_office = e.target.value
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              : null}

            {formData.relatives_in_government.has_relatives ? (
              <button type="button" className="btn btn-add-item" onClick={addRelativeEntry}>
                + Add Relative
              </button>
            ) : null}
          </div>
        </div>

        <div className="form-section" data-section="certification">
          <div className="section-header" onClick={() => toggleSection('certification')}>
            <div className="section-header-main">
              <h3>Certification</h3>
              {renderSectionStatus('certification')}
            </div>
            <span className="section-toggle">{openSections.certification ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.certification ? 'active' : ''}`}>
            <div className="form-group">
              <label>Date Signed</label>
              <input
                type="date"
                value={formData.certification.date_signed || ''}
                onChange={(e) =>
                  updateForm((next) => {
                    next.certification.date_signed = e.target.value
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={!!formData.certification.authorization_to_verify}
                  onChange={(e) =>
                    updateForm((next) => {
                      next.certification.authorization_to_verify = e.target.checked
                    })
                  }
                />{' '}
                I authorize the Ombudsman or authorized representative to verify my SALN statements
              </label>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '24px' }}>
          <h3 style={{ marginBottom: '12px' }}>Net Worth Summary</h3>
          <div className="form-row">
            <p style={{ margin: 0 }}><strong>Total Assets:</strong> PHP {formatCurrency(assetsTotal)}</p>
            <p style={{ margin: 0 }}><strong>Total Liabilities:</strong> PHP {formatCurrency(liabilitiesTotal)}</p>
          </div>
          <p style={{ marginTop: '12px', marginBottom: 0 }}>
            <strong>Net Worth:</strong> PHP {formatCurrency(netWorth)}
          </p>
        </div>

        <div className="privacy-notice">
          <p style={{ fontWeight: 500, marginBottom: '8px' }}>Privacy Reminder</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
            Your data will be automatically deleted after 5 days of inactivity. Export your data locally as JSON for backup.
          </p>
          </div>
        </div>

      <footer style={{ backgroundColor: 'var(--bg-light)', borderTop: '1px solid var(--border-color)', padding: '32px 0', marginTop: '48px' }}>
        <div className="container">
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            © {new Date().getFullYear()} SALN Filing System
          </p>
        </div>
      </footer>
    </>
  )
}

export default App
