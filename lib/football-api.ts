import { ActualResults, TEAMS } from './data'

const isServerlessRuntime = Boolean(
  process.env.VERCEL || process.env.AWS_EXECUTION_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME,
)

const launchBrowser = async () => {
  if (isServerlessRuntime) {
    const [{ default: puppeteer }, { default: Chromium }] = await Promise.all([
      import('puppeteer-core'),
      import('@sparticuz/chromium'),
    ])

    return puppeteer.launch({
      args: Chromium.args,
      executablePath: await Chromium.executablePath(),
      headless: true,
    })
  }

  const { default: puppeteer } = await import('puppeteer')
  return puppeteer.launch({ headless: true })
}

export interface MatchResult {
  japan: number
  opponent: number
  status: 'SCHEDULED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED'
}

async function fetchJapanMatches(
  sharedBrowser?: any,
): Promise<Record<'j1' | 'j2' | 'j3', MatchResult | undefined>> {
  const ownsBrowser = !sharedBrowser
  let browser: any = sharedBrowser ?? null
  try {
    if (!browser) browser = await launchBrowser()
    const page = await browser.newPage()
    await page.goto('https://soccer.yahoo.co.jp/wcup/category/2026/cups/159/31457', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    const matches = await page.evaluate(() => {
      const results: Record<string, { japan: number; opponent: number; status: 'FINISHED' } | undefined> = {
        j1: undefined,
        j2: undefined,
        j3: undefined,
      }

      const gameTable = document.querySelector('.sc-tableGame')
      if (!gameTable) return results

      const rows = gameTable.querySelectorAll('tbody tr')
      const opponents: Record<string, 'j1' | 'j2' | 'j3'> = {
        'オランダ': 'j1',
        'チュニジア': 'j2',
        'スウェーデン': 'j3',
      }

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td')
        if (cells.length < 4) return

        // セル構造: [日時, カテゴリ, チームA, スコア, チームB, 会場]
        const teamACell = cells[2]?.innerText?.trim()
        const scoreCell = cells[3]?.innerText?.trim()
        const teamBCell = cells[4]?.innerText?.trim()

        // 日本が左右どちら側でも拾えるようにする
        if (teamACell && teamBCell && scoreCell) {
          const scoreMatch = scoreCell.match(/(\d+)\s*[-–]\s*(\d+)/)
          if (scoreMatch) {
            const scoreA = parseInt(scoreMatch[1], 10)
            const scoreB = parseInt(scoreMatch[2], 10)

            const isJapanHome = teamACell === '日本'
            const isJapanAway = teamBCell === '日本'
            if (!isJapanHome && !isJapanAway) return

            const opponentName = isJapanHome ? teamBCell : teamACell
            const key = opponents[opponentName]
            if (key) {
              // scoreAはチームA、scoreBはチームB
              results[key] = {
                japan: isJapanHome ? scoreA : scoreB,
                opponent: isJapanHome ? scoreB : scoreA,
                status: 'FINISHED',
              }
            }
          }
        }
      })

      return results
    })

    return matches
  } catch (err) {
    console.error('[puppeteer] fetchJapanMatches error:', err)
    return { j1: undefined, j2: undefined, j3: undefined }
  } finally {
    if (ownsBrowser && browser) await browser.close()
  }
}

async function fetchTopScorer(sharedBrowser?: any): Promise<Array<{ name: string; goals: number }>> {
  const ownsBrowser = !sharedBrowser
  let browser: any = sharedBrowser ?? null
  try {
    if (!browser) browser = await launchBrowser()
    const page = await browser.newPage()
    await page.goto('https://soccer.yahoo.co.jp/wcup/category/2026/stats', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    const scorers = await page.evaluate(() => {
      const normalize = (value: string) =>
        value
          .normalize('NFKC')
          .replace(/[・･·\s]/g, '')
          .toLowerCase()

      const scorerMap = new Map<string, { name: string; goals: number }>()
      const tables = document.querySelectorAll('.sc-tableStats')

      tables.forEach((statsTable) => {
        const rows = statsTable.querySelectorAll('tbody tr')
        rows.forEach((row) => {
          const cells = row.querySelectorAll('td')
          if (cells.length < 5) return

          // セル構造: [順位, 選手名, チーム, ポジション, ゴール数, ...]
          const nameCell = cells[1]?.innerText?.trim()
          const goalsCell = cells[4]?.innerText?.trim()
          if (!nameCell || !goalsCell) return

          const goals = parseInt(goalsCell, 10)
          if (Number.isNaN(goals) || goals <= 0) return

          const key = normalize(nameCell)
          const existing = scorerMap.get(key)
          if (!existing || goals > existing.goals) {
            scorerMap.set(key, { name: nameCell, goals })
          }
        })
      })

      return [...scorerMap.values()]
        .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'ja'))
    })

    return scorers
  } catch (err) {
    console.error('[puppeteer] fetchTopScorer error:', err)
    return []
  } finally {
    if (ownsBrowser && browser) await browser.close()
  }
}

async function fetchRankings(
  sharedBrowser?: any,
): Promise<Record<'r1' | 'r2' | 'r3' | 'r4', string | undefined>> {
  const ownsBrowser = !sharedBrowser
  let browser: any = sharedBrowser ?? null
  try {
    if (!browser) browser = await launchBrowser()
    const page = await browser.newPage()
    await page.goto('https://soccer.yahoo.co.jp/wcup/category/2026/cups/159/31458', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    const rankings = await page.evaluate(() => {
      const results: Record<'r1' | 'r2' | 'r3' | 'r4', string | undefined> = {
        r1: undefined,
        r2: undefined,
        r3: undefined,
        r4: undefined,
      }

      const parseScore = (scoreText: string) => {
        const match = scoreText.replace(/\s+/g, ' ').match(/(\d+)\s*[-–]\s*(\d+)/)
        if (!match) return null
        return { home: Number(match[1]), away: Number(match[2]) }
      }

      const rows = document.querySelectorAll('.sc-tableGame tbody tr')
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td')
        if (cells.length < 5) return

        const category = cells[1]?.textContent?.trim() || ''
        const home = cells[2]?.textContent?.trim() || ''
        const scoreText = cells[3]?.textContent?.trim() || ''
        const away = cells[4]?.textContent?.trim() || ''
        const score = parseScore(scoreText)

        if (!home || !away || !score) return

        if (category === '決勝') {
          if (score.home > score.away) {
            results.r1 = home
            results.r2 = away
          } else if (score.away > score.home) {
            results.r1 = away
            results.r2 = home
          }
        }

        if (category === '3位決定戦') {
          if (score.home > score.away) {
            results.r3 = home
            results.r4 = away
          } else if (score.away > score.home) {
            results.r3 = away
            results.r4 = home
          }
        }
      })

      return results
    })

    return rankings
  } catch (err) {
    console.error('[puppeteer] fetchRankings error:', err)
    return { r1: undefined, r2: undefined, r3: undefined, r4: undefined }
  } finally {
    if (ownsBrowser && browser) await browser.close()
  }
}

async function fetchAdvancedTeams(sharedBrowser?: any): Promise<ActualResults['advancedTeams']> {
  const ownsBrowser = !sharedBrowser
  let browser: any = sharedBrowser ?? null
  try {
    if (!browser) browser = await launchBrowser()
    const page = await browser.newPage()
    await page.goto('https://soccer.yahoo.co.jp/wcup/category/2026/cups/159/31458', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    const advancedTeams = await page.evaluate(() => {
      const r32 = new Set<string>()
      const r16 = new Set<string>()
      const r16Finished = new Set<string>()
      const r8 = new Set<string>()
      const r8Finished = new Set<string>()
      const r4plus = new Set<string>()
      const r4plusFinished = new Set<string>()

      const rows = document.querySelectorAll('.sc-tableGame tbody tr')
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td')
        if (cells.length < 5) return

        const category = cells[1]?.textContent?.trim() || ''
        const home = cells[2]?.textContent?.trim() || ''
        const score = cells[3]?.textContent?.trim() || ''
        const away = cells[4]?.textContent?.trim() || ''
        const teams = [home, away].filter(Boolean)
        const isFinished = /\d+\s*[-–]\s*\d+/.test(score)
        const isRound32 = category === 'ラウンド32' || category === 'ベスト32'
        const isRound16 = category === 'ラウンド16' || category === 'ベスト16'
        const isQuarterFinal = category === '準々決勝' || category === 'ベスト8'
        const isSemiPlus = category === '準決勝' || category === '3位決定戦' || category === '決勝' || category === 'ベスト4'

        if (isRound32) {
          teams.forEach((t) => r32.add(t))
        }
        if (isRound16) {
          teams.forEach((t) => r16.add(t))
          if (isFinished) teams.forEach((t) => r16Finished.add(t))
        }
        if (isQuarterFinal) {
          teams.forEach((t) => r8.add(t))
          if (isFinished) teams.forEach((t) => r8Finished.add(t))
        }
        if (isSemiPlus) {
          teams.forEach((t) => r4plus.add(t))
          if (isFinished) teams.forEach((t) => r4plusFinished.add(t))
        }
      })

      return {
        r32: [...r32],
        r16: [...r16],
        r16Finished: [...r16Finished],
        r8: [...r8],
        r8Finished: [...r8Finished],
        r4plus: [...r4plus],
        r4plusFinished: [...r4plusFinished],
      }
    })

    const validTeamSet = new Set(TEAMS)
    const sanitize = (teams: string[]) => teams.filter((team) => validTeamSet.has(team))

    return {
      r32: sanitize(advancedTeams.r32),
      r16: sanitize(advancedTeams.r16),
      r16Finished: sanitize(advancedTeams.r16Finished || []),
      r8: sanitize(advancedTeams.r8),
      r8Finished: sanitize(advancedTeams.r8Finished || []),
      r4plus: sanitize(advancedTeams.r4plus),
      r4plusFinished: sanitize(advancedTeams.r4plusFinished || []),
    }
  } catch (err) {
    console.error('[puppeteer] fetchAdvancedTeams error:', err)
    return { r32: [], r16: [], r16Finished: [], r8: [], r8Finished: [], r4plus: [], r4plusFinished: [] }
  } finally {
    if (ownsBrowser && browser) await browser.close()
  }
}

export async function fetchWCResults(): Promise<Partial<ActualResults>> {
  let browser: any = null
  try {
    browser = await launchBrowser()

    const [matches, scorers, rankings, advancedTeams] = await Promise.all([
      fetchJapanMatches(browser),
      fetchTopScorer(browser),
      fetchRankings(browser),
      fetchAdvancedTeams(browser),
    ])

    // 名前のゆれを考慮した得点王マッチング
    const topScorer = scorers[0]
    let bestScorerMatch: { name: string; goals: number } | null = null

    if (topScorer) {
      // ネット上の得点王名とローカルの候補リストをマッチング
      bestScorerMatch = {
        name: topScorer.name,
        goals: topScorer.goals,
      }
    }

    const result: Partial<ActualResults> = {
      matches,
      rankings,
      advancedTeams,
      scorer: bestScorerMatch || { name: '', goals: 0 },
      scorers,
      syncedAt: new Date().toISOString(),
    }

    return result
  } finally {
    if (browser) await browser.close()
  }
}