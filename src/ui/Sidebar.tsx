import { ArrowUpRight, ChevronRight, CircleHelp, LogOut, Plus } from 'lucide-react'
import type { Network } from '../api'
import { ServiceAPI } from '../api'
import { ServiceVersionText } from './ServiceVersionText'

export function Sidebar({ api, username, serviceVersion, serviceVersionLoading, networks, selectedID, loading, failed, onCreateNetwork, onSelectNetwork, onSignOut }: {
  api: ServiceAPI
  username: string
  serviceVersion: string
  serviceVersionLoading: boolean
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
    <div className="service-tag">
      <span className="live-dot" />
      <span>
        <b>Service <ServiceVersionText version={serviceVersion} loading={serviceVersionLoading} /></b>
        <small>{new URL(api.baseURL).host}</small>
      </span>
    </div>
    <div className="side-label network-label">NETWORKS <button aria-label="Create network" onClick={onCreateNetwork}><Plus size={15} /></button></div>
    <nav className="network-list">
      {networks.map((network) => <button key={network.id} className={selectedID === network.id ? 'network-nav active' : 'network-nav'} onClick={() => onSelectNetwork(network.id)}>
        <span className="nav-mark">⌁</span><span>{network.name}</span><ChevronRight size={14} />
      </button>)}
      {networks.length === 0 && <p className="empty-nav">{loading ? 'Loading networks…' : failed ? 'Could not load networks' : 'No networks yet'}</p>}
    </nav>
    <div className="sidebar-bottom">
      <div className="signed-in-user">Signed in as <b>{username || 'superadmin'}</b></div>
      <a className="help-card" href="https://github.com/peerimeter/.github/blob/main/README.md#quick-setup-register-agents-through-the-service" target="_blank" rel="noreferrer">
        <CircleHelp size={16} /><span><b>Need a hand?</b><small>Read the setup guide</small></span><ArrowUpRight size={13} />
      </a>
      <button className="logout" onClick={onSignOut}><LogOut size={15} /> Disconnect</button>
    </div>
  </aside>
}

export function Brand() {
  return (
    <a className="brand" href="https://peerimeter.app/" aria-label={`Peerimeter home, dashboard commit ${__DASHBOARD_COMMIT__}`}>
      <span className="brand-icon">p<span>.</span></span>
      <span>peerimeter<small>NETWORK DASHBOARD · {__DASHBOARD_COMMIT__}</small></span>
    </a>
  )
}
