/** Line-level diff (LCS). Adjacent removed+added lines are paired into `modified`. */
export function diffLines(a = '', b = '') {
  const x = a.split('\n'), y = b.split('\n');
  const n = x.length, m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const raw = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { raw.push({ type: 'unchanged', text: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) raw.push({ type: 'removed', text: x[i++] });
    else raw.push({ type: 'added', text: y[j++] });
  }
  while (i < n) raw.push({ type: 'removed', text: x[i++] });
  while (j < m) raw.push({ type: 'added', text: y[j++] });

  const out = [];
  for (let k = 0; k < raw.length; k++) {
    if (raw[k].type === 'removed' && raw[k + 1]?.type === 'added') {
      out.push({ type: 'modified', before: raw[k].text, after: raw[k + 1].text }); k++;
    } else out.push(raw[k]);
  }
  const count = (t) => out.filter((l) => l.type === t).length;
  return { lines: out, summary: { added: count('added'), removed: count('removed'), modified: count('modified') } };
}
