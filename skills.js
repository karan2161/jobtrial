// Canonical skill dictionary with aliases. Used by the resume parser and the deterministic ATS matcher.
const RAW = {
  javascript: ['js', 'ecmascript'], typescript: ['ts'], python: [], java: [], 'c++': ['cpp'], 'c#': ['csharp'], go: ['golang'],
  rust: [], php: [], ruby: [], swift: [], kotlin: [], sql: [], html: ['html5'], css: ['css3'], sass: ['scss'],
  react: ['react.js', 'reactjs'], 'next.js': ['nextjs', 'next'], vue: ['vue.js', 'vuejs'], angular: ['angularjs'], svelte: [],
  'tailwind css': ['tailwind', 'tailwindcss'], redux: [], 'node.js': ['node', 'nodejs'], express: ['express.js', 'expressjs'],
  django: [], flask: [], fastapi: [], spring: ['spring boot', 'springboot'], '.net': ['dotnet', 'asp.net'],
  'rest apis': ['rest', 'restful', 'rest api', 'restful apis'], graphql: [], grpc: [], websockets: ['websocket'],
  postgresql: ['postgres', 'psql'], mysql: [], mongodb: ['mongo'], redis: [], supabase: [], firebase: [], sqlite: [],
  docker: [], kubernetes: ['k8s'], aws: ['amazon web services'], azure: [], gcp: ['google cloud'],
  'ci/cd': ['cicd', 'ci cd', 'continuous integration', 'continuous delivery'], 'github actions': [], jenkins: [], terraform: [],
  git: [], github: [], linux: [], bash: ['shell scripting'], jest: [], vitest: [], cypress: [], playwright: [], selenium: [],
  'unit testing': ['unit tests', 'testing'], 'machine learning': ['ml'], 'deep learning': [], nlp: ['natural language processing'],
  pandas: [], numpy: [], tensorflow: [], pytorch: [], 'data structures': ['dsa', 'algorithms'], 'system design': [],
  agile: ['scrum'], jira: [], figma: [], recharts: [], 'framer motion': [], webpack: [], vite: [], npm: [], postman: [],
  'openai api': ['openai'], 'claude api': ['anthropic api'], oauth: ['oauth2'], jwt: [], microservices: [],
  'responsive design': ['responsive'], accessibility: ['a11y', 'wcag'], seo: [], excel: [], 'power bi': ['powerbi'], tableau: [],
};
export const SKILLS = Object.entries(RAW).map(([name, aliases]) => ({ name, terms: [name, ...aliases] }));

export const normalize = (t = '') =>
  t.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const cache = new Map();
export function termRegex(term) {
  if (!cache.has(term)) cache.set(term, new RegExp(`(?<![a-z0-9+#])${esc(term)}(?![a-z0-9+#])`, 'i'));
  return cache.get(term);
}
export const containsTerm = (normText, term) => termRegex(normalize(term)).test(normText);

const byName = new Map(SKILLS.map((s) => [s.name, s]));
const byTerm = new Map(SKILLS.flatMap((s) => s.terms.map((t) => [t, s])));
/** Map any alias to its canonical dictionary entry; unknown skills are kept as-is (lower-cased). */
export const canonicalSkill = (raw) => {
  const n = normalize(raw);
  const hit = byTerm.get(n);
  return hit ? { name: hit.name, terms: hit.terms } : { name: n, terms: [n] };
};
export const skillPresent = (normText, raw) => canonicalSkill(raw).terms.some((t) => containsTerm(normText, t));
export const findSkills = (normText) => SKILLS.filter((s) => s.terms.some((t) => containsTerm(normText, t))).map((s) => s.name);
export { byName };
