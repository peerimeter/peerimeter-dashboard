import { ArrowUpRight, Globe2, KeyRound, Shield } from 'lucide-react'
import { normalizeServiceURL } from '../api'
import { Brand } from './Sidebar'

type Credentials = { url: string; key: string }

export function SessionRestoreScreen() {
  return <main className="login-page"><div className="loading-line"><span className="live-dot" />Restoring your session…</div></main>
}

export function LoginScreen({ credentials, serviceURLs, error, busy, onCredentialsChange, onSubmit }: {
  credentials: Credentials
  serviceURLs: string[]
  error: string
  busy: boolean
  onCredentialsChange: React.Dispatch<React.SetStateAction<Credentials>>
  onSubmit: React.FormEventHandler<HTMLFormElement>
}) {
  const normalizedURL = normalizeServiceURL(credentials.url)
  const selectedURL = serviceURLs.includes(normalizedURL) ? normalizedURL : '__custom'

  return <main className="login-page">
    <div className="login-card">
      <Brand />
      <div className="login-copy">
        <span className="eyebrow">CONTROL PLANE</span>
        <h1>Your networks,<br /><em>in one place.</em></h1>
        <p>Connect to your Peerimeter Service and manage your mesh.</p>
      </div>
      <form onSubmit={onSubmit} className="form-stack">
        {serviceURLs.length > 0 && <label>Previously used URL
          <select aria-label="Previous endpoint list" value={selectedURL} onChange={(event) => {
            if (event.target.value !== '__custom') onCredentialsChange({ ...credentials, url: event.target.value })
          }}>
            <option value="__custom">Enter a service URL</option>
            {serviceURLs.map((url) => <option key={url} value={url}>{url}</option>)}
          </select>
        </label>}
        <label>Service URL<span className="input-icon"><Globe2 size={16} />
          <input required type="text" inputMode="url" name="username" autoComplete="username" placeholder="https://service.example.com" value={credentials.url} onChange={(event) => onCredentialsChange({ ...credentials, url: event.target.value })} />
        </span></label>
        <label>API key<span className="input-icon"><KeyRound size={16} />
          <input required type="password" name="password" autoComplete="current-password" placeholder="Paste your service API key" value={credentials.key} onChange={(event) => onCredentialsChange({ ...credentials, key: event.target.value })} />
        </span></label>
        {error && <p className="error-text">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? 'Connecting…' : 'Connect to service'}<ArrowUpRight size={16} /></button>
      </form>
      <p className="login-foot"><Shield size={14} /> Your API key stays in this browser tab session.</p>
    </div>
    <div className="login-glow" />
  </main>
}
