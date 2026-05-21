import axios from 'axios'

const SESSION_TOKEN_KEY = 'saln_token'
const SESSION_USER_KEY = 'saln_user'

const authClient = axios.create({
  baseURL: '/api/auth',
})

const formClient = axios.create({
  baseURL: '/api/forms',
})

const documentClient = axios.create({
  baseURL: '/api/documents',
})

function attachAuth(config) {
  const token = getAuthToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
}

function attachDocumentAuth(config) {
  const token = getAuthToken()
  const user = getCurrentUser()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // The document Lambda validates identity via X-User-Id directly
  if (user?.id) {
    config.headers['X-User-Id'] = user.id
  }

  return config
}

authClient.interceptors.request.use(attachAuth)
formClient.interceptors.request.use(attachAuth)
documentClient.interceptors.request.use(attachDocumentAuth)

function handleUnauthorized(error) {
  if (error?.response?.status === 401) {
    clearSession()

    const currentPath = window.location.pathname
    if (currentPath !== '/login') {
      window.location.assign('/login?reason=expired')
    }
  }

  return Promise.reject(error)
}

authClient.interceptors.response.use((response) => response, handleUnauthorized)
formClient.interceptors.response.use((response) => response, handleUnauthorized)
documentClient.interceptors.response.use((response) => response, handleUnauthorized)

export function getAuthToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY)
}

export function getCurrentUser() {
  const raw = localStorage.getItem(SESSION_USER_KEY)

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setSession(token, user) {
  localStorage.setItem(SESSION_TOKEN_KEY, token)
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY)
  localStorage.removeItem(SESSION_USER_KEY)
}

export const authApi = {
  sendCode: (email) => authClient.post('/send-code', { email }),
  verifyLogin: (payload) => authClient.post('/verify-login', payload),
  me: () => authClient.get('/me'),
  logout: () => authClient.post('/logout'),
}

export const formApi = {
  latest: () => formClient.get('/forms/latest'),
  save: (formData) => formClient.post('/forms/save', { form_data: formData }),
  export: () => formClient.get('/forms/export'),
  importData: (formData) => formClient.post('/forms/import', { form_data: formData }),
  newEntry: () => formClient.post('/forms/new'),
}

export const documentApi = {
  generate: (formData) => documentClient.post('/generate', { form_data: formData }),
  show: (documentId) => documentClient.get(`/${documentId}`),
  downloadBlob: async (documentId) => {
    const response = await documentClient.get(`/${documentId}/download`, { responseType: 'blob' })
    return response.data
  },
}
