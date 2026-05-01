const KEY_PREFIX = 'cockpit-apikey-'

export function getApiKey(provider: string): string | null {
  return sessionStorage.getItem(`${KEY_PREFIX}${provider}`)
}

export function setApiKey(provider: string, key: string): void {
  if (key) {
    sessionStorage.setItem(`${KEY_PREFIX}${provider}`, key)
  } else {
    sessionStorage.removeItem(`${KEY_PREFIX}${provider}`)
  }
}

export function removeApiKey(provider: string): void {
  sessionStorage.removeItem(`${KEY_PREFIX}${provider}`)
}

export function getAllConfiguredProviders(): string[] {
  const providers: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key?.startsWith(KEY_PREFIX)) {
      providers.push(key.slice(KEY_PREFIX.length))
    }
  }
  return providers
}
