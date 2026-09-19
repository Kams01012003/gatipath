import React, {useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const trains = [
  {
    number:"14095", name:"Himalayan Queen", type:"Express",
    from:"Delhi Sarai Rohilla", to:"Kalka", departure:"05:35 AM", arrival:"11:10 AM",
    state:"not-started", delay:0, current:null,
    stations:[
      ["Delhi Sarai Rohilla","05:35 AM","Origin"],["Sonipat Jn","06:24 AM","Upcoming"],
      ["Ganaur","06:39 AM","Upcoming"],["Samalkha","07:02 AM","Upcoming"],
      ["Panipat Jn","07:20 AM","Upcoming"],["Karnal","07:57 AM","Upcoming"],
      ["Kurukshetra Jn","08:46 AM","Upcoming"],["Ambala Cantt Jn","09:45 AM","Upcoming"],
      ["Chandigarh","10:25 AM","Upcoming"],["Chandi Mandir","10:41 AM","Upcoming"],
      ["Kalka","11:10 AM","Destination"]
    ]
  },
  {
    number:"14096", name:"Himalayan Queen", type:"Express",
    from:"Kalka", to:"Delhi Sarai Rohilla", departure:"04:55 PM", arrival:"10:40 PM",
    state:"scheduled", delay:0, current:null,
    stations:[
      ["Kalka","04:55 PM","Origin"],["Chandi Mandir","05:24 PM","Upcoming"],
      ["Chandigarh","05:40 PM","Upcoming"],["Ambala Cantt Jn","06:20 PM","Upcoming"],
      ["Kurukshetra Jn","07:12 PM","Upcoming"],["Panipat Jn","08:35 PM","Upcoming"],
      ["Samalkha","08:54 PM","Upcoming"],["Ganaur","09:14 PM","Upcoming"],
      ["Sonipat Jn","09:31 PM","Upcoming"],["Delhi Sarai Rohilla","10:40 PM","Destination"]
    ]
  },
  {
    number:"12723", name:"Telangana Express", type:"Superfast",
    from:"Hyderabad", to:"New Delhi", departure:"06:25 AM", arrival:"06:40 AM +1",
    state:"running", delay:12, current:"Kazipet Jn",
    stations:[
      ["Hyderabad Deccan","06:25 AM","Completed"],["Secunderabad Jn","06:50 AM","Completed"],
      ["Kazipet Jn","08:22 AM","Current"],["Ramannapet","09:03 AM","Upcoming"],
      ["Warangal","09:21 AM","Upcoming"],["Vijayawada Jn","01:05 PM","Upcoming"],
      ["Nagpur","08:15 PM","Upcoming"],["Bhopal Jn","02:35 AM +1","Upcoming"],
      ["Agra Cantt","01:55 PM +1","Upcoming"],["New Delhi","06:40 AM +1","Destination"]
    ]
  },
  {
    number:"12724", name:"Telangana Express", type:"Superfast",
    from:"New Delhi", to:"Hyderabad", departure:"04:00 PM", arrival:"04:10 PM +1",
    state:"scheduled", delay:0, current:null,
    stations:[
      ["New Delhi","04:00 PM","Origin"],["Agra Cantt","06:20 PM","Upcoming"],
      ["Bhopal Jn","05:40 AM +1","Upcoming"],["Nagpur","12:05 PM +1","Upcoming"],
      ["Vijayawada Jn","07:10 AM +1","Upcoming"],["Secunderabad Jn","03:25 PM +1","Upcoming"],
      ["Hyderabad Deccan","04:10 PM +1","Destination"]
    ]
  }
];

function App(){
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState(null);
  const [direction,setDirection]=useState(null);
  const [boarding,setBoarding]=useState("");
  const [showAll,setShowAll]=useState(false);

  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return [];
    return trains.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.number.includes(q) ||
      t.from.toLowerCase().includes(q) ||
      t.to.toLowerCase().includes(q)
    );
  },[query]);

  const candidates = selected ? trains.filter(t=>t.name===selected.name) : [];
  const active = direction || selected;

  const statusText = !active ? "" :
    active.state==="running" ? "ON THE WAY" :
    active.state==="not-started" ? "NOT STARTED YET" :
    active.state==="scheduled" ? "SCHEDULED" : "JOURNEY COMPLETE";

  function choose(t){
    setSelected(t);
    setDirection(null);
    setBoarding("");
    setTimeout(()=>document.getElementById("journey")?.scrollIntoView({behavior:"smooth"}),50);
  }

  function reset(){
    setSelected(null); setDirection(null); setQuery(""); setBoarding("");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  return <div className="app">
    <header className="nav">
      <button className="brand" onClick={reset}>gati<span>path</span></button>
      <div className="nav-pill">INDIAN RAILWAYS · LIVE JOURNEYS</div>
    </header>

    {!active ? <main className="hero">
      <div className="eyebrow">A clearer way to track Indian trains</div>
      <h1>Know where<br/><em>your train is.</em></h1>
      <p className="sub">Search by train name or number. Choose the journey. Follow every station.</p>
      <div className="search-wrap">
        <div className="search-icon">⌕</div>
        <input autoFocus value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Search Himalayan Queen, Telangana Express, 14095…" />
        {query && <button className="clear" onClick={()=>setQuery("")}>×</button>}
      </div>
      {results.length>0 && <div className="results">
        {results.map(t=><button className="result" key={t.number} onClick={()=>choose(t)}>
          <span className="train-mark">↗</span>
          <span><b>{t.name}</b><small>{t.number} · {t.from} → {t.to}</small></span>
          <span className="arrow">→</span>
        </button>)}
      </div>}
      <div className="examples">
        <span>Try</span>
        {["Himalayan Queen","Telangana Express","14095"].map(x=><button key={x} onClick={()=>setQuery(x)}>{x}</button>)}
      </div>
    </main> :
    <main id="journey" className="journey-page">
      {candidates.length>1 && !direction ? <section className="direction">
        <div className="back" onClick={reset}>← Search again</div>
        <div className="eyebrow">{selected.name}</div>
        <h2>Which journey<br/><em>are you checking?</em></h2>
        <div className="direction-grid">
          {candidates.map(t=><button key={t.number} onClick={()=>setDirection(t)} className="direction-card">
            <div className="dir-top"><span>{t.number}</span><span>{t.departure}</span></div>
            <strong>{t.from}</strong><i>↓</i><strong>{t.to}</strong>
            <small>{t.type} · Daily service</small>
          </button>)}
        </div>
      </section> :
      <section className="status-page">
        <div className="back" onClick={()=>{if(selected?.name) {setDirection(null)} else reset()}}>← {direction ? "Change journey" : "Search"}</div>
        <div className="train-heading">
          <div>
            <div className="eyebrow">{active.number} · {active.type}</div>
            <h2>{active.name}</h2>
            <p>{active.from} <span>→</span> {active.to}</p>
          </div>
          <button className="share" onClick={()=>navigator.clipboard?.writeText(location.href)}>↗ Share</button>
        </div>

        <div className={"status-card "+active.state}>
          <div className="status-main">
            <span className="live-dot"></span>
            <div><small>TRAIN STATUS</small><h3>{statusText}</h3></div>
          </div>
          {active.state==="not-started" && <div className="status-detail"><b>{active.departure}</b><span>Departure from {active.from}</span></div>}
          {active.state==="running" && <div className="status-detail"><b>{active.current}</b><span>Currently on the route · {active.delay} min late</span></div>}
          {active.state==="scheduled" && <div className="status-detail"><b>{active.departure}</b><span>Scheduled departure from {active.from}</span></div>}
        </div>

        <div className="boarding">
          <div><b>Where are you boarding?</b><small>Highlight your station on the journey</small></div>
          <select value={boarding} onChange={e=>setBoarding(e.target.value)}>
            <option value="">Select a station</option>
            {active.stations.map(s=><option key={s[0]} value={s[0]}>{s[0]}</option>)}
          </select>
        </div>

        <div className="timeline-head"><div><span className="eyebrow">THE JOURNEY</span><h3>{active.stations.length} stations</h3></div><span className="updated">● Demo data · ready for live API</span></div>
        <div className="timeline">
          {active.stations.map((s,i)=>{
            const state=s[2].toLowerCase();
            const isCurrent=s[0]===active.current || state==="current";
            const isBoard=s[0]===boarding;
            return <div className={"station "+(isCurrent?"current ":"")+(isBoard?"boarding-station ":"")+(state==="completed"?"completed ":"")} key={s[0]}>
              <div className="rail"><span className="node">{isCurrent?"🚆":state==="completed"?"✓":i===0||i===active.stations.length-1?"●":""}</span></div>
              <div className="station-content">
                <div><h4>{s[0]}</h4><span className="station-state">{isBoard?"YOUR STATION":isCurrent?"CURRENT LOCATION":state==="completed"?"DEPARTED":s[2]}</span></div>
                <strong>{s[1]}</strong>
              </div>
            </div>
          })}
        </div>

        <footer><span>Gatipath</span><span>Know where your train is.</span></footer>
      </section>}
    </main>}
  </div>
}
createRoot(document.getElementById("root")).render(<App/>);