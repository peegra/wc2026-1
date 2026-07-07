'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Prediction, ActualResults, calcPoints, JAPAN_MATCHES, TEAMS, PredictionVersion, SCORER_CANDIDATES, JAPAN_SCORER_CANDIDATES, groupTeamsByDefinition, orderTeamsByGroupDefinition, isTournamentStarted, normalizeScoreInput } from '@/lib/data'

export default function PredictDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [pred,    setPred]    = useState<Prediction|null>(null)
  const [results, setResults] = useState<ActualResults|null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  // edit state
  const [scores,   setScores]   = useState({ j1:[0,0] as [number,number], j2:[0,0] as [number,number], j3:[0,0] as [number,number] })
  const [rankings, setRankings] = useState({ r1:'', r2:'', r3:'', r4:'' })
  const [scorer,   setScorer]   = useState({ name:'', goals: 0 })
  const [saving,   setSaving]   = useState(false)
  const [teams,     setTeams]     = useState<string[]>(() => TEAMS)
  const scorerCandidates = [...JAPAN_SCORER_CANDIDATES, ...SCORER_CANDIDATES]
  const groupedTeams = groupTeamsByDefinition(teams)
  const [toast,    setToast]    = useState<{type:'ok'|'err'|'lock', msg:string}|null>(null)

  const locked = isTournamentStarted()

  const showToast = (type: 'ok'|'err'|'lock', msg: string) => {
    setToast({type,msg}); setTimeout(()=>setToast(null), 4000)
  }

  useEffect(() => {
    fetch('/api/teams')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => Array.isArray(data.teams) && setTeams(orderTeamsByGroupDefinition(data.teams)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/predictions').then(r=>r.json()),
      fetch('/api/results').then(r=>r.json()),
    ]).then(([preds, res]) => {
      const found = (preds as Prediction[]).find(p => p.id === id)
      if (found) {
        setPred(found)
        setResults(res)
        // edit stateを初期化
        const c = found.current
        setScores({
          j1: [c.matches.j1.japan, c.matches.j1.opponent],
          j2: [c.matches.j2.japan, c.matches.j2.opponent],
          j3: [c.matches.j3.japan, c.matches.j3.opponent],
        })
        setRankings(c.rankings)
        setScorer(c.scorer)
      }
      setLoading(false)
    })
  }, [id])

  const setScore = (m:'j1'|'j2'|'j3', idx:0|1, v:string) => {
    const normalized = normalizeScoreInput(v)
    setScores(s => ({
      ...s,
      [m]: s[m].map((x, i) => i === idx ? Math.min(20, Math.max(0, Number(normalized) || 0)) : x) as [number, number],
    }))
  }

  const save = async () => {
    if (!pred) return
    setSaving(true)
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pred.name,
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
      if (res.ok) {
        showToast('ok', '✅ 予想を更新しました')
        setEditing(false)
        // ページを再取得
        const updated = await fetch('/api/predictions').then(r=>r.json())
        const found = (updated as Prediction[]).find(p => p.id === id)
        if (found) setPred(found)
      } else if (data.locked) {
        showToast('lock', '🔒 ' + data.error)
        setEditing(false)
      } else {
        showToast('err', data.error || 'エラーが発生しました')
      }
    } finally { setSaving(false) }
  }

  if (loading) return (
    <main><Nav /><div className="container page-wrap"><div className="empty"><div className="empty-icon">⏳</div>読み込み中...</div></div></main>
  )
  if (!pred) return (
    <main><Nav /><div className="container page-wrap"><div className="empty"><div className="empty-icon">🔍</div>予想が見つかりません</div></div></main>
  )

  const pts = calcPoints(pred, results)
  const c = pred.current
  const rankingRows = results ? ([
    { label: '1位', team: c.rankings.r1, pts: pts.details.r1 },
    { label: '2位', team: c.rankings.r2, pts: pts.details.r2 },
    { label: '3位', team: c.rankings.r3, pts: pts.details.r3 },
    { label: '4位', team: c.rankings.r4, pts: pts.details.r4 },
  ] as const).map(row => {
    const team = row.team || '未選択'
    const stage = results.advancedTeams.r4plusFinished?.includes(team)
      ? 'ベスト4'
      : results.advancedTeams.r4plus.includes(team)
        ? 'ベスト4以上'
        : results.advancedTeams.r8Finished?.includes(team)
          ? 'ベスト8'
          : results.advancedTeams.r8.includes(team)
            ? 'ベスト8以上'
            : results.advancedTeams.r16Finished?.includes(team)
              ? 'ベスト16'
              : results.advancedTeams.r16.includes(team)
                ? 'ベスト16以上'
                : results.advancedTeams.r32.includes(team)
                  ? 'ベスト32'
                  : '予選敗退'
    return { ...row, team, stage }
  }) : []

  return (
    <main>
      <Nav />
      <div className="container page-wrap">
        {/* ヘッダー */}
        <div style={{marginBottom:20}}>
          <Link href="/ranking" className="btn-ghost" style={{marginBottom:16, display:'inline-flex'}}>
            ← ランキングへ
          </Link>
          <div className="detail-header">
            <div style={{flex:1}}>
              <div className="detail-name">{pred.name}</div>
              <div style={{marginTop:6}}>
                {pred.locked || locked
                  ? <span className="badge-lock">🔒 予想確定（編集不可）</span>
                  : <span className="badge-open">✏️ 大会前：編集可能</span>
                }
              </div>
            </div>
            {results && (
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:'Bebas Neue, sans-serif', fontSize:40, color:'var(--blue-glow)', lineHeight:1}}>{pts.total}</div>
                <div style={{fontSize:11, color:'var(--muted)'}}>pt</div>
              </div>
            )}
          </div>
        </div>

        {/* ポイント内訳 */}
        {results && (
          <div className="card section">
            <div className="card-label">ポイント内訳</div>
            <table className="pt-table">
              <tbody>
                {JAPAN_MATCHES.map(m => {
                  const key = m.id as 'j1'|'j2'|'j3'
                  const mc = c.matches[key]
                  const mr = results.matches[key]
                  const p = pts.details[key]
                  return (
                    <tr key={key}>
                      <td>日本 vs {m.opponent}</td>
                      <td style={{color:'var(--white)'}}>
                        予想 {mc.japan}–{mc.opponent}
                        {mr?.status==='FINISHED' && <span style={{marginLeft:6,color:'var(--muted)'}}>/ 結果 {mr.japan}–{mr.opponent}</span>}
                      </td>
                      <td>{p > 0 ? `+${p}pt` : mr?.status==='FINISHED' ? '0pt' : '—'}</td>
                    </tr>
                  )
                })}
                <tr><td colSpan={2} style={{paddingTop:8, borderTop:'1px solid var(--border)'}}>試合合計</td><td style={{paddingTop:8}}>{pts.match}pt</td></tr>
                <tr>
                  <td colSpan={3} style={{paddingTop:8, color:'var(--muted)', fontSize:13, lineHeight:1.5}}>
                    <div>順位予想内訳</div>
                    {rankingRows.map(row => (
                      <div key={row.label} style={{display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8}}>
                        <span>{row.label} {row.team}</span>
                        <span style={{textAlign:'center'}}>{row.stage}</span>
                        <span style={{color:'var(--white)'}}>{row.pts}pt</span>
                      </div>
                    ))}
                  </td>
                </tr>
                <tr><td colSpan={2}>順位予想合計</td><td>{pts.ranking}pt</td></tr>
                <tr><td colSpan={2}>得点王ボーナス</td><td>{pts.scorer}pt</td></tr>
                <tr className="pt-total">
                  <td colSpan={2} style={{fontWeight:700}}>合計</td>
                  <td style={{color:'var(--blue-glow)', fontFamily:'Bebas Neue, sans-serif', fontSize:20}}>{pts.total}pt</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* 予想内容 / 編集フォーム */}
        {!editing ? (
          <>
            <div className="card section">
              <div className="card-label" style={{justifyContent:'space-between'}}>
                <span>現在の予想</span>
                {!pred.locked && !locked && (
                  <button className="btn-ghost" style={{fontSize:12, padding:'4px 10px'}} onClick={()=>setEditing(true)}>✏️ 編集する</button>
                )}
              </div>
              {JAPAN_MATCHES.map(m => {
                const key = m.id as 'j1'|'j2'|'j3'
                const mc = c.matches[key]
                return (
                  <div className="match-row" key={m.id}>
                    <span className="match-date">{m.date}</span>
                    <span className="t-japan">日本</span>
                    <span style={{fontFamily:'Bebas Neue,sans-serif', fontSize:22, minWidth:32, textAlign:'center'}}>{mc.japan}</span>
                    <span className="score-sep">—</span>
                    <span style={{fontFamily:'Bebas Neue,sans-serif', fontSize:22, minWidth:32, textAlign:'center'}}>{mc.opponent}</span>
                    <span className="t-opp">{m.opponent}</span>
                  </div>
                )
              })}
              <div style={{marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13}}>
                {([['r1','🥇'],['r2','🥈'],['r3','🥉'],['r4','4️⃣']] as const).map(([k,e])=>(
                  <div key={k} style={{color:'var(--muted)'}}>
                    {e} {c.rankings[k] || <span style={{opacity:.5}}>未選択</span>}
                  </div>
                ))}
              </div>
              <div style={{marginTop:10, fontSize:13, color:'var(--muted)'}}>
                ⭐ 得点王: {c.scorer.name || '未入力'}
              </div>
            </div>
          </>
        ) : (
          <div className="card section">
            <div className="card-label">予想を編集</div>

            {/* スコア */}
            {JAPAN_MATCHES.map(m => {
              const key = m.id as 'j1'|'j2'|'j3'
              const s = scores[key]
              return (
                <div className="match-row" key={m.id}>
                  <span className="match-date">{m.date}</span>
                  <span className="t-japan">日本</span>
                  <input className="score-in" type="text" inputMode="numeric" pattern="[0-9]*" min={0} max={20} value={s[0]} onChange={e=>setScore(key,0,e.target.value)} />
                  <span className="score-sep">—</span>
                  <input className="score-in" type="text" inputMode="numeric" pattern="[0-9]*" min={0} max={20} value={s[1]} onChange={e=>setScore(key,1,e.target.value)} />
                  <span className="t-opp">{m.opponent}</span>
                </div>
              )
            })}

            {/* 順位 */}
            <div className="rank-grid mt16">
              {([['r1','🥇'],['r2','🥈'],['r3','🥉'],['r4','4️⃣']] as const).map(([k,e])=>(
                <div className="rank-item" key={k}>
                  <span className="rank-emoji">{e}</span>
                  <select value={rankings[k]} onChange={ev=>setRankings(r=>({...r,[k]:ev.target.value}))}>
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

            {/* 得点王 */}
            <div style={{display:'flex', gap:10, alignItems:'center', marginTop:16, flexWrap:'wrap'}}>
              <select value={scorer.name} onChange={e=>setScorer(s=>({...s,name:e.target.value}))} style={{flex:1, minWidth:220}}>
                <option value="">候補から選ぶ</option>
                <optgroup label="日本候補">
                  {JAPAN_SCORER_CANDIDATES.map(c => <option key={c.name} value={c.name}>{`${c.name} — ${c.note}`}</option>)}
                </optgroup>
                <optgroup label="大会候補">
                  {SCORER_CANDIDATES.map(c => <option key={c.name} value={c.name}>{`${c.name} — ${c.note}`}</option>)}
                </optgroup>
              </select>
            </div>
            <div style={{marginTop:4, fontSize:13, color:'var(--muted)'}}>的中で10pt。外れても選んだ選手が得点したら1点1pt。</div>

            {toast && <div className={`toast toast-${toast.type} mt8`}>{toast.msg}</div>}

            <div style={{display:'flex', gap:8, marginTop:16}}>
              <button className="btn" onClick={save} disabled={saving} style={{flex:1}}>
                {saving ? '保存中...' : '保存する'}
              </button>
              <button className="btn-ghost" onClick={()=>setEditing(false)} style={{flex:'none'}}>キャンセル</button>
            </div>
          </div>
        )}

        {toast && !editing && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

        {/* 変更履歴 */}
        {pred.history && pred.history.length > 0 && (
          <div className="card section">
            <div className="card-label">変更履歴</div>
            {pred.history.map((v: PredictionVersion, i: number) => (
              <div className="history-item" key={i}>
                <span style={{marginRight:8}}>📅 {new Date(v.savedAt).toLocaleString('ja-JP')}</span>
                日本 vs オランダ: {v.matches.j1.japan}–{v.matches.j1.opponent}　
                日本 vs チュニジア: {v.matches.j2.japan}–{v.matches.j2.opponent}　
                日本 vs スウェーデン: {v.matches.j3.japan}–{v.matches.j3.opponent}
              </div>
            ))}
          </div>
        )}
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
