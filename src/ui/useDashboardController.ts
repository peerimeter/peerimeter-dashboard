import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultServiceURL, joinCommands, rememberServiceURL, savedServiceURLs, ServiceAPI } from '../api'
import type { AuthSession, Network, Peer, PeerConfig } from '../api'
import { slug } from './format'

type Credentials = { url: string; key: string; authMode?: 'session' | 'password' | 'github' }
const SESSION_STORAGE_KEY = 'peerimeter.session'
const COPY_RESET_MS = 1_800
const SESSION_RESTORE_TIMEOUT_MS = 8_000
const configuredServiceURL = import.meta.env.VITE_SERVICE_URL
type RequestCounter = React.MutableRefObject<number>

function beginRequest(counter: RequestCounter, sessionCounter?: RequestCounter) {
  const requestID = ++counter.current
  const requestSessionID = sessionCounter?.current
  return () => counter.current === requestID
    && (sessionCounter === undefined || sessionCounter.current === requestSessionID)
}

function useDashboardRequestState() {
  const sessionID = useRef(0)
  function captureSession() {
    const requestSessionID = sessionID.current
    return () => sessionID.current === requestSessionID
  }
  return {
    peerLoadID: useRef(0),
    refreshLoadID: useRef(0),
    serviceVersionLoadID: useRef(0),
    sessionID,
    captureSession,
    peerNameEditID: useRef<Record<string, number>>({}),
    peerConfigLoadID: useRef(0),
    joinLoadID: useRef(0),
  }
}

function useDashboardModal() {
  const [active, setActive] = useState<Peer | null>(null)
  const [modal, setModal] = useState<'network' | 'peer' | 'join' | null>(null)
  const [peerConfig, setPeerConfig] = useState<PeerConfig>({ version: 1 })
  const [peerConfigLoaded, setPeerConfigLoaded] = useState(false)
  const [peerConfigLoadFailed, setPeerConfigLoadFailed] = useState(false)
  const [joinToken, setJoinToken] = useState('')
  const [showJoinToken, setShowJoinToken] = useState(false)

  function reset() {
    setActive(null)
    setModal(null)
    setPeerConfig({ version: 1 })
    setPeerConfigLoaded(false)
    setPeerConfigLoadFailed(false)
    setJoinToken('')
    setShowJoinToken(false)
  }

  return {
    active,
    setActive,
    modal,
    setModal,
    peerConfig,
    setPeerConfig,
    peerConfigLoaded,
    setPeerConfigLoaded,
    peerConfigLoadFailed,
    setPeerConfigLoadFailed,
    joinToken,
    setJoinToken,
    showJoinToken,
    setShowJoinToken,
    reset,
  }
}

const saved = (): Credentials => {
  const serviceURL = savedServiceURLs(configuredServiceURL, location.origin)[0] ?? defaultServiceURL(configuredServiceURL, location.origin)
  try { return JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? 'null') ?? { url: serviceURL, key: '' } }
  catch { return { url: serviceURL, key: '' } }
}
const peerDeletionKey = (serviceID: string, networkID: string, peerID: string) => JSON.stringify([serviceID, networkID, peerID])

export function useDashboardController() {
  const [credentials, setCredentials] = useState(saved)
  const [serviceURLs, setServiceURLs] = useState(() => savedServiceURLs(configuredServiceURL, location.origin))
  const [checkingSession, setCheckingSession] = useState(() => {
    const current = saved()
    return Boolean(current.url && (current.key || current.authMode === 'session' || current.authMode === 'github'))
  })
  const [api, setAPI] = useState<ServiceAPI | null>(null)
  const [username, setUsername] = useState('')
  const [authMethod, setAuthMethod] = useState<AuthSession['auth_method']>('api_key')
  const [networks, setNetworks] = useState<Network[]>([])
  const [serviceVersion, setServiceVersion] = useState('')
  const [serviceVersionLoading, setServiceVersionLoading] = useState(false)
  const [selectedID, setSelectedID] = useState('')
  const [peers, setPeers] = useState<Peer[]>([])
  const [peersLoading, setPeersLoading] = useState(false)
  const [peersLoadFailed, setPeersLoadFailed] = useState(false)
  const [networksLoading, setNetworksLoading] = useState(false)
  const [networksLoadFailed, setNetworksLoadFailed] = useState(false)
  const [peerNames, setPeerNames] = useState<Record<string, string>>({})
  const {
    active,
    setActive,
    modal,
    setModal,
    peerConfig,
    setPeerConfig,
    peerConfigLoaded,
    peerConfigLoadFailed,
    setPeerConfigLoadFailed,
    setPeerConfigLoaded,
    joinToken,
    setJoinToken,
    showJoinToken,
    setShowJoinToken,
    reset: resetModalState,
  } = useDashboardModal()
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingPeerKeys, setDeletingPeerKeys] = useState<Set<string>>(() => new Set())
  const deletingPeerKeysRef = useRef(new Set<string>())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState('')
  const { peerLoadID, refreshLoadID, serviceVersionLoadID, sessionID, peerNameEditID, peerConfigLoadID, joinLoadID, captureSession } = useDashboardRequestState()

  const selectedIDRef = useRef(selectedID)
  const modalRef = useRef(modal)
  const activePeerIDRef = useRef(active?.node_id)
  selectedIDRef.current = selectedID
  modalRef.current = modal
  activePeerIDRef.current = active?.node_id

  const selected = networks.find((network) => network.id === selectedID) ?? null
  const peerCountLabel = peersLoadFailed ? '—' : String(peers.length)
  const filteredPeers = peers.filter((peer) => `${peerNames[peer.node_id] ?? ''} ${peer.node_id} ${peer.tunnel_address ?? ''} ${peer.public_key}`.toLowerCase().includes(search.toLowerCase()))
  const join = useMemo(() => joinToken && selected ? joinCommands() : null, [joinToken, selected])

  async function loadPeers(client: ServiceAPI, networkID: string, isCurrent = () => true) {
    const isPeerLoadCurrent = beginRequest(peerLoadID)
    const nameEditSnapshot = { ...peerNameEditID.current }
    setPeers([])
    setPeerNames({})
    setPeersLoading(Boolean(networkID))
    setPeersLoadFailed(false)
    if (!networkID) return
    try {
      const nextPeers = await client.peers(networkID)
      if (!isPeerLoadCurrent() || !isCurrent()) return
      setPeers(nextPeers)
      setPeersLoading(false)
      const names = await Promise.all(nextPeers.map(async (peer) => {
        try {
          const config = await client.peerConfig(networkID, peer.node_id)
          return [peer.node_id, String(config?.name || peer.node_id)] as const
        } catch { return [peer.node_id, peer.node_id] as const }
      }))
      if (isPeerLoadCurrent() && isCurrent()) {
        setPeerNames((previous) => ({
          ...previous,
          ...Object.fromEntries(names.filter(([nodeID]) => (peerNameEditID.current[nodeID] ?? 0) === (nameEditSnapshot[nodeID] ?? 0))),
        }))
      }
    } catch (cause) {
      if (isPeerLoadCurrent() && isCurrent()) {
        setPeersLoading(false)
        setPeersLoadFailed(true)
        setError(cause instanceof Error ? cause.message : 'Could not load peers')
      }
    }
  }

  async function refresh(client = api, networkID = selectedID, isCurrent = () => true, knownNetworks?: Network[]) {
    if (!client) return
    const isRefreshRequestCurrent = beginRequest(refreshLoadID, sessionID)
    const isRefreshCurrent = () => isRefreshRequestCurrent() && isCurrent()
    const isVersionRequestCurrent = beginRequest(serviceVersionLoadID, sessionID)
    peerLoadID.current++
    setPeers([])
    setPeerNames({})
    setPeersLoading(true)
    setPeersLoadFailed(false)
    setNetworksLoading(true)
    setBusy(true)
    setError('')
    setServiceVersionLoading(true)
    try {
      void client.version().then((currentVersion) => {
        if (isVersionRequestCurrent() && isCurrent()) {
          setServiceVersion(currentVersion)
          setServiceVersionLoading(false)
        }
      }).catch(() => {
        if (isVersionRequestCurrent() && isCurrent()) {
          setServiceVersion('')
          setServiceVersionLoading(false)
        }
      })
      const items = knownNetworks ?? await client.networks()
      if (!isRefreshCurrent()) return
      setNetworksLoading(false)
      setNetworksLoadFailed(false)
      setNetworks(items)
      const nextID = items.some((network) => network.id === networkID) ? networkID : items[0]?.id ?? ''
      setSelectedID(nextID)
      void loadPeers(client, nextID, isRefreshCurrent)
    } catch (cause) {
      if (isRefreshCurrent()) {
        setPeersLoading(false)
        setPeersLoadFailed(true)
        setNetworksLoading(false)
        setNetworksLoadFailed(true)
        setError(cause instanceof Error ? cause.message : 'Could not load service data')
      }
    }
    finally { if (isRefreshCurrent()) setBusy(false) }
  }

  useEffect(() => {
    const current = saved()
    setCredentials(current)
    if ((!current.key && current.authMode !== 'github' && current.authMode !== 'session') || !current.url) {
      setCheckingSession(false)
      return
    }
    const client = current.authMode === 'session' || current.authMode === 'github'
      ? new ServiceAPI(current.url, '', 'session')
      : new ServiceAPI(current.url, current.key, 'bearer')
    let restoreActive = true
    const timeoutID = window.setTimeout(() => {
      restoreActive = false
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      setCredentials({ url: current.url, key: '' })
      setError('Could not restore your session. Please sign in again.')
      setBusy(false)
      setCheckingSession(false)
    }, SESSION_RESTORE_TIMEOUT_MS)
    const restore = async () => {
      if (client.authMode === 'bearer') {
        await client.exchangeAPIKey(current.key)
        const sessionClient = new ServiceAPI(current.url, '', 'session')
        const session = await sessionClient.session()
        return { client: sessionClient, items: await sessionClient.verify(), session }
      }
      const session = await client.session()
      return { client, items: await client.verify(), session }
    }
    restore().then(async ({ client: restoredClient, items, session: restoredSession }) => {
      if (!restoreActive) return
      await refresh(restoredClient, '', () => restoreActive, items)
      if (!restoreActive) return
      setCredentials({ url: current.url, key: '', authMode: 'session' })
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ url: current.url, key: '', authMode: 'session' }))
      setUsername(restoredSession.username)
      setAuthMethod(restoredSession.auth_method)
      setAPI(restoredClient)
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
    event.preventDefault()
    setBusy(true)
    setError('')
    const isSignInCurrent = beginRequest(sessionID)
    const signedInCredentials = { ...credentials, url: credentials.url.trim() }
    const bearerClient = new ServiceAPI(signedInCredentials.url, signedInCredentials.key, 'bearer')
    try {
      await bearerClient.exchangeAPIKey(signedInCredentials.key)
      const client = new ServiceAPI(signedInCredentials.url, '', 'session')
      const verifiedSession = await client.session()
      await client.verify()
      if (!isSignInCurrent()) return
      const sessionCredentials = { url: signedInCredentials.url, key: '', authMode: 'session' as const }
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionCredentials))
      setCredentials(sessionCredentials)
      setUsername(verifiedSession.username)
      setAuthMethod(verifiedSession.auth_method)
      rememberServiceURL(signedInCredentials.url)
      setServiceURLs(savedServiceURLs(configuredServiceURL, location.origin))
      setAPI(client); await refresh(client, '', isSignInCurrent)
    } catch (cause) { if (isSignInCurrent()) setError(cause instanceof Error ? cause.message : 'Could not connect to Peerimeter Service') }
    finally { if (isSignInCurrent()) setBusy(false) }
  }

  function signInWithGitHub() {
    const targetURL = credentials.url.trim()
    if (!targetURL) return
    const githubCredentials = { url: targetURL, key: '', authMode: 'session' as const }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(githubCredentials))
    location.assign(`${targetURL.replace(/\/+$/, '')}/auth/github/login`)
  }

  async function selectNetwork(id: string) {
    refreshLoadID.current++
    const isSelectionCurrent = captureSession()
    setNetworksLoading(false)
    setSelectedID(id)
    setActive(null)
    setJoinToken('')
    setShowJoinToken(false)
    setError('')
    joinLoadID.current++
    if (!api || !id) {
      setPeers([])
      setPeerNames({})
      setPeersLoading(false)
      setPeersLoadFailed(false)
      return
    }
    const client = api
    setBusy(true)
    try { await loadPeers(client, id, isSelectionCurrent) }
    finally { if (isSelectionCurrent()) setBusy(false) }
  }

  async function openPeer(peer: Peer) {
    const isPeerConfigCurrent = beginRequest(peerConfigLoadID, sessionID)
    const networkID = selectedID
    setActive(peer)
    setPeerConfig({ version: 1 })
    setPeerConfigLoaded(false)
    setPeerConfigLoadFailed(false)
    setError('')
    setModal('peer')
    try {
      const config = await api?.peerConfig(networkID, peer.node_id)
      if (!isPeerConfigCurrent()) return
      setPeerConfig(config ?? { version: 1, name: peer.node_id, notes: '' })
      setPeerConfigLoaded(true)
    } catch (cause) {
      if (isPeerConfigCurrent()) {
        setPeerConfigLoadFailed(true)
        setError(cause instanceof Error ? cause.message : 'Could not load peer details')
      }
    }
  }

  async function createNetwork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!api) return
    const client = api
    const isCreateNetworkCurrent = captureSession()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const network = { version: 1, name, id: slug(String(form.get('id') || name)), cidr: String(form.get('cidr') ?? '').trim() }
    setBusy(true)
    setError('')
    try {
      await client.createNetwork(network)
      if (!isCreateNetworkCurrent()) return
      closeModal()
      setNotice('Network created')
      await refresh(client, network.id, isCreateNetworkCurrent)
    } catch (cause) { if (isCreateNetworkCurrent()) setError(cause instanceof Error ? cause.message : 'Could not create network') }
    finally { if (isCreateNetworkCurrent()) setBusy(false) }
  }

  async function savePeer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!api || !active) return
    const isSavePeerCurrent = captureSession()
    const form = new FormData(event.currentTarget)
    const config = { ...peerConfig, version: 1, name: String(form.get('name') ?? '').trim(), notes: String(form.get('notes') ?? '').trim() }
    setBusy(true)
    setError('')
    try {
      await api.savePeerConfig(selectedID, active.node_id, config)
      if (!isSavePeerCurrent()) return
      peerNameEditID.current = { ...peerNameEditID.current, [active.node_id]: (peerNameEditID.current[active.node_id] ?? 0) + 1 }
      setPeerConfig(config)
      setPeerNames((previous) => ({ ...previous, [active.node_id]: String(config.name) }))
      closeModal()
      setNotice('Peer details saved')
    } catch (cause) { if (isSavePeerCurrent()) setError(cause instanceof Error ? cause.message : 'Could not save peer') }
    finally { if (isSavePeerCurrent()) setBusy(false) }
  }

  async function deletePeer() {
    if (!api || !active) return
    const client = api
    const peerID = active.node_id
    const networkID = selectedID
    const deletionKey = peerDeletionKey(client.baseURL, networkID, peerID)
    if (deletingPeerKeysRef.current.has(deletionKey)) return
    deletingPeerKeysRef.current.add(deletionKey)
    setDeletingPeerKeys((current) => new Set(current).add(deletionKey))
    const isDeleteSessionCurrent = captureSession()
    const modalInstanceID = peerConfigLoadID.current
    const isDeleteModalCurrent = () => isDeleteSessionCurrent()
      && peerConfigLoadID.current === modalInstanceID
      && selectedIDRef.current === networkID
      && modalRef.current === 'peer'
      && activePeerIDRef.current === peerID
    setBusy(true)
    setError('')
    try {
      await client.deletePeer(networkID, peerID)
      if (!isDeleteSessionCurrent()) return
      if (isDeleteModalCurrent()) closeModal()
      setNotice('Peer deleted')
      if (selectedIDRef.current === networkID) {
        peerLoadID.current++
        peerNameEditID.current = { ...peerNameEditID.current, [peerID]: (peerNameEditID.current[peerID] ?? 0) + 1 }
        setPeerNames((previous) => { const next = { ...previous }; delete next[peerID]; return next })
        await loadPeers(client, networkID, () => isDeleteSessionCurrent() && selectedIDRef.current === networkID)
      }
    } catch (cause) { if (isDeleteSessionCurrent()) setError(cause instanceof Error ? cause.message : 'Could not delete peer') }
    finally {
      deletingPeerKeysRef.current.delete(deletionKey)
      setDeletingPeerKeys((current) => {
        const next = new Set(current)
        next.delete(deletionKey)
        return next
      })
      if (isDeleteSessionCurrent()) setBusy(false)
    }
  }

  async function showJoin() {
    if (!api) return
    const isJoinRequestCurrent = beginRequest(joinLoadID, sessionID)
    const networkID = selectedID
    setError('')
    setJoinToken('')
    setShowJoinToken(false)
    setModal('join')
    try { const token = await api.joinToken(networkID); if (isJoinRequestCurrent()) setJoinToken(token) }
    catch (cause) { if (isJoinRequestCurrent()) setError(cause instanceof Error ? cause.message : 'Could not create join bundle') }
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
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      window.setTimeout(() => setCopied(''), COPY_RESET_MS)
    }
    catch { setError('Clipboard access is unavailable. Select and copy the command manually.') }
  }

  async function signOut() {
    const currentAPI = api
    if (currentAPI?.authMode === 'session') {
      setBusy(true)
      try {
        await currentAPI.logout()
      } catch (cause) {
        setError(cause instanceof Error ? `Could not end session: ${cause.message}` : 'Could not end session. Please try again.')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    sessionID.current++; refreshLoadID.current++; peerLoadID.current++; peerConfigLoadID.current++; joinLoadID.current++
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    setAPI(null)
    setUsername('')
    setAuthMethod('api_key')
    serviceVersionLoadID.current++
    setServiceVersion('')
    setServiceVersionLoading(false)
    setNetworks([])
    setPeers([])
    setPeersLoading(false)
    setPeersLoadFailed(false)
    setNetworksLoading(false)
    setNetworksLoadFailed(false)
    setPeerNames({})
    setSelectedID('')
    resetModalState()
    setBusy(false)
    setCredentials({ url: defaultServiceURL(configuredServiceURL, location.origin), key: '' })
  }

  return {
    credentials, setCredentials, serviceURLs, checkingSession, api, username, authMethod, networks,
    serviceVersion, serviceVersionLoading, selectedID, peers, peersLoading,
    peersLoadFailed, networksLoading, networksLoadFailed, peerNames, active,
    modal, peerConfig, peerConfigLoaded, peerConfigLoadFailed, joinToken,
    showJoinToken, setShowJoinToken, search, setSearch, busy, deletingPeerKeys,
    error, setError, notice, setNotice, copied, selected, peerCountLabel,
    filteredPeers, join, refresh, signIn, signInWithGitHub, selectNetwork, openPeer, createNetwork,
    savePeer, deletePeer, showJoin, openNetworkModal, closeModal, copy, signOut,
    peerDeletionKey,
  }
}
