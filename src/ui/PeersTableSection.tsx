import { ChevronRight, Cpu, Globe2, Plus, RefreshCw, Search } from 'lucide-react'
import type { Network, Peer } from '../api'
import { shortKey } from './format'

export function WelcomeSection({ loading, failed, onRefresh, onCreateNetwork }: {
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

export function PeersTableSection({ selected, peers, peerNames, filteredPeers, peersLoading, peersLoadFailed, peerCountLabel, search, onSearch, onRefresh, onJoin, onOpenPeer }: PeersTableSectionProps) {
  return <section className="content-card">
    <div className="card-heading">
      <div><h2>Peers <span className={peersLoading ? 'count-badge count-badge-loading' : 'count-badge'}>{peersLoading ? <span className="skeleton-bar skeleton-count-badge" aria-hidden="true" /> : peerCountLabel}</span></h2><p>Registered devices in {selected.name}</p></div>
      <div className="table-actions">
        <label className="search-box"><Search size={15} /><input placeholder="Search peers" value={search} onChange={(event) => onSearch(event.target.value)} /></label>
        <button className="button secondary compact" onClick={onJoin}><Plus size={15} /> Add peer</button>
      </div>
    </div>
    {peersLoading
      ? <PeerTableSkeleton />
      : peersLoadFailed
        ? <PeerLoadError onRefresh={onRefresh} />
        : peers.length === 0
          ? <EmptyPeerList onJoin={onJoin} />
          : <PeerTable peers={filteredPeers} peerNames={peerNames} search={search} onOpenPeer={onOpenPeer} />}
  </section>
}

function PeerTableSkeleton() {
  return <div className="table-wrap peer-skeleton" role="status" aria-label="Loading peers">
    <table aria-hidden="true"><thead><tr><th>PEER</th><th>AGENT VERSION</th><th>LAST ACTIVE</th><th>TUNNEL ADDRESS</th><th>ENDPOINT</th><th>LISTEN PORT</th><th></th></tr></thead><tbody>
      {[0, 1, 2, 3].map((row) => <tr key={row}>
        <td><div className="peer-name"><span className="skeleton-avatar" /><span className="skeleton-copy"><span className="skeleton-bar skeleton-peer-title" /><span className="skeleton-bar skeleton-peer-subtitle" /></span></div></td>
        <td><span className="skeleton-bar skeleton-address" /></td><td><span className="skeleton-bar skeleton-address" /></td><td><span className="skeleton-bar skeleton-address" /></td><td><span className="skeleton-bar skeleton-endpoint" /></td><td><span className="skeleton-bar skeleton-port" /></td><td><span className="skeleton-bar skeleton-action" /></td>
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
    <table><thead><tr><th>PEER</th><th>AGENT VERSION</th><th>LAST ACTIVE</th><th>TUNNEL ADDRESS</th><th>ENDPOINT</th><th>LISTEN PORT</th><th></th></tr></thead><tbody>
      {peers.map((peer) => <tr key={peer.node_id} onClick={() => onOpenPeer(peer)}>
        <td><div className="peer-name"><span className="peer-avatar"><Cpu size={15} /></span><span><b>{peerNames[peer.node_id] || peer.node_id}</b><small>{shortKey(peer.public_key)}</small></span></div></td>
        <td>{peer.agent_cli_version ?? '—'}</td>
        <td>{peer.last_active && !Number.isNaN(Date.parse(peer.last_active)) ? new Date(peer.last_active).toLocaleString() : '—'}</td>
        <td><code>{peer.tunnel_address ?? '—'}</code></td>
        <td><span className="endpoint"><i />{peer.public_endpoint || peer.local_addresses?.[0] || 'No address'}</span></td>
        <td>{peer.listen_port ?? '—'}</td><td><button className="row-action" aria-label={`Edit ${peer.node_id}`}><ChevronRight size={16} /></button></td>
      </tr>)}
    </tbody></table>
    {peers.length === 0 && <div className="no-results">No peers match “{search}”.</div>}
  </div>
}
