import type { CSSProperties } from "react";

/** Decorative brush surface; the sale amount remains selectable live text. */
export default function PreemResultRibbon({ value }: { value: string }) {
  const characters = value.replace(/\s/g, "").length;
  const scale = characters >= 10 ? 0.76 : characters >= 9 ? 0.88 : 1;
  return (
    <div className="v2-result-ribbon" style={{ "--ribbon-scale": scale } as CSSProperties}>
      <svg viewBox="0 0 1000 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="v2-ribbon-shadow" d="M86 61 Q142 37 242 48 Q316 57 405 45 Q492 34 565 49 Q644 60 727 47 Q819 36 890 51 Q943 50 958 87 Q969 109 954 127 Q979 150 959 174 Q972 195 948 219 Q953 249 905 260 Q839 270 748 258 Q673 249 598 266 Q516 277 432 262 Q349 252 257 270 Q180 281 105 260 Q64 258 66 230 Q40 214 58 189 Q38 167 56 143 Q42 119 67 100 Q61 77 86 61Z"/>
        <path className="v2-ribbon-main" d="M77 49 Q139 27 237 40 Q316 52 399 37 Q482 25 559 41 Q644 54 724 37 Q814 24 882 42 Q928 39 945 70 Q955 90 944 109 Q970 131 950 154 Q963 177 940 200 Q948 225 901 244 Q839 255 747 243 Q674 234 597 252 Q517 263 430 248 Q347 238 254 256 Q179 268 102 247 Q60 244 62 218 Q37 203 55 177 Q35 155 52 130 Q39 107 63 89 Q58 67 77 49Z"/>
        <path className="v2-ribbon-light" d="M92 67 Q180 45 278 62 Q369 73 459 57 Q552 43 636 60 Q741 76 835 58 Q885 48 921 61 Q899 80 831 79 Q721 82 630 80 Q534 74 451 82 Q347 93 260 82 Q167 73 98 86Z"/>
      </svg>
      <span className="v2-amount" aria-live="polite">{value}</span>
    </div>
  );
}
