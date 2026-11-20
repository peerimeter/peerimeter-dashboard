import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowUpRight, Check, ChevronRight, CircleHelp, Copy, Cpu, Eye, EyeOff, Globe2, KeyRound, LogOut, Plus, RefreshCw, Search, Shield, Users, X } from 'lucide-react'
import { defaultServiceURL, joinCommands, normalizeServiceURL, rememberServiceURL, savedServiceURLs, ServiceAPI } from '../api'
import type { Network, Peer, PeerConfig } from '../api'

type Credentials = { url: string; key: string }
const SESSION_STORAGE_KEY = 'peerimeter.session'
const COPY_RESET_MS = 1_800
const SESSION_RESTORE_TIMEOUT_MS = 8_000
const configuredServiceURL = import.meta.env.VITE_SERVICE_URL
const saved = (): Credentials => {
  const defaultURL = defaultServiceURL(configuredServiceURL, location.origin)
  try { return JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? 'null') ?? { url: defaultURL, key: '' } }
  catch { return { url: defaultURL, key: '' } }
}
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128)
const shortKey = (key: string) => key ? `${key.slice(0, 10)}…${key.slice(-6)}` : '—'

export function App() {
  const [credentials, setCredentials] = useState(saved)
  const [serviceURLs, setServiceURLs] = useState(() => savedServiceURLs(configuredServiceURL, location.origin))
  const [checkingSession, setCheckingSession] = useState(() => {
    const current = saved()
    return Boolean(current.key && current.url)
  })
  const [api, setAPI] = useState<ServiceAPI | null>(null)
  const [networks, setNetworks] = useState<Network[]>([])
  const [serviceVersion, setServiceVersion] = useState('')
  const [selectedID, setSelectedID] = useState('')
  const [peers, setPeers] = useState<Peer[]>([])
  const [peersLoading, setPeersLoading] = useState(false)
  const [peersLoadFailed, setPeersLoadFailed] = useState(false)
  const [networksLoading, setNetworksLoading] = useState(false)
  const [networksLoadFailed, setNetworksLoadFailed] = useState(false)
  const [peerNames, setPeerNames] = useState<Record<string, string>>({})
  const [active, setActive] = useState<Peer | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<'network' | 'peer' | 'join' | null>(null)
  const [peerConfig, setPeerConfig] = useState<PeerConfig>({ version: 1 })
  const [peerConfigLoaded, setPeerConfigLoaded] = useState(false)
  const [joinToken, setJoinToken] = useState('')
  const [showJoinToken, setShowJoinToken] = useState(false)
  const [copied, setCopied] = useState('')
  const peerLoadID = useRef(0)
  const refreshLoadID = useRef(0)
  const serviceVersionLoadID = useRef(0)
  const sessionID = useRef(0)
  const peerNameEditID = useRef<Record<string, number>>({})
  const peerConfigLoadID = useRef(0)
  const joinLoadID = useRef(0)

  const selected = networks.find((network) => network.id === selectedID) ?? null
  const peerCountLabel = peersLoadFailed ? '—' : String(peers.length)
  const filteredPeers = peers.filter((peer) => `${peerNames[peer.node_id] ?? ''} ${peer.node_id} ${peer.tunnel_address ?? ''} ${peer.public_key}`.toLowerCase().includes(search.toLowerCase()))
  const join = useMemo(() => joinToken && selected ? joinCommands() : null, [joinToken, selected])

  async function loadPeers(client: ServiceAPI, networkID: string, isCurrent = () => true) {
    const requestID = ++peerLoadID.current
    const nameEditSnapshot = { ...peerNameEditID.current }
    setPeers([]); setPeerNames({})
    setPeersLoading(Boolean(networkID)); setPeersLoadFailed(false)
    if (!networkID) return
    try {
      const nextPeers = await client.peers(networkID)
      if (requestID !== peerLoadID.current || !isCurrent()) return
      setPeers(nextPeers)
      setPeersLoading(false)
      const names = await Promise.all(nextPeers.map(async (peer) => {
        try {
          const config = await client.peerConfig(networkID, peer.node_id)
          return [peer.node_id, String(config?.name || peer.node_id)] as const
        } catch { return [peer.node_id, peer.node_id] as const }
      }))
      if (requestID === peerLoadID.current && isCurrent()) {
        setPeerNames((previous) => ({
          ...previous,
          ...Object.fromEntries(names.filter(([nodeID]) => (peerNameEditID.current[nodeID] ?? 0) === (nameEditSnapshot[nodeID] ?? 0))),
        }))
      }
    } catch (cause) {
      if (requestID === peerLoadID.current && isCurrent()) {
        setPeersLoading(false); setPeersLoadFailed(true)
        setError(cause instanceof Error ? cause.message : 'Could not load peers')
      }
    }
  }

  async function refresh(client = api, networkID = selectedID, isCurrent = () => true, knownNetworks?: Network[]) {
    if (!client) return
    const requestID = ++refreshLoadID.current
    const currentSessionID = sessionID.current
    const isRefreshCurrent = () => requestID === refreshLoadID.current && currentSessionID === sessionID.current && isCurrent()
    const versionRequestID = ++serviceVersionLoadID.current
    peerLoadID.current++
    setPeers([]); setPeerNames({})
    setPeersLoading(true); setPeersLoadFailed(false)
    setNetworksLoading(true)
    setBusy(true); setError('')
    try {
      void client.version().then((currentVersion) => {
        if (versionRequestID === serviceVersionLoadID.current && currentSessionID === sessionID.current && isCurrent()) {
          setServiceVersion(currentVersion)
        }
      }).catch(() => {
        if (versionRequestID === serviceVersionLoadID.current && currentSessionID === sessionID.current && isCurrent()) {
          setServiceVersion('')
        }
      })
      const items = knownNetworks ?? await client.networks()
      if (!isRefreshCurrent()) return
      setNetworksLoading(false); setNetworksLoadFailed(false)
      setNetworks(items)
      const nextID = items.some((network) => network.id === networkID) ? networkID : items[0]?.id ?? ''
      setSelectedID(nextID)
      void loadPeers(client, nextID, isRefreshCurrent)
    } catch (cause) {
      if (isRefreshCurrent()) {
        setPeersLoading(false); setPeersLoadFailed(true); setNetworksLoading(false)
        setNetworksLoadFailed(true)
        setError(cause instanceof Error ? cause.message : 'Could not load service data')
      }
    }
    finally { if (isRefreshCurrent()) setBusy(false) }
  }

  useEffect(() => {
    const current = saved()
    setCredentials(current)
    if (!current.key || !current.url) {
      setCheckingSession(false)
      return
    }
    const client = new ServiceAPI(current.url, current.key)
    let restoreActive = true
    const timeoutID = window.setTimeout(() => {
      restoreActive = false
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      setCredentials({ url: current.url, key: '' })
      setError('Could not restore your session. Please sign in again.')
      setBusy(false)
      setCheckingSession(false)
    }, SESSION_RESTORE_TIMEOUT_MS)
    client.verify().then(async (items) => {
      if (!restoreActive) return
      await refresh(client, '', () => restoreActive, items)
      if (!restoreActive) return
      setAPI(client)
      setCheckingSession(false)
    }).catch(() => {
      if (!restoreActive) return
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      setCredentials({ url: current.url, key: '' })
      setError('Could not restore your session. Please sign in again.')
      setCheckingSession(false)
    }).finally(() => {
      window.clearTimeout(timeoutID)
    })
    return () => {
      restoreActive = false
      window.clearTimeout(timeoutID)
    }
  }, [])

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const requestSessionID = ++sessionID.current
    const signedInCredentials = { ...credentials, url: credentials.url.trim() }
    const client = new ServiceAPI(signedInCredentials.url, signedInCredentials.key)
    try {
      await client.verify()
      if (sessionID.current !== requestSessionID) return
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(signedInCredentials))
      setCredentials(signedInCredentials)
      setServiceURLs([...new Set([...savedServiceURLs(configuredServiceURL, location.origin), ...rememberServiceURL(signedInCredentials.url)])])
      setAPI(client); await refresh(client, '', () => sessionID.current === requestSessionID)
    } catch (cause) { if (sessionID.current === requestSessionID) setError(cause instanceof Error ? cause.message : 'Could not connect to Peerimeter Service') }
    finally { if (sessionID.current === requestSessionID) setBusy(false) }
  }

  async function selectNetwork(id: string) {
    refreshLoadID.current++
    const requestSessionID = sessionID.current
    setNetworksLoading(false)
    setSelectedID(id); setActive(null); setJoinToken(''); setShowJoinToken(false); setError(''); joinLoadID.current++
    if (!api || !id) { setPeers([]); setPeerNames({}); setPeersLoading(false); setPeersLoadFailed(false); return }
    const client = api
    setBusy(true)
    try { await loadPeers(client, id, () => sessionID.current === requestSessionID) }
    finally { if (sessionID.current === requestSessionID) setBusy(false) }
  }

  async function openPeer(peer: Peer) {
    const requestID = ++peerConfigLoadID.current
    const networkID = selectedID
    setActive(peer); setPeerConfig({ version: 1 }); setPeerConfigLoaded(false); setError(''); setModal('peer')
    try {
      const config = await api?.peerConfig(networkID, peer.node_id)
      if (requestID !== peerConfigLoadID.current) return
      setPeerConfig(config ?? { version: 1, name: peer.node_id, notes: '' }); setPeerConfigLoaded(true)
    } catch (cause) { if (requestID === peerConfigLoadID.current) setError(cause instanceof Error ? cause.message : 'Could not load peer details') }
  }

  async function createNetwork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!api) return
    const client = api
    const requestSessionID = sessionID.current
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const network = { version: 1, name, id: slug(String(form.get('id') || name)), cidr: String(form.get('cidr') ?? '').trim() }
    setBusy(true); setError('')
    try {
      await client.createNetwork(network)
      if (sessionID.current !== requestSessionID) return
      closeModal(); setNotice('Network created'); await refresh(client, network.id, () => sessionID.current === requestSessionID)
    } catch (cause) { if (sessionID.current === requestSessionID) setError(cause instanceof Error ? cause.message : 'Could not create network') }
    finally { if (sessionID.current === requestSessionID) setBusy(false) }
  }

  async function savePeer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!api || !active) return
    const requestSessionID = sessionID.current
    const form = new FormData(event.currentTarget)
    const config = { ...peerConfig, version: 1, name: String(form.get('name') ?? '').trim(), notes: String(form.get('notes') ?? '').trim() }
    setBusy(true); setError('')
    try {
      await api.savePeerConfig(selectedID, active.node_id, config)
      if (sessionID.current !== requestSessionID) return
      peerNameEditID.current = { ...peerNameEditID.current, [active.node_id]: (peerNameEditID.current[active.node_id] ?? 0) + 1 }
      setPeerConfig(config); setPeerNames((previous) => ({ ...previous, [active.node_id]: String(config.name) })); closeModal(); setNotice('Peer details saved')
    } catch (cause) { if (sessionID.current === requestSessionID) setError(cause instanceof Error ? cause.message : 'Could not save peer') }
    finally { if (sessionID.current === requestSessionID) setBusy(false) }
  }

  async function showJoin() {
    if (!api) return
    const requestID = ++joinLoadID.current
    const networkID = selectedID
    setError(''); setJoinToken(''); setShowJoinToken(false); setModal('join')
    try { const token = await api.joinToken(networkID); if (requestID === joinLoadID.current) setJoinToken(token) }
    catch (cause) { if (requestID === joinLoadID.current) setError(cause instanceof Error ? cause.message : 'Could not create join bundle') }
  }

  function openNetworkModal() {
    setError('')
    setModal('network')
  }

  function closeModal() {
    if (modal === 'join') {
      joinLoadID.current++
      setJoinToken('')
      setShowJoinToken(false)
    }
    if (modal === 'peer') peerConfigLoadID.current++
    setModal(null)
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); window.setTimeout(() => setCopied(''), COPY_RESET_MS) }
    catch { setError('Clipboard access is unavailable. Select and copy the command manually.') }
  }

  function signOut() {
    sessionID.current++; refreshLoadID.current++; peerLoadID.current++; peerConfigLoadID.current++; joinLoadID.current++
    sessionStorage.removeItem(SESSION_STORAGE_KEY); setAPI(null); serviceVersionLoadID.current++; setServiceVersion(''); setNetworks([]); setPeers([]); setPeersLoading(false); setPeersLoadFailed(false); setNetworksLoading(false); setNetworksLoadFailed(false); setPeerNames({}); setSelectedID(''); setActive(null); setJoinToken(''); setShowJoinToken(false); setPeerConfig({ version: 1 }); setPeerConfigLoaded(false)
    setBusy(false)
    setCredentials({ url: defaultServiceURL(configuredServiceURL, location.origin), key: '' })
  }

  if (checkingSession) return <SessionRestoreScreen />

  if (!api) return <LoginScreen credentials={credentials} serviceURLs={serviceURLs} error={error} busy={busy} onCredentialsChange={setCredentials} onSubmit={signIn} />

  return <div className="app-shell">
    <Sidebar api={api} serviceVersion={serviceVersion} networks={networks} selectedID={selectedID} loading={networksLoading} failed={networksLoadFailed} onCreateNetwork={openNetworkModal} onSelectNetwork={(id) => void selectNetwork(id)} onSignOut={signOut} />
    <main className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><span>Networks</span>{selected && <><ChevronRight size={13} /><strong>{selected.name}</strong></>}</div><div className="top-actions"><span className="secure-pill"><span className="live-dot" /> API connected</span><button className="icon-button" title="Refresh" onClick={() => void refresh()}><RefreshCw size={16} className={busy ? 'spin' : ''} /></button><div className="avatar">P</div></div></header>
      {error && <div className="alert error-alert"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="alert success-alert"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
      {!selected ? <WelcomeSection loading={networksLoading} failed={networksLoadFailed} onRefresh={() => void refresh()} onCreateNetwork={openNetworkModal} /> : <>
        <section className="page-heading"><div><div className="eyebrow">NETWORK OVERVIEW <span className="heading-dot">/</span> {selected.id}</div><h1>{selected.name}</h1><p>Manage the peers connected to this network.</p></div><button className="button primary" onClick={() => void showJoin()}><Plus size={16} /> Add a peer</button></section>
        <section className="stats-grid">
          <Stat icon={<Users size={17} />} label="Connected peers" value={peersLoading ? <span className="skeleton-bar skeleton-number" aria-hidden="true" /> : peerCountLabel} hint={peersLoading ? 'Loading network peers' : peersLoadFailed ? 'Could not load peer count' : 'Registered on this network'} />
          <Stat icon={<Globe2 size={17} />} label="Network range" value={selected.cidr} hint="Private IPv4 address space" />
          <Stat icon={<Activity size={17} />} label="Network status" value="Active" hint="Service API reachable" active />
        </section>
        <PeersTableSection selected={selected} peers={peers} peerNames={peerNames} filteredPeers={filteredPeers} peersLoading={peersLoading} peersLoadFailed={peersLoadFailed} peerCountLabel={peerCountLabel} search={search} onSearch={setSearch} onRefresh={() => void refresh()} onJoin={() => void showJoin()} onOpenPeer={(peer) => void openPeer(peer)} />
        <footer className="page-footer"><span><Shield size={13} /> Direct WireGuard mesh · No relay</span><span>Peerimeter Service {serviceVersion || 'version unavailable'}</span></footer>
      </>}
    </main>

      {modal && <DashboardModal modal={modal} active={active} selected={selected} peerConfig={peerConfig} peerConfigLoaded={peerConfigLoaded} join={join} joinToken={joinToken} showJoinToken={showJoinToken} copied={copied} error={error} busy={busy} onClose={closeModal} onCreateNetwork={createNetwork} onSavePeer={savePeer} onToggleJoinToken={() => setShowJoinToken((shown) => !shown)} onCopy={(text, label) => void copy(text, label)} />}
  </div>
}

function SessionRestoreScreen() {
  return <main className="login-page"><div className="loading-line"><span className="live-dot" />Restoring your session…</div></main>
}

function LoginScreen({ credentials, serviceURLs, error, busy, onCredentialsChange, onSubmit }: {
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

function Sidebar({ api, serviceVersion, networks, selectedID, loading, failed, onCreateNetwork, onSelectNetwork, onSignOut }: {
  api: ServiceAPI
  serviceVersion: string
  networks: Network[]
  selectedID: string
  loading: boolean
  failed: boolean
  onCreateNetwork: () => void
  onSelectNetwork: (id: string) => void
  onSignOut: () => void
}) {
  return <aside className="sidebar">
    <Brand />
    <div className="side-label">WORKSPACE</div>
    <div className="service-tag"><span className="live-dot" /><span><b>Service {serviceVersion || 'version unavailable'}</b><small>{new URL(api.baseURL).host}</small></span></div>
    <div className="side-label network-label">NETWORKS <button aria-label="Create network" onClick={onCreateNetwork}><Plus size={15} /></button></div>
    <nav className="network-list">
      {networks.map((network) => <button key={network.id} className={selectedID === network.id ? 'network-nav active' : 'network-nav'} onClick={() => onSelectNetwork(network.id)}>
        <span className="nav-mark">⌁</span><span>{network.name}</span><ChevronRight size={14} />
      </button>)}
      {networks.length === 0 && <p className="empty-nav">{loading ? 'Loading networks…' : failed ? 'Could not load networks' : 'No networks yet'}</p>}
    </nav>
    <div className="sidebar-bottom">
      <a className="help-card" href="https://github.com/peerimeter/.github/blob/main/README.md#quick-setup-register-agents-through-the-service" target="_blank" rel="noreferrer">
        <CircleHelp size={16} /><span><b>Need a hand?</b><small>Read the setup guide</small></span><ArrowUpRight size={13} />
      </a>
      <button className="logout" onClick={onSignOut}><LogOut size={15} /> Disconnect</button>
    </div>
  </aside>
}

function WelcomeSection({ loading, failed, onRefresh, onCreateNetwork }: {
  loading: boolean
  failed: boolean
  onRefresh: () => void
  onCreateNetwork: () => void
}) {
  if (loading) return <section className="welcome"><div className="loading-line" role="status"><span className="live-dot" />Loading networks…</div></section>

  return <section className="welcome">
    <div className="welcome-orb"><Globe2 size={28} /></div>
    <span className="eyebrow">PEERIMETER DASHBOARD</span>
    <h1>{failed ? 'Could not load networks.' : 'Start with a network.'}</h1>
    <p>{failed ? 'Try refreshing the service data.' : 'Create your first private network, then invite peers from any platform.'}</p>
    {failed
      ? <button className="button primary" onClick={onRefresh}><RefreshCw size={16} /> Try again</button>
      : <button className="button primary" onClick={onCreateNetwork}><Plus size={16} /> Create network</button>}
  </section>
}

type PeersTableSectionProps = {
  selected: Network
  peers: Peer[]
  peerNames: Record<string, string>
  filteredPeers: Peer[]
  peersLoading: boolean
  peersLoadFailed: boolean
  peerCountLabel: string
  search: string
  onSearch: (value: string) => void
  onRefresh: () => void
  onJoin: () => void
  onOpenPeer: (peer: Peer) => void
}

function PeersTableSection({ selected, peers, peerNames, filteredPeers, peersLoading, peersLoadFailed, peerCountLabel, search, onSearch, onRefresh, onJoin, onOpenPeer }: PeersTableSectionProps) {
  return <section className="content-card">
    <div className="card-heading">
      <div><h2>Peers <span className={peersLoading ? 'count-badge count-badge-loading' : 'count-badge'}>{peersLoading ? <span className="skeleton-bar skeleton-count-badge" aria-hidden="true" /> : peerCountLabel}</span></h2><p>Registered devices in {selected.name}</p></div>
      <div className="table-actions">
        <label className="search-box"><Search size={15} /><input placeholder="Search peers" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
        <button className="button secondary compact" onClick={onJoin}><Plus size={15} /> Add peer</button>
      </div>
    </div>
    {peersLoading ? <PeerTableSkeleton /> : peersLoadFailed ? <PeerLoadError onRefresh={onRefresh} /> : peers.length === 0 ? <EmptyPeerList onJoin={onJoin} /> : <PeerTable peers={filteredPeers} peerNames={peerNames} search={search} onOpenPeer={onOpenPeer} />}
  </section>
}

function PeerTableSkeleton() {
  return <div className="table-wrap peer-skeleton" role="status" aria-label="Loading peers">
    <table aria-hidden="true"><thead><tr><th>PEER</th><th>AGENT-CLI</th><th>TUNNEL ADDRESS</th><th>ENDPOINT</th><th>LISTEN PORT</th><th></th></tr></thead><tbody>
      {[0, 1, 2, 3].map((row) => <tr key={row}>
        <td><div className="peer-name"><span className="skeleton-avatar" /><span className="skeleton-copy"><span className="skeleton-bar skeleton-peer-title" /><span className="skeleton-bar skeleton-peer-subtitle" /></span></div></td>
        <td><span className="skeleton-bar skeleton-address" /></td><td><span className="skeleton-bar skeleton-address" /></td><td><span className="skeleton-bar skeleton-endpoint" /></td><td><span className="skeleton-bar skeleton-port" /></td><td><span className="skeleton-bar skeleton-action" /></td>
      </tr>)}
    </tbody></table>
  </div>
}

function PeerLoadError({ onRefresh }: { onRefresh: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Cpu size={21} /></div><h3>Could not load peers</h3><p>Refresh the network data and try again.</p><button className="button primary" onClick={onRefresh}><RefreshCw size={15} /> Try again</button></div>
}

function EmptyPeerList({ onJoin }: { onJoin: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Cpu size={21} /></div><h3>No peers connected yet</h3><p>Add a peer to get its install and join commands.</p><button className="button primary" onClick={onJoin}><Plus size={15} /> Add a peer</button></div>
}

function PeerTable({ peers, peerNames, search, onOpenPeer }: {
  peers: Peer[]
  peerNames: Record<string, string>
  search: string
  onOpenPeer: (peer: Peer) => void
}) {
  return <div className="table-wrap">
    <table><thead><tr><th>PEER</th><th>AGENT-CLI</th><th>TUNNEL ADDRESS</th><th>ENDPOINT</th><th>LISTEN PORT</th><th></th></tr></thead><tbody>
      {peers.map((peer) => <tr key={peer.node_id} onClick={() => onOpenPeer(peer)}>
        <td><div className="peer-name"><span className="peer-avatar"><Cpu size={15} /></span><span><b>{peerNames[peer.node_id] || peer.node_id}</b><small>{shortKey(peer.public_key)}</small></span></div></td>
        <td>{peer.agent_cli_version ?? '—'}</td>
        <td><code>{peer.tunnel_address ?? '—'}</code></td>
        <td><span className="endpoint"><i />{peer.public_endpoint || peer.local_addresses?.[0] || 'No address'}</span></td>
        <td>{peer.listen_port ?? '—'}</td><td><button className="row-action" aria-label={`Edit ${peer.node_id}`}><ChevronRight size={16} /></button></td>
      </tr>)}
    </tbody></table>
    {peers.length === 0 && <div className="no-results">No peers match “{search}”.</div>}
  </div>
}

type DashboardModalProps = {
  modal: 'network' | 'peer' | 'join'
  active: Peer | null
  selected: Network | null
  peerConfig: PeerConfig
  peerConfigLoaded: boolean
  join: ReturnType<typeof joinCommands> | null
  joinToken: string
  showJoinToken: boolean
  copied: string
  error: string
  busy: boolean
  onClose: () => void
  onCreateNetwork: React.FormEventHandler<HTMLFormElement>
  onSavePeer: React.FormEventHandler<HTMLFormElement>
  onToggleJoinToken: () => void
  onCopy: (text: string, label: string) => void
}

function DashboardModal(props: DashboardModalProps) {
  const closeOnBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) props.onClose()
  }

  return <div className="modal-backdrop" onMouseDown={closeOnBackdrop}>
    <section className={`modal ${props.modal === 'join' ? 'join-modal' : ''}`} role="dialog" aria-modal="true">
      <ModalHeading {...props} />
      {props.modal === 'network' && <NetworkModal {...props} />}
      {props.modal === 'peer' && props.active && <PeerModal {...props} active={props.active} />}
      {props.modal === 'join' && <JoinModal {...props} />}
    </section>
  </div>
}

function ModalHeading({ modal, active, peerConfig, onClose }: DashboardModalProps) {
  const label = modal === 'network' ? 'NETWORK SETUP' : modal === 'peer' ? 'PEER DETAILS' : 'JOIN NETWORK'
  const title = modal === 'network' ? 'Create a network' : modal === 'peer' ? String(peerConfig.name || active?.node_id || 'Peer') : 'Invite a peer'

  return <header className="modal-heading">
    <div><span className="eyebrow">{label}</span><h2>{title}</h2></div>
    <button className="icon-button" aria-label="Close" onClick={onClose}><X size={17} /></button>
  </header>
}

function NetworkModal({ error, busy, onCreateNetwork, onClose }: DashboardModalProps) {
  const [name, setName] = useState('')
  const [id, setID] = useState('')
  const [idEdited, setIDEdited] = useState(false)

  function updateName(value: string) {
    setName(value)
    if (!idEdited) setID(slug(value))
  }

  return <form className="form-stack modal-body" onSubmit={onCreateNetwork}>
    <p className="modal-intro">Choose a name and a private address range for your WireGuard mesh.</p>
    <label>Network name<input name="name" required maxLength={128} placeholder="Engineering mesh" value={name} onChange={(event) => updateName(event.target.value)} /></label>
    <label>Network ID<input name="id" required maxLength={128} pattern="[A-Za-z0-9_.-]+" placeholder="engineering-mesh" value={id} onChange={(event) => { setID(event.target.value); setIDEdited(true) }} /></label>
    <label>Private IPv4 CIDR<input name="cidr" required defaultValue="10.90.0.0/24" placeholder="10.90.0.0/24" /><small>Canonical private IPv4 range from /8 through /30. It must not overlap another network.</small></label>
    <ModalError error={error} />
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create network'}</button></div>
  </form>
}

function PeerModal({ active, peerConfig, peerConfigLoaded, error, busy, onSavePeer, onClose }: DashboardModalProps & { active: Peer }) {
  return <form className="form-stack modal-body" onSubmit={onSavePeer}>
    <div className="peer-detail-card"><div className="peer-avatar large"><Cpu size={19} /></div><div><b>{active.node_id}</b><small>{active.tunnel_address || 'Address pending'} · {active.public_endpoint || 'Endpoint not reported'}</small></div></div>
    <label>Display name<input name="name" maxLength={128} defaultValue={String(peerConfig.name ?? active.node_id)} placeholder="Build server" /></label>
    <label>Notes<textarea name="notes" rows={3} maxLength={1000} defaultValue={String(peerConfig.notes ?? '')} placeholder="Optional notes about this peer" /></label>
    <div className="peer-facts"><span>Primary interface <code>{active.primary_interface || '—'} · {active.local_addresses?.join(', ') || '—'}</code></span><span>Public key <code>{shortKey(active.public_key)}</code></span><span>Listen port <code>{active.listen_port ?? '—'}</code></span></div>
    <p className="readonly-note">Peer records are created by agents. The service currently does not support revoking a registered peer.</p>
    <ModalError error={error} />
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Close</button><button className="button primary" disabled={busy || !peerConfigLoaded}>{busy ? 'Saving…' : 'Save details'}</button></div>
  </form>
}

function JoinModal({ selected, join, joinToken, showJoinToken, copied, error, onClose, onToggleJoinToken, onCopy }: DashboardModalProps) {
  return <div className="modal-body join-body">
    <p className="modal-intro">Install the Peerimeter agent and pass the network-scoped token for <b>{selected?.name}</b> through a hidden prompt.</p>
    {!join && !error && <div className="loading-line"><span className="live-dot" />Preparing your join token…</div>}
    {join && <JoinInstructions join={join} joinToken={joinToken} showJoinToken={showJoinToken} copied={copied} onToggleJoinToken={onToggleJoinToken} onCopy={onCopy} />}
    <ModalError error={error} />
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Done</button></div>
  </div>
}

function JoinInstructions({ join, joinToken, showJoinToken, copied, onToggleJoinToken, onCopy }: {
  join: ReturnType<typeof joinCommands>
  joinToken: string
  showJoinToken: boolean
  copied: string
  onToggleJoinToken: () => void
  onCopy: (text: string, label: string) => void
}) {
  return <>
    <div className="join-token-row">
      <span className="join-token-heading"><KeyRound size={14} /><span><b>Join token</b><small>Reveal to select and copy manually, or use Copy token</small></span></span>
      <div className="join-token-actions">
        {showJoinToken ? <code className="join-token-value" aria-label="Join token value" tabIndex={0}>{joinToken}</code> : <span className="join-token-value join-token-masked" aria-label="Join token hidden">••••••••••••••••</span>}
        <button type="button" className="icon-button" aria-label={showJoinToken ? 'Hide join token' : 'Show join token'} aria-pressed={showJoinToken} onClick={onToggleJoinToken}>{showJoinToken ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        <CopyButton copied={copied === 'token'} label="Copy token" copiedLabel="Copied" onCopy={() => onCopy(joinToken, 'token')} />
      </div>
    </div>
    <PlatformCommand title="Linux & macOS" subtitle="Run in Terminal" icon="$" command={join.unix} copied={copied === 'unix'} onCopy={() => onCopy(join.unix, 'unix')} />
    <PlatformCommand title="Windows" subtitle="Run PowerShell as Administrator" icon="PS" command={join.powershell} copied={copied === 'windows'} onCopy={() => onCopy(join.powershell, 'windows')} windows />
    <div className="token-note"><Shield size={15} /><span>This token authorizes agent access only to this network. The dashboard service key stays in the current browser tab session.</span></div>
  </>
}

function PlatformCommand({ title, subtitle, icon, command, copied, onCopy, windows = false }: {
  title: string
  subtitle: string
  icon: string
  command: string
  copied: boolean
  onCopy: () => void
  windows?: boolean
}) {
  return <div className="platform-block">
    <div className="platform-title"><div><span className={windows ? 'platform-icon windows' : 'platform-icon'}>{icon}</span><span><b>{title}</b><small>{subtitle}</small></span></div><CopyButton copied={copied} label="Copy" onCopy={onCopy} /></div>
    <pre>{command}</pre>
  </div>
}

function CopyButton({ copied, label, copiedLabel = 'Copied', onCopy }: {
  copied: boolean
  label: string
  copiedLabel?: string
  onCopy: () => void
}) {
  return <button type="button" className="copy-button" onClick={onCopy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? copiedLabel : label}</button>
}

function Brand() { return <a className="brand" href="https://peerimeter.app/" aria-label={`Peerimeter home, dashboard commit ${__DASHBOARD_COMMIT__}`}><span className="brand-icon">p<span>.</span></span><span>peerimeter<small>NETWORK DASHBOARD · {__DASHBOARD_COMMIT__}</small></span></a> }
function Stat({ icon, label, value, hint, active = false }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint: string; active?: boolean }) { return <article className="stat-card"><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong className={active ? 'stat-value status-value' : 'stat-value'}>{active && <i />}{value}</strong><small>{hint}</small></article> }
function ModalError({ error }: { error: string }) { return error ? <p className="error-text modal-error">{error}</p> : null }
