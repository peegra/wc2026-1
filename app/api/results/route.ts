import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { fetchWCResults } from '@/lib/football-api'
import { ActualResults, TEAMS } from '@/lib/data'

export const dynamic = 'force-dynamic'

const DOC_PATH = 'meta/results'
const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000

function isStale(syncedAt?: string): boolean {
  if (!syncedAt) return true
  const syncedAtMs = new Date(syncedAt).getTime()
  if (Number.isNaN(syncedAtMs)) return true
  return Date.now() - syncedAtMs >= AUTO_SYNC_INTERVAL_MS
}

function mergeResults(existing: Partial<ActualResults>, fresh: Partial<ActualResults>): ActualResults {
  const validTeamSet = new Set(TEAMS)
  const sanitizeTeams = (teams?: string[]) => (teams || []).filter((team) => validTeamSet.has(team))
  const rankingKeys = ['r1', 'r2', 'r3', 'r4'] as const
  const rankings = rankingKeys.reduce((acc, key) => {
    const team = fresh.rankings?.[key]
    if (team) acc[key] = team
    return acc
  }, {} as ActualResults['rankings'])
  const freshAdvancedTeams = {
    r32: sanitizeTeams(fresh.advancedTeams?.r32),
    r16: sanitizeTeams(fresh.advancedTeams?.r16),
    r16Finished: sanitizeTeams(fresh.advancedTeams?.r16Finished),
    r8: sanitizeTeams(fresh.advancedTeams?.r8),
    r8Finished: sanitizeTeams(fresh.advancedTeams?.r8Finished),
    r4plus: sanitizeTeams(fresh.advancedTeams?.r4plus),
    r4plusFinished: sanitizeTeams(fresh.advancedTeams?.r4plusFinished),
  }
  const existingAdvancedTeams = {
    r32: sanitizeTeams(existing.advancedTeams?.r32),
    r16: sanitizeTeams(existing.advancedTeams?.r16),
    r16Finished: sanitizeTeams(existing.advancedTeams?.r16Finished),
    r8: sanitizeTeams(existing.advancedTeams?.r8),
    r8Finished: sanitizeTeams(existing.advancedTeams?.r8Finished),
    r4plus: sanitizeTeams(existing.advancedTeams?.r4plus),
    r4plusFinished: sanitizeTeams(existing.advancedTeams?.r4plusFinished),
  }
  const hasFreshAdvancedTeams = Object.values(freshAdvancedTeams).some((teams) => teams.length > 0)

  return {
    matches: { ...existing.matches, ...fresh.matches },
    rankings,
    advancedTeams: hasFreshAdvancedTeams ? freshAdvancedTeams : existingAdvancedTeams,
    scorer: fresh.scorer || existing.scorer,
    scorers: fresh.scorers || existing.scorers || [],
    syncedAt: new Date().toISOString(),
  }
}

export async function GET() {
  const db = getAdminDb()
  const docRef = db.doc(DOC_PATH)
  const doc = await docRef.get()

  if (!doc.exists) {
    const fresh = await fetchWCResults()
    const merged = mergeResults({}, fresh)
    const sanitized = JSON.parse(JSON.stringify(merged)) as ActualResults
    await docRef.set(sanitized)
    return NextResponse.json(sanitized)
  }

  const existing = doc.data() as ActualResults
  if (!isStale(existing.syncedAt)) {
    return NextResponse.json(existing)
  }

  const fresh = await fetchWCResults()
  const merged = mergeResults(existing, fresh)
  const sanitized = JSON.parse(JSON.stringify(merged)) as ActualResults
  await docRef.set(sanitized)
  return NextResponse.json(sanitized)
}
