import {it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import ArenaFocusTitle from '../src/ArenaFocusTitle';
it('Arena Swedish source strings use försäljning, never the standalone misspelling',()=>{for(const dir of ['src','shared','worker'])for(const name of readdirSync(new URL(`../${dir}/`,import.meta.url)).filter(n=>/arena/i.test(n)&&/\.(tsx?|css)$/.test(n))){const source=readFileSync(new URL(`../${dir}/${name}`,import.meta.url),'utf8');expect(source,`${dir}/${name}`).not.toMatch(/(?<!för)säljning/iu);}});
it('monthly focus uses an accessible symmetric circular SVG text path',()=>{const html=renderToStaticMarkup(createElement(ArenaFocusTitle,{label:'MÅNADENS FOKUS'}));expect(html).toContain('<textPath');expect(html).toContain('A 180 180');expect(html).toContain('startOffset="50%"');expect(html).toContain('text-anchor="middle"');expect(html).toContain('<title');expect(html).toContain('aria-labelledby');expect(html).not.toContain('rotate(');});
