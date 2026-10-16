export default function ArenaPresentationLinks(){
 const back=encodeURIComponent(location.pathname+location.search);
 return <nav className="arena-presentation-links" aria-label="Presentera Arenan"><a className="arena-action" href={`/arena/showtime?return=${back}`}>ARENAN SHOWTIME</a></nav>;
}
