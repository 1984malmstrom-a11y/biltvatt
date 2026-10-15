import "./arena-competition.css";
export default function ArenaTemporaryConcept(){
 const kind=new URLSearchParams(location.search).get('fightconcept')??'A';
 return <aside className={`arena-temp-live-concept concept-${kind}`} aria-label="Tillfällig aktivitet · designkoncept"><strong>CONCEPT ONLY · HUMAN REVIEW REQUIRED</strong><p>Tillfällig fight-aktivitet · {kind}</p>{kind==='A'?<div><span>FIGHT-SLOT VID MATCHPANELEN</span><button>Registrera fight-erbjudande · +2 p</button></div>:kind==='B'?<div><span>FRISTÅENDE MINI-YTA · HUVUDKLUSTRET ÄR ORÖRT</span><div className="arena-temp-mini">+2 p</div><button>Fight-erbjudande</button></div>:<div><span>QUICK ACTION I FIGHT CENTER</span><a href="/arena/fights">Öppna matchen → Registrera fight-aktivitet</a></div>}<small>Inte aktiverat produktflöde. Sju ordinarie aktivitetscirklar behålls.</small></aside>;
}
