import {useId} from 'react';
import {Crown} from 'lucide-react';
// A real circular text baseline: one path, one text node, no rotated letters.
export default function ArenaFocusTitle({label}:{label:string}){
 const id=useId();
 return <span className="arena-focus-insignia"><Crown className="arena-crown" aria-hidden="true"/><svg className="arena-focus-arc" viewBox="0 0 360 150" role="img" aria-labelledby={`${id}-title`} focusable="false"><title id={`${id}-title`}>{label}</title><defs><path id={`${id}-arc`} d="M 28 137 A 180 180 0 0 1 332 137"/></defs><text><textPath href={`#${id}-arc`} startOffset="50%" textAnchor="middle">{label}</textPath></text></svg></span>;
}
