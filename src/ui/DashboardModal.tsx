import { useState } from 'react'
import { Check, Copy, Cpu, Eye, EyeOff, KeyRound, Shield, X } from 'lucide-react'
import { joinCommands } from '../api'
import type { Network, Peer, PeerConfig } from '../api'
import { shortKey, slug } from './format'

type DashboardModalProps = {
  modal: 'network' | 'peer' | 'join'
  active: Peer | null
  selected: Network | null
  peerConfig: PeerConfig
  peerConfigLoaded: boolean
  peerConfigLoadFailed: boolean
  join: ReturnType<typeof joinCommands> | null
  joinToken: string
  showJoinToken: boolean
  copied: string
  error: string
  busy: boolean
  deletingPeer: boolean
  onClose: () => void
  onCreateNetwork: React.FormEventHandler<HTMLFormElement>
  onSavePeer: React.FormEventHandler<HTMLFormElement>
  onDeletePeer: () => void
  onToggleJoinToken: () => void
  onCopy: (text: string, label: string) => void
}

export function DashboardModal(props: DashboardModalProps) {
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

function PeerModal({ active, peerConfig, peerConfigLoaded, peerConfigLoadFailed, error, busy, deletingPeer, onSavePeer, onDeletePeer, onClose }: DashboardModalProps & { active: Peer }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const submitPeerForm = (event: React.FormEvent<HTMLFormElement>) => {
    if (confirmingDelete || busy || deletingPeer) {
      event.preventDefault()
      return
    }
    onSavePeer(event)
  }

  return <form className="form-stack modal-body" onSubmit={submitPeerForm}>
    <div className="peer-detail-card">
      <div className="peer-avatar large"><Cpu size={19} /></div>
      <div>
        <b>{active.node_id}</b>
        <small>{active.tunnel_address || 'Address pending'} · {active.public_endpoint || 'Endpoint not reported'}</small>
      </div>
    </div>
    <label>
      Display name
      <input
        name="name"
        maxLength={128}
        disabled={busy || confirmingDelete || deletingPeer}
        defaultValue={String(peerConfig.name ?? active.node_id)}
        placeholder="Build server"
      />
    </label>
    <label>
      Notes
      <textarea
        name="notes"
        rows={3}
        maxLength={1000}
        disabled={busy || confirmingDelete || deletingPeer}
        defaultValue={String(peerConfig.notes ?? '')}
        placeholder="Optional notes about this peer"
      />
    </label>
    <div className="peer-facts">
      <span>Agent version <code>{active.agent_cli_version || '—'}</code></span>
      <span>Primary interface <code>{active.primary_interface || '—'} · {active.local_addresses?.join(', ') || '—'}</code></span>
      <span>Public key <code>{shortKey(active.public_key)}</code></span>
      <span>Listen port <code>{active.listen_port ?? '—'}</code></span>
    </div>
    <p className="readonly-note">Deleting this peer revokes its registration and removes its saved details. The agent must join this network again to reconnect.</p>
    <ModalError error={error} />
    {confirmingDelete && <p className="delete-confirmation" role="alert">Delete <b>{active.node_id}</b> from this network? This action cannot be undone.</p>}
    <div className="modal-actions">
      {confirmingDelete ? (
        <>
          <button
            type="button"
            className="button secondary"
            disabled={busy || deletingPeer}
            onClick={() => setConfirmingDelete(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button danger"
            disabled={busy || deletingPeer}
            onClick={onDeletePeer}
          >
            {deletingPeer ? 'Deleting…' : busy ? 'Working…' : 'Confirm delete'}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="button secondary" onClick={onClose}>Close</button>
          <button
            type="button"
            className="button danger"
            disabled={busy || deletingPeer || (!peerConfigLoaded && !peerConfigLoadFailed)}
            onClick={() => setConfirmingDelete(true)}
          >
            {deletingPeer ? 'Deleting…' : 'Delete peer'}
          </button>
          <button className="button primary" disabled={busy || deletingPeer || !peerConfigLoaded}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </>
      )}
    </div>
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
        {showJoinToken ? (
          <code className="join-token-value" aria-label="Join token value" tabIndex={0}>
            {joinToken}
          </code>
        ) : (
          <span className="join-token-value join-token-masked" aria-label="Join token hidden">
            ••••••••••••••••
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={showJoinToken ? 'Hide join token' : 'Show join token'}
          aria-pressed={showJoinToken}
          onClick={onToggleJoinToken}
        >
          {showJoinToken ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
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
    <div className="platform-title">
      <div>
        <span className={windows ? 'platform-icon windows' : 'platform-icon'}>{icon}</span>
        <span><b>{title}</b><small>{subtitle}</small></span>
      </div>
      <CopyButton copied={copied} label="Copy" onCopy={onCopy} />
    </div>
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

function ModalError({ error }: { error: string }) {
  return error ? <p className="error-text modal-error">{error}</p> : null
}
