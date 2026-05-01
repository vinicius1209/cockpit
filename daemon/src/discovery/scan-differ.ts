import type { DiscoveryCard } from './discovery-engine'

export interface Finding {
  fingerprint: string
  card: DiscoveryCard
  firstSeen: string
  lastSeen: string
  status: 'new' | 'existing' | 'resolved' | 'baseline'
  linkedCardId: string | null
}

export interface ScanHistory {
  id: string
  projectPath: string
  scannedAt: string
  findingsCount: number
  newCount: number
  baselineCount: number
  resolvedCount: number
  findings: Finding[]
}

export interface DiffResult {
  findings: Finding[]
  newFindings: Finding[]
  baselineFindings: Finding[]
  resolvedFindings: Finding[]
  existingFindings: Finding[]
  scanHistory: ScanHistory
}

function generateFingerprint(card: DiscoveryCard): string {
  const subProj = card.subProject || ''
  const normalized = `${card.type}::${subProj}::${card.title.toLowerCase().trim().slice(0, 100)}::${card.source}`
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `fp-${Math.abs(hash).toString(36)}`
}

// In-memory store for scan history (keyed by projectPath)
const historyStore = new Map<string, ScanHistory[]>()

export function diffScan(
  projectPath: string,
  currentCards: DiscoveryCard[],
): DiffResult {
  const now = new Date().toISOString()
  const previousScans = historyStore.get(projectPath) || []
  const lastScan = previousScans[previousScans.length - 1]
  const isFirstScan = previousScans.length === 0

  // Build fingerprint map from current scan
  const currentFingerprints = new Map<string, DiscoveryCard>()
  for (const card of currentCards) {
    const fp = generateFingerprint(card)
    currentFingerprints.set(fp, card)
  }

  // Build fingerprint map from last scan
  const previousFingerprints = new Map<string, Finding>()
  if (lastScan) {
    for (const finding of lastScan.findings) {
      previousFingerprints.set(finding.fingerprint, finding)
    }
  }

  const findings: Finding[] = []
  const newFindings: Finding[] = []
  const baselineFindings: Finding[] = []
  const existingFindings: Finding[] = []

  // Classify current findings
  for (const [fp, card] of currentFingerprints) {
    const previous = previousFingerprints.get(fp)

    if (previous) {
      const finding: Finding = {
        fingerprint: fp,
        card,
        firstSeen: previous.firstSeen,
        lastSeen: now,
        status: 'existing',
        linkedCardId: previous.linkedCardId,
      }
      findings.push(finding)
      existingFindings.push(finding)
    } else if (isFirstScan) {
      // First scan: baseline, not "new"
      const finding: Finding = {
        fingerprint: fp,
        card,
        firstSeen: now,
        lastSeen: now,
        status: 'baseline',
        linkedCardId: null,
      }
      findings.push(finding)
      baselineFindings.push(finding)
    } else {
      // Subsequent scan: genuinely new
      const finding: Finding = {
        fingerprint: fp,
        card,
        firstSeen: now,
        lastSeen: now,
        status: 'new',
        linkedCardId: null,
      }
      findings.push(finding)
      newFindings.push(finding)
    }
  }

  // Find resolved findings (were in previous, not in current)
  const resolvedFindings: Finding[] = []
  if (lastScan) {
    for (const [fp, previous] of previousFingerprints) {
      if (!currentFingerprints.has(fp)) {
        const finding: Finding = {
          ...previous,
          lastSeen: now,
          status: 'resolved',
        }
        resolvedFindings.push(finding)
      }
    }
  }

  // Create scan history entry
  const scanHistory: ScanHistory = {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    projectPath,
    scannedAt: now,
    findingsCount: findings.length,
    newCount: newFindings.length,
    baselineCount: baselineFindings.length,
    resolvedCount: resolvedFindings.length,
    findings: [...findings, ...resolvedFindings],
  }

  // Store history (keep last 20 scans per project)
  const history = historyStore.get(projectPath) || []
  history.push(scanHistory)
  if (history.length > 20) history.shift()
  historyStore.set(projectPath, history)

  return {
    findings,
    newFindings,
    baselineFindings,
    resolvedFindings,
    existingFindings,
    scanHistory,
  }
}

export function getScanHistory(projectPath: string): ScanHistory[] {
  return historyStore.get(projectPath) || []
}

export function linkFindingToCard(projectPath: string, fingerprint: string, cardId: string) {
  const history = historyStore.get(projectPath)
  if (!history) return

  const lastScan = history[history.length - 1]
  if (!lastScan) return

  const finding = lastScan.findings.find((f) => f.fingerprint === fingerprint)
  if (finding) {
    finding.linkedCardId = cardId
  }
}
