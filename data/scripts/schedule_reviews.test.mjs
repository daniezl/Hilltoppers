import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleReviews } from './lib/schedule_reviews.mjs';
import { syncScheduleIssues } from './sync_schedule_issues.mjs';

test('reviews cover weekdays, deduplicate reasons, and exclude dates with resolved data', () => {
  const needsHuman = ['19', '20', '21', '22', '23', '24', '25'].map(day => ({
    date: `2026-10-${day}`, title: 'Spirit Week', reason: 'unclassified'
  }));
  needsHuman.push(needsHuman[0]);
  const input = { today: '2026-10-05', needsHuman, days: {}, periods: [] };
  const pending = buildScheduleReviews(input);
  assert.equal(Object.keys(pending).length, 5);
  assert.equal(pending['2026-10-19'].reasons.length, 1);
  input.days = {
    '2026-10-20': { schedule: [{ name: 'Correct custom block' }] },
    '2026-10-21': { type: 'no_school' }
  };
  input.periods = [{ start: '2026-10-22', end: '2026-10-23' }];
  assert.deepEqual(Object.keys(buildScheduleReviews(input)), ['2026-10-19']);
});

test('daily runs deduplicate, update open issues, respect manual closure, and close committed resolutions', async () => {
  const issues = [];
  let writes = 0;
  let labelExists = false;
  let labelCreations = 0;
  let labelAdditions = 0;
  const github = {
    paginate: async () => issues.map(i => ({ ...i })),
    rest: { issues: {
      listForRepo: {},
      getLabel: async () => { if (!labelExists) throw Object.assign(new Error('Not found'), { status: 404 }); },
      createLabel: async args => { assert.equal(args.name, 'schedule-review'); labelExists = true; labelCreations++; },
      addLabels: async args => { labelAdditions++; issues.find(i => i.number === args.issue_number).labels.push(...args.labels); },
      create: async args => { writes++; issues.push({ ...args, number: issues.length + 1, state: 'open' }); },
      update: async args => { writes++; Object.assign(issues.find(i => i.number === args.issue_number), args); }
    } }
  };
  const report = { today: '2026-10-05', reviews: { '2026-10-19': { reasons: ['Spirit Week'] } }, days: {}, periods: [] };
  const sync = () => syncScheduleIssues({ github, context: { repo: { owner: 'example', repo: 'school' } }, report });
  await sync();
  await sync();
  assert.equal(writes, 1);
  assert.equal(labelCreations, 1);
  assert.deepEqual(issues[0].labels, ['schedule-review']);
  assert.equal(labelAdditions, 0);
  report.reviews['2026-10-19'].reasons.push('Updated event information');
  await sync();
  assert.match(issues[0].body, /Updated event information/);
  issues[0].state = 'closed';
  issues[0].labels = [{ name: 'bug' }];
  await sync();
  assert.equal(issues[0].state, 'closed');
  assert.deepEqual(issues[0].labels, [{ name: 'bug' }, 'schedule-review']);
  assert.equal(labelAdditions, 1);
  assert.equal(issues.length, 1);
  issues[0].state = 'open';
  report.reviews = {};
  await sync();
  assert.equal(issues[0].state, 'open');
  report.days['2026-10-19'] = { schedule: [{ name: 'Correct custom block' }] };
  await sync();
  assert.equal(issues[0].state, 'closed');
  assert.equal(issues.length, 1);
});
