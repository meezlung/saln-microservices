import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
const GOV_ID_NUMBER_REGEX = /^\d*$/
const WHOLE_NUMBER_REGEX = /^\d*$/
const DECIMAL_NUMBER_REGEX = /^\d*(\.\d{0,2})?$/
const PDF_POLL_INTERVAL_MS = 2000
const PDF_POLL_MAX_ATTEMPTS = 30

function generateRowId(prefix) {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${prefix}_${globalThis.crypto.randomUUID()}`
    }
  } catch {
    // ignore
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

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
    schema_version: '1.1.0',
    form_metadata: {
      form_type: 'SALN_2025',
      compliance_type: 'ASSUMPTION',
      as_of_date: defaultAsOfDate,
      filing_type: 'JOINT',
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
    spouses: [],
    children_below_18: [],
    assets: {
      declarant: {
        real_properties: [],
        personal_properties: [],
      },
      spouse_children: {
        real_properties: [],
        personal_properties: [],
      },
    },
    liabilities: {
      declarant: [],
      spouse_children: [],
    },
    business_interests: {
      declarant: {
        has_business_interest: false,
        entries: [],
      },
      spouse_children: {
        has_business_interest: false,
        entries: [],
      },
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

  const assetsDeclarant = data.assets?.declarant
  const assetsSpouseChildren = data.assets?.spouse_children

  const liabilitiesDeclarant = data.liabilities?.declarant
  const liabilitiesSpouseChildren = data.liabilities?.spouse_children

  const businessDeclarant = data.business_interests?.declarant
  const businessSpouseChildren = data.business_interests?.spouse_children

  const rawSpouses = Array.isArray(data.spouses) ? data.spouses : data.spouse ? [{ ...data.spouse }] : []
  const spouses = rawSpouses.map((spouse) => {
    const id = typeof spouse?.id === 'string' && spouse.id ? spouse.id : generateRowId('spouse')
    return { ...spouse, id }
  })

  const rawChildren = Array.isArray(data.children_below_18) ? data.children_below_18 : []
  const children_below_18 = rawChildren.map((child) => {
    const id = typeof child?.id === 'string' && child.id ? child.id : generateRowId('child')
    return { ...child, id }
  })

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
    spouses,
    children_below_18,
    assets: {
      ...base.assets,
      ...(data.assets || {}),
      declarant: {
        ...base.assets.declarant,
        ...(assetsDeclarant || {}),
        real_properties: Array.isArray(assetsDeclarant?.real_properties) ? assetsDeclarant.real_properties : [],
        personal_properties: Array.isArray(assetsDeclarant?.personal_properties) ? assetsDeclarant.personal_properties : [],
      },
      spouse_children: {
        ...base.assets.spouse_children,
        ...(assetsSpouseChildren || {}),
        real_properties: Array.isArray(assetsSpouseChildren?.real_properties) ? assetsSpouseChildren.real_properties : [],
        personal_properties: Array.isArray(assetsSpouseChildren?.personal_properties)
          ? assetsSpouseChildren.personal_properties
          : [],
      },
    },
    liabilities: {
      ...base.liabilities,
      ...(typeof data.liabilities === 'object' && data.liabilities ? data.liabilities : {}),
      declarant: Array.isArray(liabilitiesDeclarant) ? liabilitiesDeclarant : [],
      spouse_children: Array.isArray(liabilitiesSpouseChildren) ? liabilitiesSpouseChildren : [],
    },
    business_interests: {
      ...base.business_interests,
      ...(data.business_interests || {}),
      declarant: {
        ...base.business_interests.declarant,
        ...(businessDeclarant || {}),
        has_business_interest:
          typeof businessDeclarant?.has_business_interest === 'boolean'
            ? businessDeclarant.has_business_interest
            : base.business_interests.declarant.has_business_interest,
        entries: Array.isArray(businessDeclarant?.entries) ? businessDeclarant.entries : [],
      },
      spouse_children: {
        ...base.business_interests.spouse_children,
        ...(businessSpouseChildren || {}),
        has_business_interest:
          typeof businessSpouseChildren?.has_business_interest === 'boolean'
            ? businessSpouseChildren.has_business_interest
            : base.business_interests.spouse_children.has_business_interest,
        entries: Array.isArray(businessSpouseChildren?.entries) ? businessSpouseChildren.entries : [],
      },
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
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
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showNewEntryConfirm, setShowNewEntryConfirm] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isDirty, setIsDirty] = useState(false)
  const [sectionEmptyCounts, setSectionEmptyCounts] = useState({})
  const [govIdNumberError, setGovIdNumberError] = useState('')
  const [numericFieldErrors, setNumericFieldErrors] = useState({})

  const formDataRef = useRef(formData)
  const dirtyRef = useRef(isDirty)

  useEffect(() => {
    formDataRef.current = formData
  }, [formData])

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  const ownerOptions = useMemo(() => {
    const options = []

    ;(formData.spouses || []).forEach((spouse, index) => {
      if (!spouse) {
        return
      }

      const spouseId = typeof spouse.id === 'string' && spouse.id ? spouse.id : null
      if (!spouseId) {
        return
      }

      const last = String(spouse.last_name || '').trim()
      const first = String(spouse.first_name || '').trim()
      const mi = String(spouse.middle_initial || '').trim()

      let name = ''
      if (last && first) {
        name = `${last}, ${first}`
      } else {
        name = last || first
      }
      if (mi) {
        name = `${name}${name ? ' ' : ''}${mi}.`
      }

      options.push({
        value: `spouse:${spouseId}`,
        label: `Spouse: ${name || `Spouse #${index + 1}`}`,
      })
    })

    ;(formData.children_below_18 || []).forEach((child, index) => {
      if (!child) {
        return
      }

      const childId = typeof child.id === 'string' && child.id ? child.id : null
      if (!childId) {
        return
      }

      const name = String(child.name || '').trim()
      options.push({
        value: `child:${childId}`,
        label: `Child: ${name || `Child #${index + 1}`}`,
      })
    })

    return options
  }, [formData.spouses, formData.children_below_18])

  const ownerOptionMap = useMemo(() => {
    return new Map(ownerOptions.map((o) => [o.value, o.label]))
  }, [ownerOptions])

  function renderOwnerSelect(value, onChange) {
    const selectedValue = value || ''
    const isMissing = selectedValue !== '' && !ownerOptionMap.has(selectedValue)

    return (
      <div className="form-group">
        <label>Owner (Spouse/Child)</label>
        <select value={selectedValue} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select</option>
          {ownerOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {isMissing ? <option value={selectedValue}>(Removed)</option> : null}
        </select>
        {ownerOptions.length === 0 ? (
          <p className="form-help">Add a spouse/child above to select an owner.</p>
        ) : null}
      </div>
    )
  }

  function clearOwnerRefs(next, removedOwnerRef) {
    if (!removedOwnerRef) {
      return
    }

    const real = next.assets?.spouse_children?.real_properties || []
    real.forEach((item) => {
      if (item && item.owner_ref === removedOwnerRef) {
        item.owner_ref = ''
      }
    })

    const personal = next.assets?.spouse_children?.personal_properties || []
    personal.forEach((item) => {
      if (item && item.owner_ref === removedOwnerRef) {
        item.owner_ref = ''
      }
    })

    const liabilities = next.liabilities?.spouse_children || []
    liabilities.forEach((item) => {
      if (item && item.owner_ref === removedOwnerRef) {
        item.owner_ref = ''
      }
    })

    const businessEntries = next.business_interests?.spouse_children?.entries || []
    businessEntries.forEach((item) => {
      if (item && item.owner_ref === removedOwnerRef) {
        item.owner_ref = ''
      }
    })
  }

  useEffect(() => {
    setNumericFieldErrors((prev) => {
      const next = { ...prev }

      Object.keys(next).forEach((key) => {
        if (
          (key.startsWith('children_below_18.') && key.endsWith('.age')) ||
          key.includes('assets.declarant.real_properties.') ||
          key.includes('assets.spouse_children.real_properties.') ||
          key.includes('assets.declarant.personal_properties.') ||
          key.includes('assets.spouse_children.personal_properties.') ||
          key.includes('liabilities.declarant.') ||
          key.includes('liabilities.spouse_children.')
        ) {
          delete next[key]
        }
      })

      formData.children_below_18.forEach((child, index) => {
        const value = String(child?.age ?? '')
        if (value === '') {
          return
        }

        const errorKey = `children_below_18.${index}.age`

        if (!WHOLE_NUMBER_REGEX.test(value)) {
          next[errorKey] = 'Age must contain digits only.'
          return
        }

        if (Number(value) >= 18) {
          next[errorKey] = 'Age must be below 18.'
        }
      })

      const assetBuckets = ['declarant', 'spouse_children']

      assetBuckets.forEach((bucket) => {
        const realItems = formData.assets?.[bucket]?.real_properties || []
        const personalItems = formData.assets?.[bucket]?.personal_properties || []

        realItems.forEach((item, index) => {
          const assessedValue = String(item?.assessed_value ?? '')
          if (assessedValue !== '' && !DECIMAL_NUMBER_REGEX.test(assessedValue)) {
            next[`assets.${bucket}.real_properties.${index}.assessed_value`] = 'Enter numbers only (up to 2 decimal places).'
          }

          const fairMarketValue = String(item?.fair_market_value ?? '')
          if (fairMarketValue !== '' && !DECIMAL_NUMBER_REGEX.test(fairMarketValue)) {
            next[`assets.${bucket}.real_properties.${index}.fair_market_value`] = 'Enter numbers only (up to 2 decimal places).'
          }

          const acquisitionCost = String(item?.acquisition?.cost ?? '')
          if (acquisitionCost !== '' && !DECIMAL_NUMBER_REGEX.test(acquisitionCost)) {
            next[`assets.${bucket}.real_properties.${index}.acquisition.cost`] = 'Enter numbers only (up to 2 decimal places).'
          }
        })

        personalItems.forEach((item, index) => {
          const acquisitionCost = String(item?.acquisition_cost ?? '')
          if (acquisitionCost !== '' && !DECIMAL_NUMBER_REGEX.test(acquisitionCost)) {
            next[`assets.${bucket}.personal_properties.${index}.acquisition_cost`] = 'Enter numbers only (up to 2 decimal places).'
          }
        })

        const liabilitiesItems = formData.liabilities?.[bucket] || []
        liabilitiesItems.forEach((item, index) => {
          const outstandingBalance = String(item?.outstanding_balance ?? '')
          if (outstandingBalance !== '' && !DECIMAL_NUMBER_REGEX.test(outstandingBalance)) {
            next[`liabilities.${bucket}.${index}.outstanding_balance`] = 'Enter numbers only (up to 2 decimal places).'
          }
        })
      })

      return next
    })
  }, [
    formData.children_below_18,
    formData.assets,
    formData.assets.declarant.real_properties,
    formData.assets.declarant.personal_properties,
    formData.assets.spouse_children.real_properties,
    formData.assets.spouse_children.personal_properties,
    formData.liabilities,
    formData.liabilities.declarant,
    formData.liabilities.spouse_children,
  ])

  const allRealProperties = [...formData.assets.declarant.real_properties, ...formData.assets.spouse_children.real_properties]
  const allPersonalProperties = [
    ...formData.assets.declarant.personal_properties,
    ...formData.assets.spouse_children.personal_properties,
  ]
  const allLiabilities = [...formData.liabilities.declarant, ...formData.liabilities.spouse_children]

  const realTotal = allRealProperties.reduce((sum, item) => sum + Number(item.fair_market_value || 0), 0)
  const personalTotal = allPersonalProperties.reduce((sum, item) => sum + Number(item.acquisition_cost || 0), 0)
  const liabilitiesTotal = allLiabilities.reduce((sum, item) => sum + Number(item.outstanding_balance || 0), 0)
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
        const hasValidationError = field.getAttribute('aria-invalid') === 'true'
        field.classList.toggle('field-empty', value === '' || hasValidationError)
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

    let rafId = null
    const scheduleApplyEmptyIndicators = () => {
      try {
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
        }
      } catch {
        rafId = null
      }

      rafId = requestAnimationFrame(() => {
        try {
          applyEmptyIndicators()
        } finally {
          rafId = null
        }
      })
    }

    formRoot.addEventListener('input', scheduleApplyEmptyIndicators)
    formRoot.addEventListener('change', scheduleApplyEmptyIndicators)

    return () => {
      if (rafId !== null) {
        try {
          cancelAnimationFrame(rafId)
        } catch {
          // ignore
        }
        rafId = null
      }
      formRoot.removeEventListener('input', scheduleApplyEmptyIndicators)
      formRoot.removeEventListener('change', scheduleApplyEmptyIndicators)
    }
  }, [formData, openSections, loading])

  function renderSectionStatus(sectionKey) {
    // Special case: Certification section requires checkbox to be checked
    if (sectionKey === 'certification') {
      if (!formData.certification?.authorization_to_verify) {
        return <span className="section-status incomplete">1 empty</span>
      }
      return <span className="section-status complete">Complete</span>
    }
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
    if (field === 'id_number') {
      if (!GOV_ID_NUMBER_REGEX.test(value)) {
        setGovIdNumberError('ID Number must contain digits only.')
        return
      }

      setGovIdNumberError('')
    }

    updateForm((next) => {
      next.declarant.personal_information.government_id[field] = value
    })
  }

  function setNumericFieldError(key, message) {
    setNumericFieldErrors((prev) => {
      if (!message) {
        if (!prev[key]) {
          return prev
        }

        const next = { ...prev }
        delete next[key]
        return next
      }

      return {
        ...prev,
        [key]: message,
      }
    })
  }

  function setChildAgeField(index, value) {
    const errorKey = `children_below_18.${index}.age`

    if (!WHOLE_NUMBER_REGEX.test(value)) {
      setNumericFieldError(errorKey, 'Age must contain digits only.')
      return
    }

    if (value !== '' && Number(value) >= 18) {
      setNumericFieldError(errorKey, 'Age must be below 18.')

      updateForm((next) => {
        next.children_below_18[index].age = ''
      })
      return
    }

    setNumericFieldError(errorKey, '')

    updateForm((next) => {
      next.children_below_18[index].age = value
    })
  }

  function setRealPropertyValueField(bucket, index, field, value) {
    const errorKey = `assets.${bucket}.real_properties.${index}.${field}`

    if (!DECIMAL_NUMBER_REGEX.test(value)) {
      setNumericFieldError(errorKey, 'Enter numbers only (up to 2 decimal places).')
      return
    }

    setNumericFieldError(errorKey, '')

    updateForm((next) => {
      if (field === 'acquisition.cost') {
        next.assets[bucket].real_properties[index].acquisition.cost = value
        return
      }

      next.assets[bucket].real_properties[index][field] = value
    })
  }

  function setPersonalPropertyCostField(bucket, index, value) {
    const errorKey = `assets.${bucket}.personal_properties.${index}.acquisition_cost`

    if (!DECIMAL_NUMBER_REGEX.test(value)) {
      setNumericFieldError(errorKey, 'Enter numbers only (up to 2 decimal places).')
      return
    }

    setNumericFieldError(errorKey, '')

    updateForm((next) => {
      next.assets[bucket].personal_properties[index].acquisition_cost = value
    })
  }

  function setLiabilityBalanceField(bucket, index, value) {
    const errorKey = `liabilities.${bucket}.${index}.outstanding_balance`

    if (!DECIMAL_NUMBER_REGEX.test(value)) {
      setNumericFieldError(errorKey, 'Enter numbers only (up to 2 decimal places).')
      return
    }

    setNumericFieldError(errorKey, '')

    updateForm((next) => {
      next.liabilities[bucket][index].outstanding_balance = value
    })
  }

  function addSpouse() {
    updateForm((next) => {
      next.spouses.push({
        id: generateRowId('spouse'),
        is_public_official: false,
        last_name: '',
        first_name: '',
        middle_initial: '',
        position: '',
        agency_office: '',
        office_address: '',
      })
    })
  }

  function removeSpouse(index) {
    updateForm((next) => {
      const removedId = next.spouses[index]?.id
      next.spouses.splice(index, 1)
      if (typeof removedId === 'string' && removedId) {
        clearOwnerRefs(next, `spouse:${removedId}`)
      }
    })
  }

  function setSpouseField(index, field, value) {
    updateForm((next) => {
      if (!next.spouses[index]) {
        next.spouses[index] = {
          id: generateRowId('spouse'),
          is_public_official: false,
          last_name: '',
          first_name: '',
          middle_initial: '',
          position: '',
          agency_office: '',
          office_address: '',
        }
      }
      next.spouses[index][field] = value
    })
  }

  function addChild() {
    updateForm((next) => {
      next.children_below_18.push({ id: generateRowId('child'), name: '', age: '' })
    })
  }

  function removeChild(index) {
    updateForm((next) => {
      const removedId = next.children_below_18[index]?.id
      next.children_below_18.splice(index, 1)
      if (typeof removedId === 'string' && removedId) {
        clearOwnerRefs(next, `child:${removedId}`)
      }
    })
  }

  function addLiabilityItem(bucket, templateFactory) {
    updateForm((next) => {
      next.liabilities[bucket].push(templateFactory())
    })
  }

  function removeLiabilityItem(bucket, index) {
    updateForm((next) => {
      next.liabilities[bucket].splice(index, 1)
    })
  }

  function addAssetItem(bucket, key, templateFactory) {
    updateForm((next) => {
      next.assets[bucket][key].push(templateFactory())
    })
  }

  function removeAssetItem(bucket, key, index) {
    updateForm((next) => {
      next.assets[bucket][key].splice(index, 1)
    })
  }

  function addBusinessEntry(bucket) {
    updateForm((next) => {
      const entry = {
        entity_name: '',
        business_address: '',
        nature_of_interest: '',
        date_acquired: '',
      }

      if (bucket === 'spouse_children') {
        entry.owner_ref = ''
      }

      next.business_interests[bucket].entries.push(entry)
    })
  }

  function removeBusinessEntry(bucket, index) {
    updateForm((next) => {
      next.business_interests[bucket].entries.splice(index, 1)
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
    setIsGeneratingPdf(true)
    setNoticeType('info')
    setNotice('Generating PDF. Please wait...')

    try {
      const response = await documentApi.generate(formData)
      const documentId = response?.data?.document_id

      if (!documentId) {
        throw new Error('Document ID was not returned by the service.')
      }

      let documentStatus = ''

      for (let attempt = 0; attempt < PDF_POLL_MAX_ATTEMPTS; attempt += 1) {
        const statusResponse = await documentApi.show(documentId)
        const payload = statusResponse?.data?.data
        documentStatus = payload?.status || ''

        if (documentStatus === 'completed') {
          setPreviewUrl(`/api/documents/${documentId}/preview`)
          setDownloadUrl(`/api/documents/${documentId}/download`)
          setShowPreviewModal(true)
          setNoticeType('success')
          setNotice('PDF generated. Preview is ready.')
          return
        }

        if (documentStatus === 'failed') {
          throw new Error('PDF generation failed.')
        }

        if (attempt < PDF_POLL_MAX_ATTEMPTS - 1) {
          await sleep(PDF_POLL_INTERVAL_MS)
        }
      }

      throw new Error('PDF generation timed out. Please try again in a moment.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send document generation request.'
      setNoticeType('error')
      setNotice(message)
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  function handleClosePreviewModal() {
    setShowPreviewModal(false)
  }

  function handleDownloadPdf() {
    if (!downloadUrl) {
      return
    }

    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.click()
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

  // Section summaries
  const realPropertiesFairMarketTotal = allRealProperties.reduce((sum, item) => sum + Number(item.fair_market_value || 0), 0)
  const realPropertiesAssessedTotal = allRealProperties.reduce((sum, item) => sum + Number(item.assessed_value || 0), 0)
  const personalPropertiesTotal = allPersonalProperties.reduce((sum, item) => sum + Number(item.acquisition_cost || 0), 0)
  const liabilitiesOutstandingTotal = allLiabilities.reduce((sum, item) => sum + Number(item.outstanding_balance || 0), 0)

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

      {showNewEntryConfirm ? (
        <div className="modal active">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Start New Entry</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to start a new entry? Unsaved changes will be lost.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewEntryConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  setShowNewEntryConfirm(false)
                  await handleNewEntry()
                }}
              >
                Start New Entry
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPreviewModal ? (
        <div className="modal active">
          <div className="modal-content preview-modal-content">
            <div className="modal-header preview-modal-header">
              <h3 style={{ margin: 0 }}>PDF Preview</h3>
              <button
                type="button"
                aria-label="Close preview"
                className="preview-close-btn"
                onClick={handleClosePreviewModal}
              >
                X
              </button>
            </div>
            <div className="modal-body preview-modal-body">
              <iframe title="Generated PDF Preview" src={previewUrl} className="preview-iframe" />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-success" onClick={handleDownloadPdf}>
                Download PDF
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleClosePreviewModal}>
                Close
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
              <button type="button" className="btn btn-secondary" onClick={() => setShowNewEntryConfirm(true)}>New Entry</button>
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
              <button type="button" className="btn btn-primary" onClick={handleGeneratePdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? 'Generating PDF...' : 'Generate PDF'}
              </button>
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
                  inputMode="numeric"
                  aria-invalid={!!govIdNumberError}
                />
                {govIdNumberError ? <p className="error">{govIdNumberError}</p> : null}
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
            {formData.spouses.length === 0 ? (
              <div className="form-group">
                <label>No spouse added.</label>
              </div>
            ) : null}
            {formData.spouses.map((spouse, idx) => (
              <div className="repeater-item" key={spouse?.id || `spouse-${idx}`}> 
                <button type="button" className="repeater-remove" onClick={() => removeSpouse(idx)}>
                  ×
                </button>
                <div className="form-row-3">
                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={spouse.last_name || ''}
                      onChange={(e) => setSpouseField(idx, 'last_name', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={spouse.first_name || ''}
                      onChange={(e) => setSpouseField(idx, 'first_name', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Middle Initial</label>
                    <input
                      type="text"
                      value={spouse.middle_initial || ''}
                      onChange={(e) => setSpouseField(idx, 'middle_initial', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!spouse.is_public_official}
                      onChange={(e) => setSpouseField(idx, 'is_public_official', e.target.checked)}
                    />{' '}
                    Is a public official
                  </label>
                </div>

                <div className="form-group">
                  <label>Position</label>
                  <input
                    type="text"
                    value={spouse.position || ''}
                    onChange={(e) => setSpouseField(idx, 'position', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Agency/Office</label>
                  <input
                    type="text"
                    value={spouse.agency_office || ''}
                    onChange={(e) => setSpouseField(idx, 'agency_office', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Office Address</label>
                  <input
                    type="text"
                    value={spouse.office_address || ''}
                    onChange={(e) => setSpouseField(idx, 'office_address', e.target.value)}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-add-item"
              onClick={addSpouse}
            >
              + Add Spouse
            </button>
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
              <div className="repeater-item" key={child?.id || `child-${index}`}>
                <button type="button" className="repeater-remove" onClick={() => removeChild(index)}>
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
                      type="text"
                      inputMode="numeric"
                      value={child.age || ''}
                      onChange={(e) => setChildAgeField(index, e.target.value)}
                      aria-invalid={!!numericFieldErrors[`children_below_18.${index}.age`]}
                    />
                    {numericFieldErrors[`children_below_18.${index}.age`] ? (
                      <p className="error">{numericFieldErrors[`children_below_18.${index}.age`]}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-add-item"
              onClick={addChild}
            >
              + Add Child
            </button>
          </div>
        </div>

        <div className="form-section" data-section="realProperties">
          <div className="section-header" onClick={() => toggleSection('realProperties')}>
            <div className="section-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Real Properties</h3>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '14px' }}>
                Total Assessed: PHP {formatCurrency(realPropertiesAssessedTotal)} | Total FMV: PHP {formatCurrency(realPropertiesFairMarketTotal)}
              </span>
              {renderSectionStatus('realProperties')}
            </div>
            <span className="section-toggle">{openSections.realProperties ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.realProperties ? 'active' : ''}`}>
            <h4 style={{ marginTop: 0 }}>Declarant</h4>
            {formData.assets.declarant.real_properties.map((item, index) => (
              <div className="repeater-item" key={`real-declarant-${index}`}>
                <button
                  type="button"
                  className="repeater-remove"
                  onClick={() => removeAssetItem('declarant', 'real_properties', index)}
                >
                  ×
                </button>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) =>
                      updateForm((next) => {
                        next.assets.declarant.real_properties[index].description = e.target.value
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
                          next.assets.declarant.real_properties[index].kind = e.target.value
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
                          next.assets.declarant.real_properties[index].exact_location = e.target.value
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Assessed Value (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.assessed_value || ''}
                      onChange={(e) => setRealPropertyValueField('declarant', index, 'assessed_value', e.target.value)}
                      aria-invalid={!!numericFieldErrors[`assets.declarant.real_properties.${index}.assessed_value`]}
                    />
                    {numericFieldErrors[`assets.declarant.real_properties.${index}.assessed_value`] ? (
                      <p className="error">{numericFieldErrors[`assets.declarant.real_properties.${index}.assessed_value`]}</p>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label>Fair Market Value (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.fair_market_value || ''}
                      onChange={(e) => setRealPropertyValueField('declarant', index, 'fair_market_value', e.target.value)}
                      aria-invalid={!!numericFieldErrors[`assets.declarant.real_properties.${index}.fair_market_value`]}
                    />
                    {numericFieldErrors[`assets.declarant.real_properties.${index}.fair_market_value`] ? (
                      <p className="error">{numericFieldErrors[`assets.declarant.real_properties.${index}.fair_market_value`]}</p>
                    ) : null}
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
                          next.assets.declarant.real_properties[index].acquisition.year = e.target.value
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
                          next.assets.declarant.real_properties[index].acquisition.mode = e.target.value
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
                      type="text"
                      inputMode="decimal"
                      value={item.acquisition?.cost || ''}
                      onChange={(e) => setRealPropertyValueField('declarant', index, 'acquisition.cost', e.target.value)}
                      aria-invalid={!!numericFieldErrors[`assets.declarant.real_properties.${index}.acquisition.cost`]}
                    />
                    {numericFieldErrors[`assets.declarant.real_properties.${index}.acquisition.cost`] ? (
                      <p className="error">{numericFieldErrors[`assets.declarant.real_properties.${index}.acquisition.cost`]}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() =>
                addAssetItem('declarant', 'real_properties', () => ({
                  description: '',
                  kind: '',
                  exact_location: '',
                  assessed_value: '',
                  fair_market_value: '',
                  acquisition: { year: '', mode: '', cost: '' },
                }))
              }
            >
              + Add Declarant Real Property
            </button>

            <h4 style={{ marginTop: '24px' }}>Spouse/Children</h4>
            {formData.assets.spouse_children.real_properties.map((item, index) => (
              <div className="repeater-item" key={`real-spouse_children-${index}`}>
                <button
                  type="button"
                  className="repeater-remove"
                  onClick={() => removeAssetItem('spouse_children', 'real_properties', index)}
                >
                  ×
                </button>

                {renderOwnerSelect(item.owner_ref, (value) =>
                  updateForm((next) => {
                    next.assets.spouse_children.real_properties[index].owner_ref = value
                  }),
                )}

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) =>
                      updateForm((next) => {
                        next.assets.spouse_children.real_properties[index].description = e.target.value
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
                          next.assets.spouse_children.real_properties[index].kind = e.target.value
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
                          next.assets.spouse_children.real_properties[index].exact_location = e.target.value
                        })
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Assessed Value (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.assessed_value || ''}
                      onChange={(e) =>
                        setRealPropertyValueField('spouse_children', index, 'assessed_value', e.target.value)
                      }
                      aria-invalid={!!numericFieldErrors[`assets.spouse_children.real_properties.${index}.assessed_value`]}
                    />
                    {numericFieldErrors[`assets.spouse_children.real_properties.${index}.assessed_value`] ? (
                      <p className="error">{numericFieldErrors[`assets.spouse_children.real_properties.${index}.assessed_value`]}</p>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label>Fair Market Value (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.fair_market_value || ''}
                      onChange={(e) =>
                        setRealPropertyValueField('spouse_children', index, 'fair_market_value', e.target.value)
                      }
                      aria-invalid={!!numericFieldErrors[`assets.spouse_children.real_properties.${index}.fair_market_value`]}
                    />
                    {numericFieldErrors[`assets.spouse_children.real_properties.${index}.fair_market_value`] ? (
                      <p className="error">{numericFieldErrors[`assets.spouse_children.real_properties.${index}.fair_market_value`]}</p>
                    ) : null}
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
                          next.assets.spouse_children.real_properties[index].acquisition.year = e.target.value
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
                          next.assets.spouse_children.real_properties[index].acquisition.mode = e.target.value
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
                      type="text"
                      inputMode="decimal"
                      value={item.acquisition?.cost || ''}
                      onChange={(e) =>
                        setRealPropertyValueField('spouse_children', index, 'acquisition.cost', e.target.value)
                      }
                      aria-invalid={!!numericFieldErrors[`assets.spouse_children.real_properties.${index}.acquisition.cost`]}
                    />
                    {numericFieldErrors[`assets.spouse_children.real_properties.${index}.acquisition.cost`] ? (
                      <p className="error">{numericFieldErrors[`assets.spouse_children.real_properties.${index}.acquisition.cost`]}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() =>
                addAssetItem('spouse_children', 'real_properties', () => ({
                  owner_ref: '',
                  description: '',
                  kind: '',
                  exact_location: '',
                  assessed_value: '',
                  fair_market_value: '',
                  acquisition: { year: '', mode: '', cost: '' },
                }))
              }
            >
              + Add Spouse/Children Real Property
            </button>
          </div>
        </div>

        <div className="form-section" data-section="personalProperties">
          <div className="section-header" onClick={() => toggleSection('personalProperties')}>
            <div className="section-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Personal Properties</h3>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '14px' }}>Total: PHP {formatCurrency(personalPropertiesTotal)}</span>
              {renderSectionStatus('personalProperties')}
            </div>
            <span className="section-toggle">{openSections.personalProperties ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.personalProperties ? 'active' : ''}`}>
            <h4 style={{ marginTop: 0 }}>Declarant</h4>
            {formData.assets.declarant.personal_properties.map((item, index) => (
              <div className="repeater-item" key={`personal-declarant-${index}`}>
                <button
                  type="button"
                  className="repeater-remove"
                  onClick={() => removeAssetItem('declarant', 'personal_properties', index)}
                >
                  ×
                </button>

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) =>
                      updateForm((next) => {
                        next.assets.declarant.personal_properties[index].description = e.target.value
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
                          next.assets.declarant.personal_properties[index].acquisition_year = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Acquisition Cost (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.acquisition_cost || ''}
                      onChange={(e) => setPersonalPropertyCostField('declarant', index, e.target.value)}
                      aria-invalid={!!numericFieldErrors[`assets.declarant.personal_properties.${index}.acquisition_cost`]}
                    />
                    {numericFieldErrors[`assets.declarant.personal_properties.${index}.acquisition_cost`] ? (
                      <p className="error">{numericFieldErrors[`assets.declarant.personal_properties.${index}.acquisition_cost`]}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() =>
                addAssetItem('declarant', 'personal_properties', () => ({
                  description: '',
                  acquisition_year: '',
                  acquisition_cost: '',
                }))
              }
            >
              + Add Declarant Personal Property
            </button>

            <h4 style={{ marginTop: '24px' }}>Spouse/Children</h4>
            {formData.assets.spouse_children.personal_properties.map((item, index) => (
              <div className="repeater-item" key={`personal-spouse_children-${index}`}>
                <button
                  type="button"
                  className="repeater-remove"
                  onClick={() => removeAssetItem('spouse_children', 'personal_properties', index)}
                >
                  ×
                </button>

                {renderOwnerSelect(item.owner_ref, (value) =>
                  updateForm((next) => {
                    next.assets.spouse_children.personal_properties[index].owner_ref = value
                  }),
                )}

                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={item.description || ''}
                    onChange={(e) =>
                      updateForm((next) => {
                        next.assets.spouse_children.personal_properties[index].description = e.target.value
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
                          next.assets.spouse_children.personal_properties[index].acquisition_year = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Acquisition Cost (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.acquisition_cost || ''}
                      onChange={(e) => setPersonalPropertyCostField('spouse_children', index, e.target.value)}
                      aria-invalid={!!numericFieldErrors[`assets.spouse_children.personal_properties.${index}.acquisition_cost`]}
                    />
                    {numericFieldErrors[`assets.spouse_children.personal_properties.${index}.acquisition_cost`] ? (
                      <p className="error">{numericFieldErrors[`assets.spouse_children.personal_properties.${index}.acquisition_cost`]}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() =>
                addAssetItem('spouse_children', 'personal_properties', () => ({
                  owner_ref: '',
                  description: '',
                  acquisition_year: '',
                  acquisition_cost: '',
                }))
              }
            >
              + Add Spouse/Children Personal Property
            </button>
          </div>
        </div>

        <div className="form-section" data-section="liabilities">
          <div className="section-header" onClick={() => toggleSection('liabilities')}>
            <div className="section-header-main" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>Liabilities</h3>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '14px' }}>Total: PHP {formatCurrency(liabilitiesOutstandingTotal)}</span>
              {renderSectionStatus('liabilities')}
            </div>
            <span className="section-toggle">{openSections.liabilities ? '−' : '+'}</span>
          </div>
          <div className={`section-content ${openSections.liabilities ? 'active' : ''}`}>
            <h4 style={{ marginTop: 0 }}>Declarant</h4>
            {formData.liabilities.declarant.map((item, index) => (
              <div className="repeater-item" key={`liability-declarant-${index}`}>
                <button type="button" className="repeater-remove" onClick={() => removeLiabilityItem('declarant', index)}>
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
                          next.liabilities.declarant[index].nature = e.target.value
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
                          next.liabilities.declarant[index].creditor_name = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Outstanding Balance (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.outstanding_balance || ''}
                      onChange={(e) => setLiabilityBalanceField('declarant', index, e.target.value)}
                      aria-invalid={!!numericFieldErrors[`liabilities.declarant.${index}.outstanding_balance`]}
                    />
                    {numericFieldErrors[`liabilities.declarant.${index}.outstanding_balance`] ? (
                      <p className="error">{numericFieldErrors[`liabilities.declarant.${index}.outstanding_balance`]}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() => addLiabilityItem('declarant', () => ({ nature: '', creditor_name: '', outstanding_balance: '' }))}
            >
              + Add Declarant Liability
            </button>

            <h4 style={{ marginTop: '24px' }}>Spouse/Children</h4>
            {formData.liabilities.spouse_children.map((item, index) => (
              <div className="repeater-item" key={`liability-spouse_children-${index}`}>
                <button
                  type="button"
                  className="repeater-remove"
                  onClick={() => removeLiabilityItem('spouse_children', index)}
                >
                  ×
                </button>

                {renderOwnerSelect(item.owner_ref, (value) =>
                  updateForm((next) => {
                    next.liabilities.spouse_children[index].owner_ref = value
                  }),
                )}

                <div className="form-row-3">
                  <div className="form-group">
                    <label>Nature</label>
                    <input
                      type="text"
                      value={item.nature || ''}
                      onChange={(e) =>
                        updateForm((next) => {
                          next.liabilities.spouse_children[index].nature = e.target.value
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
                          next.liabilities.spouse_children[index].creditor_name = e.target.value
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Outstanding Balance (PHP)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.outstanding_balance || ''}
                      onChange={(e) => setLiabilityBalanceField('spouse_children', index, e.target.value)}
                      aria-invalid={!!numericFieldErrors[`liabilities.spouse_children.${index}.outstanding_balance`]}
                    />
                    {numericFieldErrors[`liabilities.spouse_children.${index}.outstanding_balance`] ? (
                      <p className="error">{numericFieldErrors[`liabilities.spouse_children.${index}.outstanding_balance`]}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-add-item"
              onClick={() =>
                addLiabilityItem('spouse_children', () => ({ owner_ref: '', nature: '', creditor_name: '', outstanding_balance: '' }))
              }
            >
              + Add Spouse/Children Liability
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
            <h4 style={{ marginTop: 0 }}>Declarant</h4>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={!formData.business_interests.declarant.has_business_interest}
                  onChange={(e) =>
                    updateForm((next) => {
                      const isNotApplicable = e.target.checked
                      next.business_interests.declarant.has_business_interest = !isNotApplicable
                      if (isNotApplicable) {
                        next.business_interests.declarant.entries = []
                      }
                    })
                  }
                />{' '}
                N/A
              </label>
            </div>

            {formData.business_interests.declarant.has_business_interest
              ? formData.business_interests.declarant.entries.map((item, index) => (
                  <div className="repeater-item" key={`business-declarant-${index}`}>
                    <button
                      type="button"
                      className="repeater-remove"
                      onClick={() => removeBusinessEntry('declarant', index)}
                    >
                      ×
                    </button>

                    <div className="form-group">
                      <label>Entity Name</label>
                      <input
                        type="text"
                        value={item.entity_name || ''}
                        onChange={(e) =>
                          updateForm((next) => {
                            next.business_interests.declarant.entries[index].entity_name = e.target.value
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
                            next.business_interests.declarant.entries[index].business_address = e.target.value
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
                              next.business_interests.declarant.entries[index].nature_of_interest = e.target.value
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
                              next.business_interests.declarant.entries[index].date_acquired = e.target.value
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              : null}

            {formData.business_interests.declarant.has_business_interest ? (
              <button type="button" className="btn btn-add-item" onClick={() => addBusinessEntry('declarant')}>
                + Add Declarant Business Interest
              </button>
            ) : null}

            <h4 style={{ marginTop: '24px' }}>Spouse/Children</h4>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={!formData.business_interests.spouse_children.has_business_interest}
                  onChange={(e) =>
                    updateForm((next) => {
                      const isNotApplicable = e.target.checked
                      next.business_interests.spouse_children.has_business_interest = !isNotApplicable
                      if (isNotApplicable) {
                        next.business_interests.spouse_children.entries = []
                      }
                    })
                  }
                />{' '}
                N/A
              </label>
            </div>

            {formData.business_interests.spouse_children.has_business_interest
              ? formData.business_interests.spouse_children.entries.map((item, index) => (
                  <div className="repeater-item" key={`business-spouse_children-${index}`}>
                    <button
                      type="button"
                      className="repeater-remove"
                      onClick={() => removeBusinessEntry('spouse_children', index)}
                    >
                      ×
                    </button>

                    {renderOwnerSelect(item.owner_ref, (value) =>
                      updateForm((next) => {
                        next.business_interests.spouse_children.entries[index].owner_ref = value
                      }),
                    )}

                    <div className="form-group">
                      <label>Entity Name</label>
                      <input
                        type="text"
                        value={item.entity_name || ''}
                        onChange={(e) =>
                          updateForm((next) => {
                            next.business_interests.spouse_children.entries[index].entity_name = e.target.value
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
                            next.business_interests.spouse_children.entries[index].business_address = e.target.value
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
                              next.business_interests.spouse_children.entries[index].nature_of_interest = e.target.value
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
                              next.business_interests.spouse_children.entries[index].date_acquired = e.target.value
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              : null}

            {formData.business_interests.spouse_children.has_business_interest ? (
              <button type="button" className="btn btn-add-item" onClick={() => addBusinessEntry('spouse_children')}>
                + Add Spouse/Children Business Interest
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
          <p style={{ margin: 0 }}><strong>Total Assets:</strong> PHP {formatCurrency(assetsTotal)}</p>
          <p style={{ margin: '8px 0 0 0', marginBottom: 0 }}><strong>Total Liabilities:</strong> PHP {formatCurrency(liabilitiesTotal)}</p>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />
          <p style={{ marginTop: 0, marginBottom: 0 }}>
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
