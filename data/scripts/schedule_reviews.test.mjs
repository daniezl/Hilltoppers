import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleReviews } from './lib/schedule_reviews.mjs';
import { syncScheduleIssues } from './sync_schedule_issues.mjs';

const needsHuman = ['19', '20', '21', '22', '23', '24', '25'].map(day => ({
  date: `2026-10-${day}`, title: 'Spirit Week', eventId: 'spirit', eventStart: '2026-10-19', reason: 'unclassified'
}));
function makeReport(days = {}, today = '2026-10-05') {
  const input = { today, needsHuman, days, periods: [] };
  return { ...input, reviews: buildScheduleReviews(input) };
}
function harness(issues = []) {
  let writes = 0;
  let labelExists = false;
  let labelCreations = 0;
  const github = {
    paginate: async () => structuredClone(issues),
    rest: { issues: {
      listForRepo: {},
      getLabel: async () => { if (!labelExists) throw Object.assign(new Error('Not found'), { status: 404 }); },
      createLabel: async args => { assert.equal(args.name, 'schedule-review'); labelExists = true; labelCreations++; },
      addLabels: async args => { issues.find(i => i.number === args.issue_number).labels.push(...args.labels); },
      create: async args => { writes++; const issue = { ...args, number: issues.length + 1, state: 'open' }; issues.push(issue); return { data: issue }; },
      update: async args => { writes++; Object.assign(issues.find(i => i.number === args.issue_number), args); }
    } }
  };
  return { issues, get writes() { return writes; }, get labelCreations() { return labelCreations; },
    sync: report => syncScheduleIssues({ github, context: { repo: { owner: 'example', repo: 'school' } }, report }) };
}

test('group by event occurrence, preserve full weekday checklist as dates pass, and separate other events', () => {
  const initial = makeReport();
  const [id] = Object.keys(initial.reviews);
  assert.equal(Object.keys(initial.reviews).length, 1);
  assert.equal(initial.reviews[id].dates.length, 5);
  const later = makeReport({ '2026-10-19': { type: 'no_school' } }, '2026-10-21');
  assert.deepEqual(later.reviews[id].dates, initial.reviews[id].dates);
  const groups = buildScheduleReviews({ ...initial, needsHuman: [...needsHuman, { ...needsHuman[0], eventId: 'other', title: 'Other event' }] });
  assert.equal(Object.keys(groups).length, 2);
  const resolved = Object.fromEntries(initial.reviews[id].dates.map(date => [date, { schedule: [{ name: 'Correct schedule' }] }]));
  assert.deepEqual(makeReport(resolved).reviews, {});
});

test('reuse oldest legacy issue, close duplicates, preserve labels and manual checks, and stay idempotent', async () => {
  const issues = needsHuman.slice(0, 5).map((item, i) => ({
    number: 77 + i, title: `Schedule needs confirmation: ${item.date}`, state: 'open', labels: [{ name: 'bug' }],
    body: `<!-- hilltoppers-schedule-review:${item.date} -->\n\n- Spirit Week (unclassified)`
  }));
  const h = harness(issues);
  const report = makeReport();
  await h.sync(report);
  assert.equal(h.issues.length, 5);
  assert.equal(h.issues[0].state, 'open');
  assert.equal(h.issues[0].title, 'Spirit Week (2026-10-19 – 2026-10-23)');
  assert.equal((h.issues[0].body.match(/- \[ \]/g) ?? []).length, 5);
  assert.deepEqual(h.issues[0].labels, [{ name: 'bug' }, 'schedule-review']);
  for (const duplicate of h.issues.slice(1)) {
    assert.equal(duplicate.state, 'closed');
    assert.match(duplicate.body, /Consolidated into #77/);
  }
  const writes = h.writes;
  await h.sync(report);
  assert.equal(h.writes, writes);
  h.issues[0].body = h.issues[0].body.replace('- [ ] 2026-10-19', '- [x] 2026-10-19');
  await h.sync(report);
  assert.match(h.issues[0].body, /- \[x\] 2026-10-19/);
  h.issues[0].state = 'closed';
  await h.sync(report);
  assert.equal(h.issues[0].state, 'closed');
  assert.equal(h.labelCreations, 1);
});

test('new event gets one labeled issue, partial fixes keep it open, and only all dates resolve it', async () => {
  const h = harness();
  await h.sync(makeReport());
  assert.deepEqual(h.issues[0].labels, ['schedule-review']);
  await h.sync(makeReport());
  assert.equal(h.writes, 1);
  const days = { '2026-10-19': { type: 'no_school' } };
  await h.sync(makeReport(days));
  assert.equal(h.issues[0].state, 'open');
  assert.match(h.issues[0].body, /- \[x\] 2026-10-19/);
  await h.sync({ reviews: {}, days: {}, periods: [] });
  assert.equal(h.issues[0].state, 'open');
  for (const item of needsHuman) days[item.date] = { type: 'no_school' };
  await h.sync(makeReport(days));
  assert.equal(h.issues[0].state, 'closed');
});
