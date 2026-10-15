// Stable fictional identity fallback, shared by presentation and persistent assignment.
export function demoAvatarIndex(identity:string):number {
  let hash=0;
  for(const character of identity.normalize("NFC"))hash=(Math.imul(hash,33)+character.codePointAt(0)!)>>>0;
  return hash%8;
}
