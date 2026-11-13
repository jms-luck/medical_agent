import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

type WorkflowStep = {
  number: string
  label: string
  status: 'complete' | 'active' | 'pending'
}

const steps: WorkflowStep[] = [
  { number: '01', label: 'Upload', status: 'complete' },
  { number: '02', label: 'Preprocess', status: 'complete' },
  { number: '03', label: 'Extract', status: 'complete' },
  { number: '04', label: 'Review', status: 'active' },
]

type SavedAnalysis = {
  id: string
  fileName: string
  savedAt: string
  status: 'Draft' | 'Reviewed'
}

type Medicine = {
  name: string
  dose: string
  quantity: string
  searchName: string
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

const geminiModels = [
  import.meta.env.VITE_GEMINI_MODEL,
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
].filter((model, index, models): model is string => Boolean(model) && models.indexOf(model) === index)

type GeminiAnalysis = {
  patientName?: string
  medicines?: Array<{ name?: string; dose?: string; frequency?: string; duration?: string }>
  warnings?: string[] | string
  patientExplanation?: string
  needsClinicianReview?: boolean
}

type MedicineDetail = {
  medicineName: string
  genericName?: string
  uses?: string[]
  commonForms?: string[]
  indiaAvailability?: string
  prescriptionStatusIndia?: string
  precautions?: string[]
  commonSideEffects?: string[]
  whenToSeekHelp?: string[]
  patientSummary?: string
  verificationNote?: string
}

type NearbyPlace = {
  id: number
  name: string
  type: 'Pharmacy' | 'Hospital'
  lat: number
  lon: number
  address?: string
}

type AgentFeature = {
  id: string
  name: string
  description: string
  icon: string
  accent: string
  services: string[]
  action: string
}

const agentFeatures: AgentFeature[] = [
  { id: 'med-analyzer', name: 'Med Analyzer', description: 'Search medicine knowledge, explain dosage context, and surface interaction signals.', icon: '✚', accent: 'blue', services: ['Azure AI Search', 'Form Recognizer', 'Azure OpenAI', 'Gemini'], action: 'Analyze medicines' },
  { id: 'prescription-analyzer', name: 'Prescription Analyzer', description: 'Extract structured prescription data and validate it with clinical context.', icon: '▤', accent: 'purple', services: ['Azure OpenAI', 'Custom Vision', 'AI Search', 'Azure Maps'], action: 'Analyze prescription' },
  { id: 'chatbot', name: 'Care Chatbot', description: 'Answer patient questions in simple language with source-aware responses.', icon: '☵', accent: 'green', services: ['AI Search', 'Auto-Queue', 'Form Recognizer'], action: 'Open care chat' },
  { id: 'disease-prediction', name: 'Disease Prediction', description: 'Identify risk patterns for clinician review, never as a standalone diagnosis.', icon: '◈', accent: 'orange', services: ['Gemini 1.5 Pro', 'AI Search', 'Form Recognizer'], action: 'Run risk scan' },
]

const medicines: Medicine[] = [
  { name: 'Paracetamol', dose: '500 mg tablet', quantity: '10 tablets', searchName: 'paracetamol 500mg' },
  { name: 'Amoxicillin', dose: '250 mg / 5 ml syrup', quantity: '1 bottle', searchName: 'amoxicillin 250mg syrup' },
]

const pharmacyPartners = [
  { name: 'MedPlus', eta: '30–45 min', price: '₹84', color: '#13845d', search: 'https://www.medplusmart.com/search?text=' },
  { name: 'Tata 1mg', eta: '1–2 days', price: '₹92', color: '#e33b51', search: 'https://www.1mg.com/search/all?name=' },
  { name: 'PharmEasy', eta: '1–2 days', price: '₹88', color: '#1686db', search: 'https://pharmeasy.in/search/all?name=' },
  { name: 'Netmeds', eta: '1–2 days', price: '₹95', color: '#11a58d', search: 'https://www.netmeds.com/catalogsearch/result?q=' },
]

const initialAnalysis: SavedAnalysis[] = [
  { id: 'demo-1', fileName: 'handwritten-prescription.jpg', savedAt: 'Today, 10:42 AM', status: 'Reviewed' },
]

function App() {
  const [fileName, setFileName] = useState('handwritten-prescription.jpg')
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isAnalyzed, setIsAnalyzed] = useState(true)
  const [activeNav, setActiveNav] = useState('New analysis')
  const [isRunning, setIsRunning] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [showBuyPanel, setShowBuyPanel] = useState(false)
  const [selectedPartner, setSelectedPartner] = useState('')
  const [toast, setToast] = useState('')
  const [geminiResult, setGeminiResult] = useState('')
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null)
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [agentRunning, setAgentRunning] = useState(false)
  const [libraryMedicine, setLibraryMedicine] = useState('')
  const [libraryDetail, setLibraryDetail] = useState<MedicineDetail | null>(null)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>(() => {
    try {
      const saved = localStorage.getItem('medscribe-analyses')
      return saved ? JSON.parse(saved) as SavedAnalysis[] : initialAnalysis
    } catch {
      return initialAnalysis
    }
  })

  const callGemini = async (apiKey: string, body: Record<string, unknown>) => {
    let lastStatus = 0
    for (const model of geminiModels) {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 30000)
      let response: Response
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Gemini request timed out. Check your network connection and try again.')
        }
        throw error
      } finally {
        window.clearTimeout(timeout)
      }
      if (response.ok) return await response.json() as GeminiResponse
      lastStatus = response.status
      if (response.status !== 404) break
    }
    throw new Error(`Gemini request failed with status ${lastStatus}. Set VITE_GEMINI_MODEL to a model available for this API key, confirm the Generative Language API is enabled, and rotate any exposed key.`)
  }

  useEffect(() => {
    localStorage.setItem('medscribe-analyses', JSON.stringify(savedAnalyses))
  }, [savedAnalyses])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setToast('File is too large. Please choose a file under 10 MB.')
      event.target.value = ''
      return
    }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setToast('Unsupported file type. Please choose an image or PDF.')
      event.target.value = ''
      return
    }
    setFileName(file.name)
    setUploadedFile(file)
    setFilePreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
    setIsAnalyzed(false)
    setToast('Prescription uploaded. Ready to analyze.')
  }

  const runAnalysis = async () => {
    setIsRunning(true)
    setGeminiResult('')
    setAnalysis(null)
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      window.setTimeout(() => {
        setIsRunning(false)
        setIsAnalyzed(true)
        setToast('Demo analysis completed. Add VITE_GEMINI_API_KEY for Gemini Vision.')
      }, 900)
      return
    }

    if (!uploadedFile || !uploadedFile.type.startsWith('image/')) {
      setIsRunning(false)
      setToast('Gemini Vision needs an uploaded image. PDF analysis is not enabled in this frontend.')
      return
    }

    try {
      const base64Image = await fileToBase64(uploadedFile)
      const payload = await callGemini(apiKey, {
          contents: [{
            parts: [
              { text: 'Read this prescription image. Return concise JSON with keys patientName, medicines (array of name, dose, frequency, duration), warnings, and patientExplanation. Do not invent missing values. Add "needsClinicianReview": true for unclear handwriting, allergies, interactions, or missing information.' },
              { inline_data: { mime_type: uploadedFile.type, data: base64Image } },
            ],
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      })
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) throw new Error('Gemini returned no analysis.')
      const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '')) as GeminiAnalysis
      setAnalysis(parsed)
      setGeminiResult(text)
      setIsRunning(false)
      setIsAnalyzed(true)
      setToast('Gemini Vision analysis completed.')
    } catch (error) {
      setIsRunning(false)
      setToast(error instanceof Error ? error.message : 'Gemini analysis failed.')
    }
  }

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read the uploaded image.'))
        return
      }
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('Could not read the uploaded image.'))
    reader.readAsDataURL(file)
  })

  const saveDraft = () => {
    const draft: SavedAnalysis = {
      id: crypto.randomUUID(),
      fileName,
      savedAt: 'Just now',
      status: 'Draft',
    }
    setSavedAnalyses((current) => [draft, ...current])
    setToast('Draft saved to local history.')
  }

  const startNewAnalysis = () => {
    setActiveNav('New analysis')
    setFileName('No file selected')
    setUploadedFile(null)
    setFilePreview(null)
    setGeminiResult('')
    setAnalysis(null)
    setIsAnalyzed(false)
    setToast('Started a new analysis.')
  }

  const pageTitle = useMemo(() => {
    if (activeNav === 'History') return 'Analysis history'
    if (activeNav === 'Patient records') return 'Patient records'
    if (activeNav === 'Medicine library') return 'Medicine library'
    if (activeNav === 'Settings') return 'Settings'
    if (activeNav === 'AI Agent Studio') return 'AI Agent Studio'
    if (activeNav === 'Nearby care') return 'Nearby care'
    return 'Prescription review'
  }, [activeNav])

  const openPartner = (partner: typeof pharmacyPartners[number], medicine: Medicine) => {
    setSelectedPartner(partner.name)
    window.open(`${partner.search}${encodeURIComponent(medicine.searchName)}`, '_blank', 'noopener,noreferrer')
    setToast(`Opening ${partner.name} search for ${medicine.name}.`)
  }

  const runAgent = (agent: AgentFeature) => {
    setActiveAgent(agent.id)
    if (agent.id === 'prescription-analyzer') {
      setActiveNav('New analysis')
      setToast('Prescription Analyzer is ready in the review workspace.')
      return
    }
    setAgentRunning(true)
    window.setTimeout(() => {
      setAgentRunning(false)
      setToast(`${agent.name} completed a local demo run.`)
    }, 850)
  }

  const loadMedicineDetails = async (medicineName: string) => {
      setLibraryMedicine(medicineName)
      setLibraryDetail(null)
      setLibraryLoading(true)
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        setLibraryLoading(false)
        setToast('Add VITE_GEMINI_API_KEY to load India-specific medicine details.')
        return
      }
      try {
        const payload = await callGemini(apiKey, {
            contents: [{
              parts: [{ text: `You are a medicine information assistant for India. Provide cautious, factual information about ${medicineName}. Return JSON only with keys: medicineName, genericName, uses (array), commonForms (array), indiaAvailability, prescriptionStatusIndia, precautions (array), commonSideEffects (array), whenToSeekHelp (array), patientSummary, verificationNote. Mention that schedules and availability can vary by state, formulation, and current CDSCO rules. Never recommend a personal dose, diagnosis, substitution, or stopping a prescribed medicine. Say when a pharmacist or doctor must verify the information. Use India-specific terminology and do not invent brand availability.` }],
            }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        })
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) throw new Error('Gemini returned no medicine details.')
        setLibraryDetail(JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '')) as MedicineDetail)
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Could not load medicine details.')
      } finally {
        setLibraryLoading(false)
      }
    }

  const findNearbyCare = () => {
    if (!navigator.geolocation) {
      setLocationError('Location is not supported by this browser.')
      return
    }

    setLocationLoading(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(async (position) => {
      const current = { lat: position.coords.latitude, lon: position.coords.longitude }
      setLocation(current)
      try {
        const query = `[out:json][timeout:15];(nwr["amenity"~"pharmacy|hospital"](around:5000,${current.lat},${current.lon}););out center tags;`
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
        if (!response.ok) throw new Error(`Nearby places request failed with status ${response.status}.`)
        const data = await response.json() as { elements?: Array<{ id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> }
        const places = (data.elements ?? []).map((element): NearbyPlace | null => {
          const lat = element.lat ?? element.center?.lat
          const lon = element.lon ?? element.center?.lon
          const amenity = element.tags?.amenity
          if (lat === undefined || lon === undefined || (amenity !== 'pharmacy' && amenity !== 'hospital')) return null
          return {
            id: element.id,
            name: element.tags?.name ?? (amenity === 'pharmacy' ? 'Nearby pharmacy' : 'Nearby hospital'),
            type: amenity === 'pharmacy' ? 'Pharmacy' : 'Hospital',
            lat,
            lon,
            address: [element.tags?.['addr:street'], element.tags?.['addr:city']].filter(Boolean).join(', ') || undefined,
          }
        }).filter((place): place is NearbyPlace => place !== null).slice(0, 20)
        setNearbyPlaces(places)
        setToast(`Found ${places.length} nearby care locations.`)
      } catch (error) {
        setLocationError(error instanceof Error ? error.message : 'Could not load nearby places.')
      } finally {
        setLocationLoading(false)
      }
    }, (error) => {
      setLocationLoading(false)
      setLocationError(error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Allow location access and try again.' : 'Could not determine your location.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 })
  }

  const mapUrl = location
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.lon - 0.06}%2C${location.lat - 0.04}%2C${location.lon + 0.06}%2C${location.lat + 0.04}&layer=mapnik&marker=${location.lat}%2C${location.lon}`
    : ''

  const displayedMedicines: Medicine[] = analysis?.medicines?.length
    ? analysis.medicines.filter((medicine) => medicine.name).map((medicine) => ({
      name: medicine.name ?? 'Unknown medicine',
      dose: medicine.dose ?? 'Dose not detected',
      quantity: medicine.duration ?? 'Verify quantity',
      searchName: `${medicine.name ?? ''} ${medicine.dose ?? ''}`.trim(),
    }))
    : medicines

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">+</div>
          <div>
            <strong>MedScribe</strong>
            <span>Prescription intelligence</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" aria-label="Notifications">●</button>
          <div className="user-avatar">DR</div>
          <div className="user-copy">
            <strong>Dr. Rao</strong>
            <span>Clinical reviewer</span>
          </div>
          <button className="chevron" aria-label="Open account menu">⌄</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-section-label">Workspace</div>
          {['New analysis', 'History', 'Patient records'].map((item) => (
            <button
              className={`nav-item ${activeNav === item ? 'selected' : ''}`}
              key={item}
              onClick={() => item === 'New analysis' ? startNewAnalysis() : setActiveNav(item)}
            >
              <span className="nav-icon">{item === 'New analysis' ? '+' : item === 'History' ? '◷' : '▣'}</span>
              {item}
            </button>
          ))}
          <div className="sidebar-divider" />
          <div className="sidebar-section-label">Tools</div>
          <button className={`nav-item ${activeNav === 'Medicine library' ? 'selected' : ''}`} onClick={() => setActiveNav('Medicine library')}><span className="nav-icon">◈</span>Medicine library</button>
          <button className={`nav-item ${activeNav === 'Settings' ? 'selected' : ''}`} onClick={() => setActiveNav('Settings')}><span className="nav-icon">⚙</span>Settings</button>
          <button className={`nav-item ${activeNav === 'AI Agent Studio' ? 'selected' : ''}`} onClick={() => setActiveNav('AI Agent Studio')}><span className="nav-icon">✦</span>AI Agent Studio</button>
          <button className={`nav-item ${activeNav === 'Nearby care' ? 'selected' : ''}`} onClick={() => setActiveNav('Nearby care')}><span className="nav-icon">⌖</span>Nearby care</button>
          <div className="sidebar-footer">
            <div className="secure-badge">✓</div>
            <div>
              <strong>Local workspace</strong>
              <span>Your files stay on this device.</span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">NEW ANALYSIS</span>
              <h1>{pageTitle}</h1>
              <p>{activeNav === 'New analysis' ? 'Turn a prescription image into clear, actionable information.' : 'Review your local workspace information.'}</p>
            </div>
            <button className="outline-button">View workflow</button>
          </div>

          {activeNav === 'New analysis' && <div className="stepper" aria-label="Analysis progress">
            {steps.map((step, index) => (
              <div className="step-wrapper" key={step.number}>
                <div className={`step ${step.status}`}>
                  <span className="step-number">{step.status === 'complete' ? '✓' : step.number}</span>
                  <span>{step.label}</span>
                </div>
                {index < steps.length - 1 && <div className={`step-line ${index < 3 ? 'filled' : ''}`} />}
              </div>
            ))}
          </div>}

          {activeNav === 'AI Agent Studio' && <section className="agent-studio">
            <div className="studio-hero">
              <div><span className="section-kicker">ORCHESTRATION LAYER</span><h2>One clinical workflow, four specialist agents.</h2><p>Connect extraction, medicine intelligence, patient conversations, and risk signals into one reviewable journey.</p></div>
              <div className="studio-status"><span className="status-pulse" /> Local orchestration active</div>
            </div>
            <div className="agent-grid">{agentFeatures.map((agent) => <article className={`agent-feature ${agent.accent}`} key={agent.id}>
              <div className="agent-feature-top"><div className="agent-feature-icon">{agent.icon}</div><span className="agent-state">{activeAgent === agent.id && agentRunning ? 'Running…' : 'Ready'}</span></div>
              <h2>{agent.name}</h2><p>{agent.description}</p>
              <div className="service-list">{agent.services.map((service) => <span key={service}>{service}</span>)}</div>
              <button className="secondary-button agent-action" onClick={() => runAgent(agent)} disabled={agentRunning}>{agent.action} <span>→</span></button>
            </article>)}</div>
            <div className="agent-pipeline"><div className="pipeline-heading"><div><span className="section-kicker">AGENT PIPELINE</span><h2>From prescription to safer decisions</h2></div><span className="pipeline-badge">Human review required</span></div><div className="pipeline-track">{['Upload', 'Extract', 'Understand', 'Explain', 'Review'].map((stage, index) => <div className="pipeline-stage" key={stage}><span>{index + 1}</span><strong>{stage}</strong>{index < 4 && <i>→</i>}</div>)}</div></div>
            <div className="studio-note"><span>ⓘ</span> Azure AI Search, Document Intelligence/Form Recognizer, Azure OpenAI, Azure Maps, and Gemini are represented as integration targets. Clinical outputs must be verified by a qualified professional.</div>
          </section>}

          {activeNav === 'Nearby care' && <section className="nearby-care">
            <div className="nearby-hero"><div><span className="section-kicker">LOCATION SERVICES</span><h2>Care near you</h2><p>Find nearby pharmacies and hospitals using your device location. Your coordinates stay in this browser.</p></div><button className="primary-button location-button" onClick={findNearbyCare} disabled={locationLoading}>{locationLoading ? 'Finding you…' : location ? 'Refresh my location' : 'Use my location'} <span>⌖</span></button></div>
            {locationError && <div className="location-error"><span>!</span>{locationError}</div>}
            {!location && !locationError && <div className="location-empty"><div className="location-empty-icon">⌖</div><h2>Enable location to see nearby care</h2><p>We use your browser's location permission to search within approximately 5 km.</p><button className="secondary-button" onClick={findNearbyCare}>Find pharmacies and hospitals</button></div>}
            {location && <div className="nearby-layout"><div className="map-card"><div className="map-header"><div><span className="section-kicker">MAP VIEW</span><h2>Your area</h2></div><a href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=14/${location.lat}/${location.lon}`} target="_blank" rel="noreferrer">Open full map ↗</a></div><iframe title="OpenStreetMap showing my location" src={mapUrl} loading="lazy" /><p className="map-attribution">Map data © OpenStreetMap contributors</p></div><div className="places-card"><div className="map-header"><div><span className="section-kicker">NEARBY RESULTS</span><h2>Pharmacies & hospitals</h2></div><span className="result-count">{nearbyPlaces.length}</span></div>{nearbyPlaces.length === 0 ? <p className="empty-note">No mapped places were found nearby. Try refreshing your location.</p> : <div className="places-list">{nearbyPlaces.map((place) => <div className="place-row" key={`${place.type}-${place.id}`}><div className={`place-icon ${place.type.toLowerCase()}`}>✚</div><div><strong>{place.name}</strong><span>{place.type}{place.address ? ` · ${place.address}` : ''}</span></div><a href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}`} target="_blank" rel="noreferrer" aria-label={`Open ${place.name} on map`}>↗</a></div>)}</div>}</div></div>}
          </section>}

          {activeNav === 'New analysis' && <><section className="upload-card">
            <div className="section-title-row">
              <div>
                <span className="section-kicker">STEP 01 · INPUT SOURCE</span>
                <h2>Upload a prescription</h2>
              </div>
              <span className="privacy-chip"><span>●</span> Private & local</span>
            </div>
            <label className={`dropzone ${filePreview ? 'has-preview' : ''}`}>
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} />
              {filePreview ? <img src={filePreview} alt="Uploaded prescription preview" /> : <div className="upload-icon">↑</div>}
              <strong>Drop an image or PDF here</strong>
              <span>or <u>browse from your device</u> · JPG, PNG, PDF up to 10 MB</span>
              <span className="file-pill">▧ {fileName}</span>
            </label>
            <div className="preprocess-row">
              <span className="processing-dot" />
              <span>Image preprocessing enabled</span>
              <span className="processing-detail">Noise removal · Contrast enhancement · Skew correction</span>
            </div>
          </section>

          <section className="review-grid">
            <div className="panel preview-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">STEP 02–03</span>
                  <h2>Extracted prescription</h2>
                </div>
                <span className="confidence"><span>✓</span> 96% confidence</span>
              </div>
              <div className="prescription-preview">
                <div className="paper">
                  <div className="paper-header">CityCare Clinic <span>Rx</span></div>
                  <div className="paper-rule" />
                  <p>Patient: <b>{analysis?.patientName ?? 'Arjun Mehta'}</b></p>
                  <p>Date: <b>12 Nov 2026</b></p>
                  <div className="paper-rule" />
                  <p className="rx-line"><b>Tab. Paracetamol 500mg</b><br /><span>1 tablet · after food · 5 days</span></p>
                  <p className="rx-line"><b>Syp. Amoxicillin 250mg/5ml</b><br /><span>5 ml · twice daily · 7 days</span></p>
                  <div className="signature">Dr. Priya Rao</div>
                </div>
                <div className="preview-caption"><span className="scan-icon">⌗</span> OCR layer aligned with source image</div>
              </div>
              <div className="extracted-fields">
                {displayedMedicines.slice(0, 4).map((medicine) => <div className="field-card" key={medicine.name}><span>MEDICINE</span><strong>{medicine.name}</strong><small>{medicine.dose} · {medicine.quantity}</small></div>)}
              </div>
            </div>

            <div className="panel analysis-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">STEP 04</span>
                  <h2>AI analysis</h2>
                </div>
                <span className="ai-chip">✦ {geminiResult ? 'Gemini Vision' : 'Local AI'}</span>
              </div>
              <div className="analysis-result success">
                <div className="result-icon">✓</div>
                <div><strong>Prescription validated</strong><span>Dosages and durations are within expected ranges.</span></div>
              </div>
              <div className="analysis-result warning">
                <div className="result-icon">!</div>
                <div><strong>Review interaction warning</strong><span>Amoxicillin may interact with the patient's recorded allergy.</span></div>
                <button onClick={() => setShowWarning(true)}>Review</button>
              </div>
              {analysis?.needsClinicianReview && <div className="review-needed"><span>!</span> Gemini recommends clinician review before purchase.</div>}
              {geminiResult && <div className="gemini-result"><div className="explanation-heading"><span className="sparkle">✦</span><strong>Gemini Vision result</strong><span className="ai-chip">Live</span></div><pre>{geminiResult}</pre></div>}
              <div className="explanation">
                <div className="explanation-heading"><span className="sparkle">✦</span><strong>Simple explanation</strong><span className="language">EN ▾</span></div>
                <p>{analysis?.patientExplanation ?? 'Take paracetamol after food for fever or pain. Take the amoxicillin syrup twice a day and complete the full course. A clinician should confirm the allergy warning before starting.'}</p>
              </div>
              <div className="analysis-actions">
                <button className="primary-button" disabled={isRunning} onClick={runAnalysis}>{isRunning ? 'Analyzing…' : isAnalyzed ? 'Run again' : 'Run analysis'} <span>→</span></button>
                <button className="secondary-button" onClick={saveDraft}>Save draft</button>
              </div>
            </div>
          </section>

          <section className="agent-buy-card">
            <div className="agent-avatar">✦</div>
            <div className="agent-buy-copy">
              <span className="section-kicker">MEDSCRIBE AGENT · NEXT STEP</span>
              <h2>Find these medicines online</h2>
              <p>I found {displayedMedicines.length} medicine{displayedMedicines.length === 1 ? '' : 's'} in this prescription. I can compare pharmacy options and take you to checkout.</p>
            </div>
            <button className="primary-button buy-button" onClick={() => setShowBuyPanel((current) => !current)}>{showBuyPanel ? 'Hide options' : 'Compare pharmacies'} <span>→</span></button>
          </section>

          {showBuyPanel && <section className="buy-panel">
            <div className="buy-panel-header">
              <div><span className="section-kicker">ASSISTED SHOPPING</span><h2>Choose where to buy</h2></div>
              <span className="demo-label">Demo availability · verify before purchase</span>
            </div>
            <div className="medicine-buy-list">
              {displayedMedicines.map((medicine) => <div className="medicine-buy-row" key={medicine.name}>
                <div className="medicine-buy-info"><div className="medicine-icon">Rx</div><div><strong>{medicine.name}</strong><span>{medicine.dose} · {medicine.quantity}</span></div></div>
                <div className="partner-list">{pharmacyPartners.map((partner) => <button className={`partner-button ${selectedPartner === partner.name ? 'active' : ''}`} key={partner.name} onClick={() => openPartner(partner, medicine)}><span className="partner-logo" style={{ backgroundColor: partner.color }}>{partner.name.charAt(0)}</span><span><b>{partner.name}</b><small>{partner.price} · {partner.eta}</small></span><i>↗</i></button>)}</div>
              </div>)}
            </div>
            <div className="buy-safety-note"><span>ⓘ</span> You will complete the purchase on the pharmacy website. Check prescription requirements, stock, price, dosage, and delivery address before ordering. MedScribe does not process payments.</div>
          </section>}

          <div className="disclaimer"><span>ⓘ</span> This tool provides informational support and does not replace professional medical judgment. Always confirm results with a qualified clinician.</div></>}

          {activeNav === 'History' && <section className="content-card">
            <div className="section-title-row"><div><span className="section-kicker">LOCAL WORKSPACE</span><h2>Saved analyses</h2></div><button className="primary-button compact" onClick={startNewAnalysis}>+ New analysis</button></div>
            <div className="history-list">{savedAnalyses.map((analysis) => <div className="history-row" key={analysis.id}><div className="history-file">▧</div><div><strong>{analysis.fileName}</strong><span>{analysis.savedAt}</span></div><span className={`status-pill ${analysis.status.toLowerCase()}`}>{analysis.status}</span><button className="secondary-button" onClick={() => { setActiveNav('New analysis'); setFileName(analysis.fileName); setIsAnalyzed(true) }}>Open</button></div>)}</div>
          </section>}

          {activeNav === 'Patient records' && <section className="content-card"><span className="section-kicker">PATIENT RECORDS</span><h2>Patient overview</h2><div className="record-card"><div className="record-avatar">AM</div><div><strong>Arjun Mehta</strong><span>Patient ID · MS-2048</span></div><span className="record-note">No synced records · local demo</span></div><div className="empty-note">Patient records will connect to the clinical backend when it is added.</div></section>}

          {activeNav === 'Medicine library' && <section className="content-card">
            <div className="library-heading"><div><span className="section-kicker">GEMINI INDIA REFERENCE</span><h2>Medicine library</h2><p>Ask Gemini for an India-focused reference summary. Verify every result with a licensed pharmacist or doctor.</p></div><span className="ai-chip">✦ Gemini live</span></div>
            <div className="medicine-grid">{['Paracetamol', 'Amoxicillin', 'Ibuprofen', 'Cetirizine'].map((medicine) => <div className="medicine-card" key={medicine}><div className="medicine-card-icon">Rx</div><strong>{medicine}</strong><span>Uses, forms, precautions & India availability</span><button className="secondary-button" onClick={() => loadMedicineDetails(medicine)} disabled={libraryLoading && libraryMedicine === medicine}>{libraryLoading && libraryMedicine === medicine ? 'Loading…' : 'Get India details'}</button></div>)}</div>
            {libraryLoading && <div className="library-loading"><span className="loading-spinner" /> Gemini is checking the India-specific reference…</div>}
            {libraryDetail && <div className="medicine-detail">
              <div className="detail-header"><div><span className="section-kicker">AI-GENERATED REFERENCE</span><h2>{libraryDetail.medicineName}</h2><span className="generic-label">{libraryDetail.genericName ?? 'Generic name not supplied'}</span></div><button className="modal-close inline-close" onClick={() => setLibraryDetail(null)} aria-label="Close medicine details">×</button></div>
              <div className="detail-summary">{libraryDetail.patientSummary ?? 'Review this information with a qualified healthcare professional.'}</div>
              <div className="detail-grid"><div><h3>Common uses</h3><ul>{(libraryDetail.uses ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Common forms</h3><ul>{(libraryDetail.commonForms ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>India availability</h3><p>{libraryDetail.indiaAvailability ?? 'Verify current availability locally.'}</p><p className="india-status">{libraryDetail.prescriptionStatusIndia ?? 'Ask a pharmacist about prescription requirements.'}</p></div><div><h3>Precautions</h3><ul>{(libraryDetail.precautions ?? []).map((item) => <li key={item}>{item}</li>)}</ul></div></div>
              <div className="detail-warning"><strong>Safety first</strong><p>{libraryDetail.verificationNote ?? 'This is not a prescription or diagnosis. Confirm the label, dose, interactions, and suitability with a doctor or pharmacist.'}</p></div>
            </div>}
          </section>}

          {activeNav === 'Settings' && <section className="content-card"><span className="section-kicker">PREFERENCES</span><h2>Settings</h2><div className="setting-row"><div><strong>Local-only mode</strong><span>Keep uploaded files and analysis history in this browser.</span></div><input type="checkbox" defaultChecked aria-label="Local-only mode" /></div><div className="setting-row"><div><strong>Clinical safety reminders</strong><span>Show a review disclaimer before using results.</span></div><input type="checkbox" defaultChecked aria-label="Clinical safety reminders" /></div></section>}
        </main>
        {toast && <div className="toast" role="status">{toast}</div>}
        {showWarning && <div className="modal-backdrop" onClick={() => setShowWarning(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="warning-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowWarning(false)} aria-label="Close warning">×</button><div className="modal-warning">!</div><h2 id="warning-title">Interaction warning</h2><p>Amoxicillin may interact with the patient's recorded allergy. Confirm the allergy history and prescription with a qualified clinician before starting this medicine.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setShowWarning(false)}>Close</button><button className="primary-button compact" onClick={() => { setShowWarning(false); setToast('Warning marked for clinician review.') }}>Mark for review</button></div></div></div>}
      </div>
    </div>
  )
}

export default App
