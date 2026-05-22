const THEME_STORAGE_KEY = 'theme'
export const DECIMAL_NUMBER_REGEX = /^\d*(\.\d{0,2})?$/
export const PDF_POLL_INTERVAL_MS = 2000
export const PDF_POLL_MAX_ATTEMPTS = 30

export function generateRowId(prefix) {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `${prefix}_${globalThis.crypto.randomUUID()}`
    }
  } catch {
    // ignore
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function getInitialTheme() {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function createEmptyForm() {
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

export function detectSALNSchema(data) {
  if (data == null || typeof data !== 'object') {
    throw new Error('Invalid SALN data')
  }

  if (Object.prototype.hasOwnProperty.call(data, 'schema_version') && Object.prototype.hasOwnProperty.call(data, 'form_metadata')) {
    return 'og'
  }

  if (Object.prototype.hasOwnProperty.call(data, 'compliance_type') && Object.prototype.hasOwnProperty.call(data, 'declarant')) {
    return 'new'
  }

  throw new Error('Unknown SALN schema')
}

export function parseSpouseName(fullName) {
  const parts = fullName.trim().split(/\s+/)

  const first_name = parts.shift() || ''
  const last_name = parts.pop() || ''

  let middle_initial = ''

  if (parts.length > 0) {
    middle_initial = parts
      .map((part) => {
        const cleaned = part.replace(/\./g, '')

        return cleaned.length === 1 ? cleaned.toUpperCase() : cleaned[0].toUpperCase()
      })
      .join('')
  }

  return {
    first_name,
    last_name,
    middle_initial,
  }
}

export function getScope(owner_scope) {
  return owner_scope === 'spouse_children' ? 'spouse_children' : 'declarant'
}

export function mapSALN(data) {
  const schema = detectSALNSchema(data)

  if (schema === 'og') {
    return data
  }

  if (schema === 'new') {
    const spouses = []

    if (data?.spouse) {
      spouses.push({
        is_public_official: false,
        last_name: data.spouse.family_name || '',
        first_name: data.spouse.first_name || '',
        middle_initial: data.spouse.middle_initial || '',
        position: data.spouse.position || '',
        agency_office: data.spouse.agency_office || '',
        office_address: data.spouse.office_address || '',
      })
    }

    (data?.additional_spouses || []).forEach((spouse) => {
      const parsed = parseSpouseName(spouse?.name || '')

      spouses.push({
        is_public_official: false,
        ...parsed,
        position: '',
        agency_office: '',
        office_address: '',
      })
    })

    const children_below_18 = (data?.children || []).map((child) => ({
      name: child?.name || '',
      birthday: child?.date_of_birth || '',
    }))

    const assets = {
      declarant: {
        real_properties: [],
        personal_properties: [],
      },
      spouse_children: {
        real_properties: [],
        personal_properties: [],
      },
    }

    const business_interests = {
      declarant: {
        has_business_interest: false,
        entries: [],
      },
      spouse_children: {
        has_business_interest: false,
        entries: [],
      },
    }

    const liabilities = {
      declarant: [],
      spouse_children: [],
    }

    const relatives_in_government = {
      has_relatives: false,
      entries: [],
    }

    (data?.real_properties || []).forEach((property) => {
      const scope = getScope(property?.owner_scope)

      assets[scope].real_properties.push({
        description: property?.description || '',
        kind: property?.kind || '',
        exact_location: property?.exact_location || '',
        assessed_value: property?.assessed_value || '',
        fair_market_value: property?.current_fair_market_value || '',
        acquisition: {
          year: property?.year_of_acquisition || '',
          mode: property?.mode_of_acquisition || '',
          cost: property?.acquisition_cost || '',
        },
      })
    })

    (data?.personal_properties || []).forEach((property) => {
      const scope = getScope(property?.owner_scope)

      assets[scope].personal_properties.push({
        description: property?.description || '',
        acquisition_year: property?.acquisition_year || '',
        acquisition_cost: property?.acquisition_cost_amount || '',
      })
    })

    (data?.business_interests || []).forEach((entry) => {
      const scope = getScope(entry?.owner_scope)

      business_interests[scope].entries.push({
        entity_name: entry?.name_of_entity_or_business_enterprise || '',
        business_address: entry?.business_address || '',
        nature_of_interest: entry?.nature_of_business_interest_or_financial_connection || '',
        date_acquired: entry?.date_of_acquisition || '',
      })

      business_interests[scope].has_business_interest = true
    })

    (data?.liabilities || []).forEach((entry) => {
      const scope = getScope(entry?.owner_scope)

      liabilities[scope].push({
        nature: entry?.nature || '',
        creditor_name: entry?.name_of_creditor || '',
        outstanding_balance: entry?.outstanding_balance || '',
      })
    })

    (data?.relatives_in_government_service || []).forEach((entry) => {
      relatives_in_government.has_relatives = true
      relatives_in_government.entries.push({
        relative_name: entry?.name_of_relative || '',
        relationship: entry?.relationship || '',
        position: entry?.position || '',
        agency_office: entry?.name_of_agency_office_and_address || '',
      })
    })

    return {
      form_metadata: {
        form_type: 'SALN_2025',
        compliance_type: data?.compliance_type?.toUpperCase() || 'ASSUMPTION',
        as_of_date: data?.assumption_date || '',
        filing_type: data?.filing_type?.toUpperCase() || 'JOINT',
      },
      declarant: {
        personal_information: {
          last_name: data?.declarant?.family_name || '',
          first_name: data?.declarant?.first_name || '',
          middle_initial: data?.declarant?.middle_initial || '',
          position: data?.declarant?.position || '',
          agency_office: data?.declarant?.agency_office || '',
          office_address: data?.declarant?.office_address || '',
        },
      },
      spouses,
      children_below_18,
      assets,
      liabilities,
      business_interests,
      relatives_in_government,
      certification: {
        date_signed: null,
        authorization_to_verify: false,
      },
    }
  }

  return data
}

export function normalizeFormData(raw) {
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
    const birthday = String(child?.birthday || '').trim()
    let age = null
    if (birthday) {
      const birthdayDate = new Date(`${birthday}T00:00:00`)
      if (!Number.isNaN(birthdayDate.getTime())) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        age = today.getFullYear() - birthdayDate.getFullYear()
        const monthDiff = today.getMonth() - birthdayDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdayDate.getDate())) {
          age -= 1
        }
      }
    }
    return { ...child, id, age }
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

export function formatCurrency(value) {
  const number = Number(value || 0)
  return number.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function calculateAgeToday(birthdayValue) {
  const birthday = new Date(birthdayValue)
  birthday.setHours(0, 0, 0, 0)
  if (Number.isNaN(birthday.getTime())) {
    return null
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let age = today.getFullYear() - birthday.getFullYear()
  const monthDiff = today.getMonth() - birthday.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthday.getDate())) {
    age -= 1
  }

  return age
}

export function computeSectionEmptyCounts(formData, numericFieldErrors) {
  const counts = {
    formInfo: 0,
    personalInfo: 0,
    spouseInfo: 0,
    childrenInfo: 0,
    realProperties: 0,
    personalProperties: 0,
    liabilities: 0,
    business: 0,
    relatives: 0,
    certification: 0,
  }

  const hasError = (key) => {
    if (!key) {
      return false
    }
    return !!numericFieldErrors?.[key]
  }

  const countField = (section, value, errorKey) => {
    if (!section || !(section in counts)) {
      return
    }

    if (hasError(errorKey)) {
      counts[section] += 1
      return
    }

    const normalized = String(value ?? '').trim()
    if (normalized === '') {
      counts[section] += 1
    }
  }

  countField('formInfo', formData?.form_metadata?.compliance_type)
  countField('formInfo', formData?.form_metadata?.as_of_date)
  countField('formInfo', formData?.form_metadata?.filing_type)

  const personal = formData?.declarant?.personal_information
  countField('personalInfo', personal?.last_name)
  countField('personalInfo', personal?.first_name)
  countField('personalInfo', personal?.middle_initial)
  countField('personalInfo', personal?.position)
  countField('personalInfo', personal?.agency_office)
  countField('personalInfo', personal?.office_address)


  const spouses = Array.isArray(formData?.spouses) ? formData.spouses : []
  spouses.forEach((spouse) => {
    if (!spouse) {
      return
    }
    countField('spouseInfo', spouse.last_name)
    countField('spouseInfo', spouse.first_name)
    countField('spouseInfo', spouse.middle_initial)
    if (spouse.is_public_official) {
      countField('spouseInfo', spouse.position)
      countField('spouseInfo', spouse.agency_office)
      countField('spouseInfo', spouse.office_address)
    }
  })

  const children = Array.isArray(formData?.children_below_18) ? formData.children_below_18 : []
  children.forEach((child, index) => {
    if (!child) {
      return
    }
    countField('childrenInfo', child.name)
    countField('childrenInfo', child.birthday, `children_below_18.${index}.birthday`)
  })

  ;['declarant', 'spouse_children'].forEach((bucket) => {
    const items = formData?.assets?.[bucket]?.real_properties
    if (!Array.isArray(items)) {
      return
    }

    items.forEach((item, index) => {
      if (!item) {
        return
      }

      if (bucket === 'spouse_children') {
        countField('realProperties', item.owner_ref)
      }

      countField('realProperties', item.description)
      countField('realProperties', item.kind)
      countField('realProperties', item.exact_location)
      countField('realProperties', item.assessed_value, `assets.${bucket}.real_properties.${index}.assessed_value`)
      countField('realProperties', item.fair_market_value, `assets.${bucket}.real_properties.${index}.fair_market_value`)
      countField('realProperties', item.acquisition?.year)
      countField('realProperties', item.acquisition?.mode)
      countField('realProperties', item.acquisition?.cost, `assets.${bucket}.real_properties.${index}.acquisition.cost`)
    })
  })

  ;['declarant', 'spouse_children'].forEach((bucket) => {
    const items = formData?.assets?.[bucket]?.personal_properties
    if (!Array.isArray(items)) {
      return
    }

    items.forEach((item, index) => {
      if (!item) {
        return
      }

      if (bucket === 'spouse_children') {
        countField('personalProperties', item.owner_ref)
      }

      countField('personalProperties', item.description)
      countField('personalProperties', item.acquisition_year)
      countField('personalProperties', item.acquisition_cost, `assets.${bucket}.personal_properties.${index}.acquisition_cost`)
    })
  })

  ;['declarant', 'spouse_children'].forEach((bucket) => {
    const items = formData?.liabilities?.[bucket]
    if (!Array.isArray(items)) {
      return
    }

    items.forEach((item, index) => {
      if (!item) {
        return
      }

      if (bucket === 'spouse_children') {
        countField('liabilities', item.owner_ref)
      }

      countField('liabilities', item.nature)
      countField('liabilities', item.creditor_name)
      countField('liabilities', item.outstanding_balance, `liabilities.${bucket}.${index}.outstanding_balance`)
    })
  })

  const businessDeclarant = formData?.business_interests?.declarant
  if (businessDeclarant?.has_business_interest) {
    const entries = Array.isArray(businessDeclarant.entries) ? businessDeclarant.entries : []
    entries.forEach((entry) => {
      if (!entry) {
        return
      }
      countField('business', entry.entity_name)
      countField('business', entry.business_address)
      countField('business', entry.nature_of_interest)
      countField('business', entry.date_acquired)
    })
  }

  const businessSpouseChildren = formData?.business_interests?.spouse_children
  if (businessSpouseChildren?.has_business_interest) {
    const entries = Array.isArray(businessSpouseChildren.entries) ? businessSpouseChildren.entries : []
    entries.forEach((entry) => {
      if (!entry) {
        return
      }
      countField('business', entry.owner_ref)
      countField('business', entry.entity_name)
      countField('business', entry.business_address)
      countField('business', entry.nature_of_interest)
      countField('business', entry.date_acquired)
    })
  }

  const relatives = formData?.relatives_in_government
  if (relatives?.has_relatives) {
    const entries = Array.isArray(relatives.entries) ? relatives.entries : []
    entries.forEach((entry) => {
      if (!entry) {
        return
      }
      countField('relatives', entry.relative_name)
      countField('relatives', entry.relationship)
      countField('relatives', entry.position)
      countField('relatives', entry.agency_office)
    })
  }

  if (!formData?.certification?.authorization_to_verify) {
    counts.certification = 1
  }

  return counts
}

export { THEME_STORAGE_KEY }
