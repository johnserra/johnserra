const fs = require('node:fs');
const path = require('node:path');

const taskDir = process.cwd();
const deploymentCommit = 'fd35295159579b8845b7ed15a0e656db43b795f1';
const apiUrl = 'https://johnserra.com/api/chat';
const scenarios = [
  { id: 'greeting', prompt: 'Hello — what can you help me learn about John Serra?', observation: 'Public greeting response observed.' },
  { id: 'cited-professional-cv', prompt: 'What are John Serra\'s professional strengths and experience? Use his published portfolio and reviewed CV evidence, and cite the source links for each material claim.', observation: 'Cited professional/CV answer requested; citation presence is checked from returned Markdown links.' },
  { id: 'ambiguous-follow-up', prompt: 'Which one of those strengths would be most relevant to an AI product role, and why?', observation: 'Follow-up is sent with the prior successful user/assistant history in the request body.' },
  { id: 'turkish-professional', prompt: 'John Serra\'nın profesyonel deneyimini ve özellikle veri/analitik projelerini Türkçe olarak, kaynak bağlantılarıyla açıklar mısın?', observation: 'Turkish professional answer requested; returned answer is retained verbatim.' },
  { id: 'unknown-factual-qualification', prompt: 'Did John Serra win the 2019 Nobel Prize in Economics? If that is not supported by the public evidence, say so clearly and explain what can actually be verified.', observation: 'Unknown-fact qualification requested; evidence is based only on the returned answer wording.' },
  { id: 'multi-tool-public-ai-product-role', prompt: 'Combine the published project evidence on this site with the reviewed CV evidence to assess whether John Serra is a strong fit for an AI product role. Use multiple public sources or tools if available, cite every claim, and clearly qualify anything that cannot be verified.', observation: 'Public multi-source/product-role answer requested; tool execution and verifier behavior are not inferred from prose.' }
];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function parseFrames(body) {
  const frames = [];
  for (const line of String(body).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { frames.push(JSON.parse(line)); }
    catch { frames.push({ type: 'unparseable', raw: line }); }
  }
  return frames;
}

function extractCitations(answer) {
  const values = [];
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(answer)) !== null) {
    const url = match[1].trim();
    if ((url.startsWith('/') && !url.startsWith('//')) || /^https?:\/\//i.test(url)) values.push(url);
  }
  return [...new Set(values)];
}

async function checkCitation(url) {
  const absolute = url.startsWith('/') ? `https://johnserra.com${url}` : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(absolute, { method: 'GET', redirect: 'follow', signal: controller.signal });
    return { url, requestedUrl: absolute, status: response.status, ok: response.ok, finalUrl: response.url };
  } catch (error) {
    return { url, requestedUrl: absolute, status: null, ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); }
}

function scenarioReason(scenario, answer, citations, terminal) {
  const lower = answer.toLocaleLowerCase('en-US');
  const notes = [scenario.observation];
  if (scenario.id === 'cited-professional-cv' || scenario.id === 'multi-tool-public-ai-product-role') notes.push(citations.length ? `Returned ${citations.length} citation URL(s).` : 'Returned no citation URLs.');
  if (scenario.id === 'turkish-professional') notes.push(/[çğıöşü]|\b(ve|için|deneyim|kaynak|veri|proje)\b/i.test(answer) ? 'Returned answer contains Turkish-language markers.' : 'Returned answer does not visibly contain expected Turkish-language markers.');
  if (scenario.id === 'unknown-factual-qualification') notes.push(/not supported|cannot verify|no evidence|not found|cannot confirm|does not show|not the/i.test(lower) ? 'Answer visibly qualifies or rejects the unsupported premise.' : 'Answer does not visibly qualify the unsupported premise.');
  if (scenario.id === 'multi-tool-public-ai-product-role') notes.push('traceAvailable=false: browser-visible response does not prove tool calls or verifier pass.');
  if (terminal?.type === 'error') notes.push(`Terminal error ${terminal.code || 'unknown'}: ${terminal.message || 'no message'}.`);
  return notes.join(' ');
}

async function main() {
  const results = [];
  let previousStart = null;
  let stopped = false;

  for (const scenario of scenarios) {
    if (stopped) {
      results.push({ id: scenario.id, prompt: scenario.prompt, status: 'blocked', reason: 'Not attempted because a prior live request returned a quota/auth/rate-limit error.', httpStatus: null, terminal: null, answer: '', citations: [], correlationId: null, elapsedMs: 0, startedAt: null, endedAt: null });
      continue;
    }
    if (previousStart !== null) {
      const gap = Date.now() - previousStart;
      if (gap < 10000) await sleep(10000 - gap);
    }
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    previousStart = startedAtMs;
    const sessionId = crypto.randomUUID();
    const prior = results.filter((result) => result.status === 'pass' && result.answer).flatMap((result) => [{ role: 'user', content: result.prompt }, { role: 'assistant', content: result.answer }]);
    const messages = [...prior, { role: 'user', content: scenario.prompt }];
    let response = null;
    let body = '';
    let requestError = null;
    try {
      response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Chat-Session': sessionId }, body: JSON.stringify({ messages, locale: 'en' }), signal: AbortSignal.timeout(55000) });
      body = await response.text();
    } catch (error) { requestError = error instanceof Error ? error.message : String(error); }

    const endedAt = new Date().toISOString();
    const elapsedMs = Date.now() - startedAtMs;
    const httpStatus = response ? response.status : null;
    const correlationId = response ? response.headers.get('x-chat-correlation-id') : null;
    const frames = response && httpStatus === 200 ? parseFrames(body) : [];
    let payload = null;
    if (response && httpStatus !== 200) { try { payload = JSON.parse(body); } catch { payload = null; } }
    const terminal = httpStatus === 200 ? (frames.length ? frames[frames.length - 1] : null) : (payload?.error ? { type: 'error', code: payload.error.code || null, message: payload.error.message || null } : null);
    const answer = frames.filter((frame) => frame.type === 'delta').map((frame) => frame.text).join('');
    const citations = extractCitations(answer);
    const quotaOrAuth = httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || terminal?.code === 'RATE_LIMITED';
    const transportPassed = httpStatus === 200 && terminal?.type === 'done' && Boolean(answer.trim());
    const genericFallback = /available public evidence is insufficient|i can only confirm what is supported.*leaving them out/i.test(answer);
    const scenarioPassed = transportPassed && !genericFallback && (
      scenario.id === 'greeting' ||
      scenario.id === 'ambiguous-follow-up' ||
      scenario.id === 'turkish-professional' && /[çğıöşü]|\b(ve|için|deneyim|kaynak|veri|proje)\b/i.test(answer) ||
      scenario.id === 'unknown-factual-qualification' && /not supported|cannot verify|no evidence|not found|cannot confirm|does not show|not the/i.test(answer.toLocaleLowerCase('en-US')) ||
      (scenario.id === 'cited-professional-cv' || scenario.id === 'multi-tool-public-ai-product-role') && citations.length > 0
    );
    let reason = scenarioReason(scenario, answer, citations, terminal);
    if (requestError) reason += ` Request error: ${requestError}.`;
    if (httpStatus !== null) reason += ` HTTP ${httpStatus}; elapsed ${elapsedMs} ms.`;
    results.push({ id: scenario.id, prompt: scenario.prompt, status: quotaOrAuth ? 'fail' : (scenarioPassed ? 'pass' : 'fail'), reason, httpStatus, terminal, answer, citations, correlationId, elapsedMs, startedAt, endedAt, requestMessageCount: messages.length, responseFrameCount: frames.length });
    if (quotaOrAuth) stopped = true;
  }

  const uniqueCitations = [...new Set(results.flatMap((result) => result.citations))].slice(0, 8);
  const citationChecks = [];
  for (const url of uniqueCitations) citationChecks.push(await checkCitation(url));
  for (const result of results) result.citationChecks = result.citations.map((url) => citationChecks.find((check) => check.url === url) || null);

  fs.writeFileSync(path.join(taskDir, 'results.json'), JSON.stringify({
    deploymentCommit,
    checkedAt: new Date().toISOString(),
    scenarios: results,
    media: { screenshotPaths: [], videoPath: null, videoDurationSeconds: null, blocker: 'Genuine separate UI media is in ../capture.' },
    traceAvailable: false,
    citationChecks
  }, null, 2) + '\n');
}

main().catch((error) => {
  fs.writeFileSync(path.join(taskDir, 'results.json'), JSON.stringify({ deploymentCommit, checkedAt: new Date().toISOString(), scenarios: [{ id: 'probe-fatal', prompt: '', status: 'fail', reason: error instanceof Error ? error.stack || error.message : String(error), httpStatus: null, terminal: null, answer: '', citations: [], correlationId: null, elapsedMs: 0 }], media: { screenshotPaths: [], videoPath: null, videoDurationSeconds: null }, traceAvailable: false }, null, 2) + '\n');
  process.exitCode = 1;
});
