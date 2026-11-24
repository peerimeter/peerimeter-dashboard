export const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128)

export const shortKey = (key: string) => key ? `${key.slice(0, 10)}…${key.slice(-6)}` : '—'
