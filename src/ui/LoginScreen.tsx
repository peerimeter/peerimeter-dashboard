import { ArrowUpRight, Github, Globe2, KeyRound, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { normalizeServiceURL } from '../api'
import { Brand } from './Sidebar'

type Credentials = { url: string; key: string; authMode?: 'password' | 'github' | 'session' }
type AuthConfig = { password_login_enabled: boolean; github_sso_enabled: boolean }

export function SessionRestoreScreen() {
  return <main className="login-page"><div className="loading-line"><span className="live-dot" />Restoring your session…</div></main>
}

export function LoginScreen({ credentials, serviceURLs, error, busy, onCredentialsChange, onSubmit, onGitHubSignIn }: {
  credentials: Credentials
  serviceURLs: string[]
  error: string
  busy: boolean
  onCredentialsChange: React.Dispatch<React.SetStateAction<Credentials>>
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onGitHubSignIn: () => void
}) {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const normalizedURL = normalizeServiceURL(credentials.url)
  const selectedURL = serviceURLs.includes(normalizedURL) ? normalizedURL : '__custom'

  useEffect(() => {
    let active = true
    const serviceURL = normalizeServiceURL(credentials.url)
    if (!serviceURL) {
      setAuthConfig({ password_login_enabled: true, github_sso_enabled: false })
      return
    }
    fetch(`${serviceURL}/api/v1/auth/config`).then(async (response) => {
      if (!response.ok) throw new Error('auth config unavailable')
      return response.json() as Promise<AuthConfig>
    }).then((config) => { if (active) setAuthConfig(config) }).catch(() => {
      if (active) setAuthConfig({ password_login_enabled: true, github_sso_enabled: false })
    })
    return () => { active = false }
  }, [normalizedURL])

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
            onCredentialsChange({
              ...credentials,
              url: event.target.value === '__custom' ? '' : event.target.value,
            })
          }}>
            <option value="__custom">Enter a service URL</option>
            {serviceURLs.map((url) => <option key={url} value={url}>{url}</option>)}
          </select>
        </label>}
        <label>Service URL<span className="input-icon"><Globe2 size={16} />
          <input required type="text" inputMode="url" name="username" autoComplete="username" placeholder="https://service.example.com" value={credentials.url} onChange={(event) => onCredentialsChange({ ...credentials, url: event.target.value })} />
        </span></label>
        {authConfig === null && <p className="login-foot">Checking service sign-in options…</p>}
        {authConfig?.password_login_enabled && <label>API key<span className="input-icon"><KeyRound size={16} />
          <input required type="password" name="password" autoComplete="current-password" placeholder="Paste your service API key" value={credentials.key} onChange={(event) => onCredentialsChange({ ...credentials, key: event.target.value })} />
        </span></label>}
        {error && <p className="error-text">{error}</p>}
        {authConfig?.password_login_enabled && <button className="button primary full" disabled={busy}>{busy ? 'Connecting…' : 'Connect to service'}<ArrowUpRight size={16} /></button>}
        {authConfig?.github_sso_enabled && <button className="button primary full" type="button" disabled={busy || !normalizedURL} onClick={onGitHubSignIn}><Github size={16} />Continue with GitHub</button>}
      </form>
      {authConfig?.password_login_enabled && <p className="login-foot"><Shield size={14} /> Your API key stays in this browser tab session.</p>}
    </div>
    <div className="login-glow" />
  </main>
}
