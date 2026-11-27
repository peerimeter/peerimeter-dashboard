import { Activity, Check, ChevronRight, Globe2, Plus, RefreshCw, Shield, Users, X } from 'lucide-react'
import { ServiceVersionText } from './ServiceVersionText'
import { DashboardModal } from './DashboardModal'
import { LoginScreen, SessionRestoreScreen } from './LoginScreen'
import { Sidebar } from './Sidebar'
import { PeersTableSection, WelcomeSection } from './PeersTableSection'
import { useDashboardController } from './useDashboardController'
import './delete-peer.css'

export function App() {
  const {
    credentials, setCredentials, serviceURLs, checkingSession, api, networks,
    serviceVersion, serviceVersionLoading, selectedID, peers, peersLoading,
    peersLoadFailed, networksLoading, networksLoadFailed, peerNames, active,
    modal, peerConfig, peerConfigLoaded, peerConfigLoadFailed, joinToken,
    showJoinToken, setShowJoinToken, search, setSearch, busy, deletingPeerKeys,
    error, setError, notice, setNotice, copied, selected, peerCountLabel,
    filteredPeers, join, refresh, signIn, signInWithGitHub, selectNetwork, openPeer, createNetwork,
    savePeer, deletePeer, showJoin, openNetworkModal, closeModal, copy, signOut,
    peerDeletionKey,
  } = useDashboardController()
  if (checkingSession) return <SessionRestoreScreen />

  if (!api) return <LoginScreen credentials={credentials} serviceURLs={serviceURLs} error={error} busy={busy} onCredentialsChange={setCredentials} onSubmit={signIn} onGitHubSignIn={signInWithGitHub} />

  return <div className="app-shell">
    <Sidebar api={api} serviceVersion={serviceVersion} serviceVersionLoading={serviceVersionLoading} networks={networks} selectedID={selectedID} loading={networksLoading} failed={networksLoadFailed} onCreateNetwork={openNetworkModal} onSelectNetwork={(id) => void selectNetwork(id)} onSignOut={signOut} />
    <main className="main-panel">
      <header className="topbar">
        <div className="breadcrumbs">
          <span>Networks</span>
          {selected && <><ChevronRight size={13} /><strong>{selected.name}</strong></>}
        </div>
        <div className="top-actions">
          <span className="secure-pill"><span className="live-dot" /> API connected</span>
          <button className="icon-button" title="Refresh" onClick={() => void refresh()}>
            <RefreshCw size={16} className={busy ? 'spin' : ''} />
          </button>
          <div className="avatar">P</div>
        </div>
      </header>
      {error && <div className="alert error-alert"><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="alert success-alert"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
      {!selected ? <WelcomeSection loading={networksLoading} failed={networksLoadFailed} onRefresh={() => void refresh()} onCreateNetwork={openNetworkModal} /> : <>
        <section className="page-heading">
          <div>
            <div className="eyebrow">NETWORK OVERVIEW <span className="heading-dot">/</span> {selected.id}</div>
            <h1>{selected.name}</h1>
            <p>Manage the peers connected to this network.</p>
          </div>
          <button className="button primary" onClick={() => void showJoin()}>
            <Plus size={16} /> Add a peer
          </button>
        </section>
        <section className="stats-grid">
          <Stat icon={<Users size={17} />} label="Connected peers" value={peersLoading ? <span className="skeleton-bar skeleton-number" aria-hidden="true" /> : peerCountLabel} hint={peersLoading ? 'Loading network peers' : peersLoadFailed ? 'Could not load peer count' : 'Registered on this network'} />
          <Stat icon={<Globe2 size={17} />} label="Network range" value={selected.cidr} hint="Private IPv4 address space" />
          <Stat icon={<Activity size={17} />} label="Network status" value="Active" hint="Service API reachable" active />
        </section>
        <PeersTableSection selected={selected} peers={peers} peerNames={peerNames} filteredPeers={filteredPeers} peersLoading={peersLoading} peersLoadFailed={peersLoadFailed} peerCountLabel={peerCountLabel} search={search} onSearch={setSearch} onRefresh={() => void refresh()} onJoin={() => void showJoin()} onOpenPeer={(peer) => void openPeer(peer)} />
        <footer className="page-footer">
          <span><Shield size={13} /> Direct WireGuard mesh · No relay</span>
          <span>Peerimeter Service <ServiceVersionText version={serviceVersion} loading={serviceVersionLoading} /></span>
        </footer>
      </>}
    </main>

      {modal && (
        <DashboardModal
          modal={modal}
          active={active}
          selected={selected}
          peerConfig={peerConfig}
          peerConfigLoaded={peerConfigLoaded}
          peerConfigLoadFailed={peerConfigLoadFailed}
          join={join}
          joinToken={joinToken}
          showJoinToken={showJoinToken}
          copied={copied}
          error={error}
          busy={busy}
          deletingPeer={Boolean(api && active && deletingPeerKeys.has(peerDeletionKey(api.baseURL, selectedID, active.node_id)))}
          onClose={closeModal}
          onCreateNetwork={createNetwork}
          onSavePeer={savePeer}
          onDeletePeer={deletePeer}
          onToggleJoinToken={() => setShowJoinToken((shown) => !shown)}
          onCopy={(text, label) => void copy(text, label)}
        />
      )}
  </div>
}

function Stat({ icon, label, value, hint, active = false }: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint: string
  active?: boolean
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon">{icon}</div>
      <span className="stat-label">{label}</span>
      <strong className={active ? 'stat-value status-value' : 'stat-value'}>
        {active && <i />}
        {value}
      </strong>
      <small>{hint}</small>
    </article>
  )
}
