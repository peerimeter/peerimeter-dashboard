type ServiceVersionTextProps = {
  version: string
  loading: boolean
}

export function ServiceVersionText({ version, loading }: ServiceVersionTextProps) {
  if (!loading) return <>{version || 'version unavailable'}</>

  return <>
    <span className="sr-only">Loading service version</span>
    <span className="skeleton-bar skeleton-service-version" aria-hidden="true" />
  </>
}
