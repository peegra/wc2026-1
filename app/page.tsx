'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { JAPAN_MATCHES, TEAMS, SCORER_CANDIDATES, JAPAN_SCORER_CANDIDATES, groupTeamsByDefinition, orderTeamsByGroupDefinition, isTournamentStarted, normalizeScoreInput } from '@/lib/data'

export default function Home() {
  const locked = isTournamentStarted()
  const [name, setName]     = useState('')
  const [scores, setScores] = useState({ j1:[0,0] as [number,number], j2:[0,0] as [number,number], j3:[0,0] as [number,number] })
  const [rankings, setRankings] = useState({ r1:'', r2:'', r3:'', r4:'' })
  const [scorer, setScorer] = useState({ name:'', goals: 0 })
  const [loading, setLoading] = useState(false)
  const [teams, setTeams] = useState<string[]>(() => TEAMS)
  const [toast, setToast]   = useState<{type:'ok'|'err'|'lock', msg:string}|null>(null)
  const groupedTeams = groupTeamsByDefinition(teams)
  const scorerCandidates = [...JAPAN_SCORER_CANDIDATES, ...SCORER_CANDIDATES]
  const [done, setDone]     = useState(false)

  const setScore = (m: 'j1'|'j2'|'j3', idx: 0|1, v: string) => {
    const normalized = normalizeScoreInput(v)
    setScores(s => ({
      ...s,
      [m]: s[m].map((x, i) => i === idx ? Math.min(20, Math.max(0, Number(normalized) || 0)) : x) as [number, number],
    }))
  }

  useEffect(() => {
    fetch('/api/teams')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => Array.isArray(data.teams) && setTeams(orderTeamsByGroupDefinition(data.teams)))
      .catch(() => {})
  }, [])

  const showToast = (type: 'ok'|'err'|'lock', msg: string) => {
    setToast({type, msg})
    setTimeout(() => setToast(null), 4000)
  }

  const submit = async () => {
    if (!name.trim()) { showToast('err', '名前を入力してください'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          matches: {
            j1: { japan: scores.j1[0], opponent: scores.j1[1] },
            j2: { japan: scores.j2[0], opponent: scores.j2[1] },
            j3: { japan: scores.j3[0], opponent: scores.j3[1] },
          },
          rankings,
          scorer,
        }),
      })
      const data = await res.json()
      if (res.ok) { setDone(true) }
      else if (data.locked) { showToast('lock', data.error) }
      else { showToast('err', data.error || 'エラーが発生しました') }
    } finally { setLoading(false) }
  }

  if (done) return (
    <main>
      <Nav />
      <div className="container page-wrap" style={{textAlign:'center', paddingTop:80}}>
        <div style={{fontSize:64, marginBottom:16}}>🎉</div>
        <h2 style={{fontSize:24, marginBottom:8}}>予想を登録しました！</h2>
        <p style={{color:'var(--muted)', marginBottom:32}}>大会中にランキングが更新されます</p>
        <Link href="/ranking" className="btn" style={{display:'inline-block', width:'auto', padding:'12px 32px'}}>
          ランキングを見る →
        </Link>
      </div>
    </main>
  )

  return (
    <main>
      <Nav />
      <div className="container page-wrap">
        <div className="hero">
          <div className="eyebrow">🇯🇵 FIFA World Cup 2026</div>
          <h1 className="hero-title">予想<span className="ac">バトル</span></h1>
          <p className="hero-sub">スコア・順位を予想してポイントを競え</p>
        </div>

        {locked && (
          <div className="toast toast-lock" style={{marginBottom:16}}>
            🔒 大会が開始されたため新規予想の受付は終了しました
          </div>
        )}

        <div className="card section">
          <div className="card-label">あなたの名前</div>
          <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="例: 田中太郎" disabled={locked} />
        </div>

        <div className="card section">
          <div className="card-label">日本代表 グループステージ予想</div>
          {JAPAN_MATCHES.map(m => {
            const key = m.id as 'j1'|'j2'|'j3'
            const s = scores[key]
            return (
              <div className="match-row" key={m.id}>
                <span className="match-date">{m.date}</span>
                <span className="t-japan">日本</span>
                <input className="score-in" type="text" inputMode="numeric" pattern="[0-9]*" min={0} max={20} value={s[0]} onChange={e=>setScore(key,0,e.target.value)} disabled={locked} />
                <span className="score-sep">—</span>
                <input className="score-in" type="text" inputMode="numeric" pattern="[0-9]*" min={0} max={20} value={s[1]} onChange={e=>setScore(key,1,e.target.value)} disabled={locked} />
                <span className="t-opp">{m.opponent}</span>
              </div>
            )
          })}
          <div className="pt-hint">
            完全一致 <strong>10pt</strong> ／ 得失点差一致 <strong>3pt</strong> ／ 勝敗一致 <strong>1pt</strong>
          </div>
        </div>

        <div className="card section">
          <div className="card-label">大会最終順位予想</div>
          <div className="rank-grid">
            {([['r1','🥇'],['r2','🥈'],['r3','🥉'],['r4','4️⃣']] as const).map(([k,e]) => (
              <div className="rank-item" key={k}>
                <span className="rank-emoji">{e}</span>
                <select value={rankings[k]} onChange={ev=>setRankings(r=>({...r,[k]:ev.target.value}))} disabled={locked}>
                  <option value="">選択</option>
                  {groupedTeams.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.teams.map(t => <option key={t} value={t}>{t}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="pt-hint">
            1位 <strong>30pt</strong> ／ 2位 <strong>20pt</strong> ／ 3位 <strong>15pt</strong> ／ 4位 <strong>10pt</strong>
            <br/>到達ボーナス: ベスト8以上 <strong>+5pt</strong> ／ ベスト16 <strong>+3pt</strong> ／ ベスト32 <strong>+1pt</strong>
            <br/>1位・2位は、実際の順位より下がっても到達ボーナスとして扱います。
          </div>
        </div>

        <div className="card section">
          <div className="card-label">得点王予想 <span style={{fontWeight:400,fontSize:11,color:'var(--muted)',marginLeft:4}}>ボーナス</span></div>
          <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
            <select value={scorer.name} onChange={e=>setScorer(s=>({...s,name:e.target.value}))} disabled={locked} style={{flex:1, minWidth:220}}>
              <option value="">候補から選ぶ</option>
              <optgroup label="日本候補">
                {JAPAN_SCORER_CANDIDATES.map(c => <option key={c.name} value={c.name}>{`${c.name} — ${c.note}`}</option>)}
              </optgroup>
              <optgroup label="大会候補">
                {SCORER_CANDIDATES.map(c => <option key={c.name} value={c.name}>{`${c.name} — ${c.note}`}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="pt-hint">
            得点王的中で <strong>10pt</strong>。外れても選んだ選手が得点したら <strong>1点1pt</strong>。
          </div>
        </div>

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
        <button className="btn" onClick={submit} disabled={loading || locked}>
          {loading ? '送信中...' : '予想を登録する 🚀'}
        </button>
      </div>
    </main>
  )
}

function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-logo">⚽ W杯<span className="hi">2026</span></Link>
        <div className="nav-links">
          <Link href="/" className="nav-link">予想入力</Link>
          <Link href="/ranking" className="nav-link">ランキング</Link>
        </div>
      </div>
    </nav>
  )
}
