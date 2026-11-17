import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowUpRight, Check, ChevronRight, CircleHelp, Copy, Cpu, Globe2, KeyRound, LogOut, Plus, RefreshCw, Search, Shield, Users, X } from 'lucide-react'
import { defaultServiceURL, joinCommands, rememberServiceURL, savedServiceURLs, ServiceAPI } from '../api'
import type { Network, Peer } from '../api'

type Credentials = { url: string; key: string }
const configuredServiceURL = import.meta.env.VITE_SERVICE_URL
const saved = (): Credentials => {
  const defaultURL = defaultServiceURL(configuredServiceURL, location.origin)
  try { return JSON.parse(sessionStorage.getItem('peerimeter.session') ?? 'null') ?? { url: defaultURL, key: '' } }
  catch { return { url: defaultURL, key: '' } }
}
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128)
const shortKey = (key: string) => key ? `${key.slice(0, 10)}…${key.slice(-6)}` : '—'

export function App() {
  const [credentials, setCredentials] = useState(saved)
  const [serviceURLs, setServiceURLs] = useState(() => savedServiceURLs(configuredServiceURL, location.origin))
  const [api, setAPI] = useState<ServiceAPI | null>(null)
  const [networks, setNetworks] = useState<Network[]>([])
  const [selectedID, setSelectedID] = useState('')
  const [peers, setPeers] = useState<Peer[]>([])
  const [peerNames, setPeerNames] = useState<Record<string, string>>({})
  const [active, setActive] = useState<Peer | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<'network' | 'peer' | 'join' | null>(null)
  const [peerConfig, setPeerConfig] = useState<Record<string, unknown>>({})
  const [peerConfigLoaded, setPeerConfigLoaded] = useState(false)
  const [joinToken, setJoinToken] = useState('')
  const [copied, setCopied] = useState('')
  const peerLoadID = useRef(0)
  const peerConfigLoadID = useRef(0)
  const joinLoadID = useRef(0)

  const selected = networks.find((network) => network.id === selectedID) ?? null
  const filteredPeers = peers.filter((peer) => `${peerNames[peer.node_id] ?? ''} ${peer.node_id} ${peer.tunnel_address ?? ''} ${peer.public_key}`.toLowerCase().includes(search.toLowerCase()))
  const join = useMemo(() => joinToken && selected ? joinCommands() : null, [joinToken, selected])

  async function loadPeers(client: ServiceAPI, networkID: string) {
    const requestID = ++peerLoadID.current
    setPeers([]); setPeerNames({})
    if (!networkID) return
    try {
      const nextPeers = await client.peers(networkID)
      if (requestID !== peerLoadID.current) return
      setPeers(nextPeers)
      const names = await Promise.all(nextPeers.map(async (peer) => {
        try {
          const config = await client.peerConfig(networkID, peer.node_id)
          return [peer.node_id, String(config?.name || peer.node_id)] as const
        } catch { return [peer.node_id, peer.node_id] as const }
      }))
      if (requestID === peerLoadID.current) setPeerNames(Object.fromEntries(names))
    } catch (cause) {
      if (requestID === peerLoadID.current) setError(cause instanceof Error ? cause.message : 'Could not load peers')
    }
  }

  async function refresh(client = api, networkID = selectedID) {
    if (!client) return
    peerLoadID.current++
    setPeers([]); setPeerNames({})
    setBusy(true); setError('')
    try {
      const items = await client.networks()
      setNetworks(items)
      const nextID = items.some((network) => network.id === networkID) ? networkID : items[0]?.id ?? ''
      setSelectedID(nextID)
      await loadPeers(client, nextID)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load service data') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    const current = saved()
    setCredentials(current)
    if (!current.key || !current.url) return
    const client = new ServiceAPI(current.url, current.key)
    client.verify().then(() => { setAPI(client); void refresh(client) }).catch(() => {
      sessionStorage.removeItem('peerimeter.session')
      setCredentials({ url: current.url, key: '' })
    })
  }, [])

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const client = new ServiceAPI(credentials.url, credentials.key)
    try {
      await client.verify()
      sessionStorage.setItem('peerimeter.session', JSON.stringify(credentials))
      setServiceURLs(rememberServiceURL(credentials.url))
      setAPI(client); await refresh(client, '')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect to Peerimeter Service') }
    finally { setBusy(false) }
  }

  async function selectNetwork(id: string) {
    setSelectedID(id); setActive(null); setJoinToken(''); setError(''); joinLoadID.current++
    if (!api || !id) { setPeers([]); setPeerNames({}); return }
    setBusy(true)
    try { await loadPeers(api, id) }
    finally { setBusy(false) }
  }

  async function openPeer(peer: Peer) {
    const requestID = ++peerConfigLoadID.current
    const networkID = selectedID
    setActive(peer); setPeerConfig({}); setPeerConfigLoaded(false); setError(''); setModal('peer')
    try {
      const config = await api?.peerConfig(networkID, peer.node_id)
      if (requestID !== peerConfigLoadID.current) return
      setPeerConfig(config ?? { version: 1, name: peer.node_id, notes: '' }); setPeerConfigLoaded(true)
    } catch (cause) { if (requestID === peerConfigLoadID.current) setError(cause instanceof Error ? cause.message : 'Could not load peer details') }
  }

  async function createNetwork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!api) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const network = { version: 1, name, id: slug(String(form.get('id') || name)), cidr: String(form.get('cidr') ?? '').trim() }
    setBusy(true); setError('')
    try {
      await api.createNetwork(network)
      setModal(null); setNotice('Network created'); await refresh(api, network.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create network') }
    finally { setBusy(false) }
  }

  async function savePeer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!api || !active) return
    const form = new FormData(event.currentTarget)
    const config = { ...peerConfig, version: 1, name: String(form.get('name') ?? '').trim(), notes: String(form.get('notes') ?? '').trim() }
    setBusy(true); setError('')
    try {
      await api.savePeerConfig(selectedID, active.node_id, config)
      setPeerConfig(config); setPeerNames((previous) => ({ ...previous, [active.node_id]: String(config.name) })); setModal(null); setNotice('Peer details saved')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save peer') }
    finally { setBusy(false) }
  }

  async function showJoin() {
    if (!api) return
    const requestID = ++joinLoadID.current
    const networkID = selectedID
    setError(''); setJoinToken(''); setModal('join')
    try { const token = await api.joinToken(networkID); if (requestID === joinLoadID.current) setJoinToken(token) }
    catch (cause) { if (requestID === joinLoadID.current) setError(cause instanceof Error ? cause.message : 'Could not create join bundle') }
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); window.setTimeout(() => setCopied(''), 1800) }
    catch { setError('Clipboard access is unavailable. Select and copy the command manually.') }
  }

  function signOut() {
    peerLoadID.current++; peerConfigLoadID.current++; joinLoadID.current++
    sessionStorage.removeItem('peerimeter.session'); setAPI(null); setNetworks([]); setPeers([]); setPeerNames({}); setSelectedID(''); setActive(null); setJoinToken(''); setPeerConfig({}); setPeerConfigLoaded(false)
    setCredentials({ url: defaultServiceURL(configuredServiceURL, location.origin), key: '' })
  }

  if (!api) return <main className="login-page">
    <div className="login-card">
      <Brand />
      <div className="login-copy"><span className="eyebrow">CONTROL PLANE</span><h1>Your networks,<br /><em>in one place.</em></h1><p>Connect to your Peerimeter Service and manage your mesh.</p></div>
      <form onSubmit={signIn} className="form-stack">
        <label>Service URL{serviceURLs.length > 0 && <select aria-label="Saved service URLs" value={serviceURLs.includes(credentials.url.replace(/\/+$/, '')) ? credentials.url.replace(/\/+$/, '') : '__custom'} onChange={(e) => { if (e.target.value !== '__custom') setCredentials({ ...credentials, url: e.target.value }) }}><option value="__custom">Enter a service URL</option>{serviceURLs.map((url) => <option key={url} value={url}>{url}</option>)}</select>}<span className="input-icon"><Globe2 size={16} /><input required type="url" placeholder="https://service.example.com" value={credentials.url} onChange={(e) => setCredentials({ ...credentials, url: e.target.value })} /></span></label>
        <label>API key<span className="input-icon"><KeyRound size={16} /><input required type="password" autoComplete="current-password" placeholder="Paste your service API key" value={credentials.key} onChange={(e) => setCredentials({ ...credentials, key: e.target.value })} /></span></label>
        {error && <p className="error-text">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? 'Connecting…' : 'Connect to service'}<ArrowUpRight size={16} /></button>
      </form>
      <p className="login-foot"><Shield size={14} /> Your API key stays in this browser tab session.</p>
    </div>
    <div className="login-glow" />
  </main>

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="side-label">WORKSPACE</div>
      <div className="service-tag"><span className="live-dot" /><span><b>Service connected</b><small>{new URL(api.baseURL).host}</small></span></div>
      <div className="side-label network-label">NETWORKS <button aria-label="Create network" onClick={() => { setError(''); setModal('network') }}><Plus size={15} /></button></div>
      <nav className="network-list">{networks.map((network) => <button key={network.id} className={selectedID === network.id ? 'network-nav active' : 'network-nav'} onClick={() => void selectNetwork(network.id)}><span className="nav-mark">⌁</span><span>{network.name}</span><ChevronRight size={14} /></button>)}{networks.length === 0 && <p className="empty-nav">No networks yet</p>}</nav>
      <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={16} /><span><b>Need a hand?</b><small>Read the setup guide</small></span><ArrowUpRight size={13} /></div><button className="logout" onClick={signOut}><LogOut size={15} /> Disconnect</button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="breadcrumbs"><span>Networks</span>{selected && <><ChevronRight size={13} /><strong>{selected.name}</strong></>}</div><div className="top-actions"><span className="secure-pill"><span className="live-dot" /> API connected</span><button className="icon-button" title="Refresh" onClick={() => void refresh()}><RefreshCw size={16} className={busy ? 'spin' : ''} /></button><div className="avatar">P</div></div></header>
      {error && <div className="alert error-alert"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="alert success-alert"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
      {!selected ? <section className="welcome"><div className="welcome-orb"><Globe2 size={28} /></div><span className="eyebrow">PEERIMETER DASHBOARD</span><h1>Start with a network.</h1><p>Create your first private network, then invite peers from any platform.</p><button className="button primary" onClick={() => setModal('network')}><Plus size={16} /> Create network</button></section> : <>
        <section className="page-heading"><div><div className="eyebrow">NETWORK OVERVIEW <span className="heading-dot">/</span> {selected.id}</div><h1>{selected.name}</h1><p>Manage the peers connected to this network.</p></div><button className="button primary" onClick={() => void showJoin()}><Plus size={16} /> Add a peer</button></section>
        <section className="stats-grid">
          <Stat icon={<Users size={17} />} label="Connected peers" value={String(peers.length)} hint="Registered on this network" />
          <Stat icon={<Globe2 size={17} />} label="Network range" value={selected.cidr} hint="Private IPv4 address space" />
          <Stat icon={<Activity size={17} />} label="Network status" value="Active" hint="Service API reachable" active />
        </section>
        <section className="content-card">
          <div className="card-heading"><div><h2>Peers <span className="count-badge">{peers.length}</span></h2><p>Registered devices in {selected.name}</p></div><div className="table-actions"><label className="search-box"><Search size={15} /><input placeholder="Search peers" value={search} onChange={(e) => setSearch(e.target.value)} /></label><button className="button secondary compact" onClick={() => void showJoin()}><Plus size={15} /> Add peer</button></div></div>
          {peers.length === 0 ? <div className="empty-state"><div className="empty-icon"><Cpu size={21} /></div><h3>No peers connected yet</h3><p>Add a peer to get its install and join commands.</p><button className="button primary" onClick={() => void showJoin()}><Plus size={15} /> Add a peer</button></div> : <div className="table-wrap"><table><thead><tr><th>PEER</th><th>TUNNEL ADDRESS</th><th>ENDPOINT</th><th>LISTEN PORT</th><th></th></tr></thead><tbody>{filteredPeers.map((peer) => <tr key={peer.node_id} onClick={() => void openPeer(peer)}><td><div className="peer-name"><span className="peer-avatar"><Cpu size={15} /></span><span><b>{peerNames[peer.node_id] || peer.node_id}</b><small>{shortKey(peer.public_key)}</small></span></div></td><td><code>{peer.tunnel_address ?? '—'}</code></td><td><span className="endpoint"><i />{peer.public_endpoint || `${peer.local_addresses?.[0] ?? 'No address'}`}</span></td><td>{peer.listen_port ?? '—'}</td><td><button className="row-action" aria-label={`Edit ${peer.node_id}`}><ChevronRight size={16} /></button></td></tr>)}</tbody></table>{filteredPeers.length === 0 && <div className="no-results">No peers match “{search}”.</div>}</div>}
        </section>
        <footer className="page-footer"><span><Shield size={13} /> Direct WireGuard mesh · No relay</span><span>Peerimeter Service API</span></footer>
      </>}
    </main>

      {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { if (modal === 'join') { joinLoadID.current++; setJoinToken('') } if (modal === 'peer') peerConfigLoadID.current++; setModal(null) } }}><section className={`modal ${modal === 'join' ? 'join-modal' : ''}`} role="dialog" aria-modal="true">
      <header className="modal-heading"><div><span className="eyebrow">{modal === 'network' ? 'NETWORK SETUP' : modal === 'peer' ? 'PEER DETAILS' : 'JOIN NETWORK'}</span><h2>{modal === 'network' ? 'Create a network' : modal === 'peer' ? (String(peerConfig.name || active?.node_id || 'Peer')) : 'Invite a peer'}</h2></div><button className="icon-button" aria-label="Close" onClick={() => { if (modal === 'join') { joinLoadID.current++; setJoinToken('') } if (modal === 'peer') peerConfigLoadID.current++; setModal(null) }}><X size={17} /></button></header>
      {modal === 'network' && <form className="form-stack modal-body" onSubmit={createNetwork}><p className="modal-intro">Choose a name and a private address range for your WireGuard mesh.</p><label>Network name<input name="name" required maxLength={128} placeholder="Engineering mesh" onChange={(e) => { const id = document.querySelector<HTMLInputElement>('[name=id]'); if (id && !id.dataset.edited) id.value = slug(e.target.value) }} /></label><label>Network ID<input name="id" required maxLength={128} pattern="[A-Za-z0-9_.-]+" placeholder="engineering-mesh" onInput={(e) => { e.currentTarget.dataset.edited = 'true' }} /></label><label>Private IPv4 CIDR<input name="cidr" required defaultValue="10.90.0.0/24" placeholder="10.90.0.0/24" /><small>Canonical private IPv4 range from /8 through /30. It must not overlap another network.</small></label><ModalError error={error} /><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create network'}</button></div></form>}
      {modal === 'peer' && active && <><form className="form-stack modal-body" onSubmit={savePeer}><div className="peer-detail-card"><div className="peer-avatar large"><Cpu size={19} /></div><div><b>{active.node_id}</b><small>{active.tunnel_address || 'Address pending'} · {active.public_endpoint || 'Endpoint not reported'}</small></div></div><label>Display name<input name="name" maxLength={128} defaultValue={String(peerConfig.name ?? active.node_id)} placeholder="Build server" /></label><label>Notes<textarea name="notes" rows={3} maxLength={1000} defaultValue={String(peerConfig.notes ?? '')} placeholder="Optional notes about this peer" /></label><div className="peer-facts"><span>Primary interface <code>{active.primary_interface || '—'} · {active.local_addresses?.join(', ') || '—'}</code></span><span>Public key <code>{shortKey(active.public_key)}</code></span><span>Listen port <code>{active.listen_port ?? '—'}</code></span></div><p className="readonly-note">Peer records are created by agents. The service currently does not support revoking a registered peer.</p><ModalError error={error} /><div className="modal-actions"><button type="button" className="button secondary" onClick={() => { peerConfigLoadID.current++; setModal(null) }}>Close</button><button className="button primary" disabled={busy || !peerConfigLoaded}>{busy ? 'Saving…' : 'Save details'}</button></div></form></>}
      {modal === 'join' && <div className="modal-body join-body"><p className="modal-intro">Install the Peerimeter agent and pass the network-scoped token for <b>{selected?.name}</b> through a hidden prompt.</p>{!join && !error ? <div className="loading-line"><span className="live-dot" />Preparing your join token…</div> : join && <><div className="join-token-row"><span><KeyRound size={14} /><span><b>Join token</b><small>Copy it separately, then paste at the hidden prompt</small></span></span><button className="copy-button" onClick={() => void copy(joinToken, 'token')}>{copied === 'token' ? <Check size={14} /> : <Copy size={14} />}{copied === 'token' ? 'Copied' : 'Copy token'}</button></div><div className="platform-block"><div className="platform-title"><div><span className="platform-icon">$</span><span><b>Linux & macOS</b><small>Run in Terminal</small></span></div><button className="copy-button" onClick={() => void copy(join.unix, 'unix')}>{copied === 'unix' ? <Check size={14} /> : <Copy size={14} />}{copied === 'unix' ? 'Copied' : 'Copy'}</button></div><pre>{join.unix}</pre></div><div className="platform-block"><div className="platform-title"><div><span className="platform-icon windows">PS</span><span><b>Windows</b><small>Run PowerShell as Administrator</small></span></div><button className="copy-button" onClick={() => void copy(join.powershell, 'windows')}>{copied === 'windows' ? <Check size={14} /> : <Copy size={14} />}{copied === 'windows' ? 'Copied' : 'Copy'}</button></div><pre>{join.powershell}</pre></div><div className="token-note"><Shield size={15} /><span>This token authorizes agent access only to this network. The dashboard service key stays in the current browser tab session.</span></div></>}<ModalError error={error} /><div className="modal-actions"><button className="button secondary" onClick={() => { joinLoadID.current++; setJoinToken(''); setModal(null) }}>Done</button></div></div>}
    </section></div>}
  </div>
}

function Brand() { return <a className="brand" href="https://peerimeter.app/" aria-label="Peerimeter home"><span className="brand-icon">p<span>.</span></span><span>peerimeter<small>NETWORK DASHBOARD</small></span></a> }
function Stat({ icon, label, value, hint, active = false }: { icon: React.ReactNode; label: string; value: string; hint: string; active?: boolean }) { return <article className="stat-card"><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong className={active ? 'stat-value status-value' : 'stat-value'}>{active && <i />}{value}</strong><small>{hint}</small></article> }
function ModalError({ error }: { error: string }) { return error ? <p className="error-text modal-error">{error}</p> : null }
