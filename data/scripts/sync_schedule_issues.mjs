import { isResolved } from './lib/schedule_reviews.mjs';

const REVIEW_LABEL = 'schedule-review';
const eventMarker = id => `<!-- hilltoppers-schedule-event:${id} -->`;
const legacyDate = issue => issue.body?.match(/^<!-- hilltoppers-schedule-review:(\d{4}-\d{2}-\d{2}) -->/)?.[1];
const checklist = body => [...(body ?? '').matchAll(/^- \[([ xX])\] (\d{4}-\d{2}-\d{2})\s*$/gm)];

export async function syncScheduleIssues({ github, context, report }) {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'all', per_page: 100 });
  const tracked = issues.filter(i => !i.pull_request && /^<!-- hilltoppers-schedule-(?:review|event):/.test(i.body ?? '') && !i.body.includes('<!-- schedule-review-merged -->'));
  if (tracked.length || Object.keys(report.reviews).length) {
    try {
      await github.rest.issues.getLabel({ ...repo, name: REVIEW_LABEL });
    } catch (error) {
      if (error.status !== 404) throw error;
      await github.rest.issues.createLabel({ ...repo, name: REVIEW_LABEL, color: 'D4C5F9', description: 'School schedule events that need verification' });
    }
    for (const issue of tracked) {
      if (!(issue.labels ?? []).some(label => (typeof label === 'string' ? label : label.name) === REVIEW_LABEL)) {
        await github.rest.issues.addLabels({ ...repo, issue_number: issue.number, labels: [REVIEW_LABEL] });
      }
    }
  }
  const handled = new Set();
  for (const [id, review] of Object.entries(report.reviews)) {
    const legacy = tracked.filter(i => review.dates.includes(legacyDate(i)) && i.body.includes(`- ${review.title} (`)).sort((a, b) => a.number - b.number);
    const existing = tracked.find(i => i.body.startsWith(eventMarker(id))) ?? legacy.find(i => i.state === 'open') ?? legacy[0];
    const checked = new Set(checklist(existing?.body).filter(m => m[1].toLowerCase() === 'x').map(m => m[2]));
    for (const issue of legacy) if (issue.state === 'closed') checked.add(legacyDate(issue));
    // Keep older checklist dates and manual confirmations when the feed changes.
    const dates = [...new Set([...review.dates, ...checklist(existing?.body).map(m => m[2])])].sort();
    const done = date => checked.has(date) || isResolved(date, report.days, report.periods);
    const title = `Schedule needs confirmation: ${review.title} (${dates[0]}${dates.length > 1 ? ` – ${dates.at(-1)}` : ''})`;
    const body = `${eventMarker(id)}\n\nThis event needs review; this is not proof that the timetable is incorrect. This issue does not change the extension's timetable or countdown.\n\n${review.reasons.map(r => `- ${r}`).join('\n')}\n\n### Dates to verify\n\n${dates.map(date => `- [${done(date) ? 'x' : ' '}] ${date}`).join('\n')}\n\nSource: https://stjacademy.org/?feed=eo-events\n\nCheck each day's schedule and tick its box when confirmed. If all dates are correct, close this issue; the bot will leave it closed. Otherwise, fill in the correct schedule in data/public/special_days.json. Merged custom schedules, no-school entries, and breaks also count as resolved. The issue closes automatically when every date is resolved.`;
    let number = existing?.number;
    if (!existing) {
      const result = await github.rest.issues.create({ ...repo, title, body, labels: [REVIEW_LABEL] });
      number = result.data.number;
    } else {
      handled.add(number);
      if (existing.state === 'open' && (existing.title !== title || existing.body !== body || dates.every(done))) {
        await github.rest.issues.update({ ...repo, issue_number: number, title, body, ...(dates.every(done) ? { state: 'closed', state_reason: 'completed' } : {}) });
      }
    }
    for (const duplicate of legacy.filter(i => i.number !== number)) {
      handled.add(duplicate.number);
      await github.rest.issues.update({ ...repo, issue_number: duplicate.number,
        body: `${duplicate.body}\n\n<!-- schedule-review-merged -->\nConsolidated into #${number}; its checklist tracks this date.`,
        state: 'closed', state_reason: 'not_planned' });
    }
  }
  for (const issue of tracked) {
    if (handled.has(issue.number) || issue.state !== 'open') continue;
    const rows = checklist(issue.body);
    const dates = rows.length ? rows.map(m => m[2]) : [legacyDate(issue)].filter(Boolean);
    const checked = new Set(rows.filter(m => m[1].toLowerCase() === 'x').map(m => m[2]));
    // A missing event or elapsed date alone is not evidence of a fix.
    if (dates.length && dates.every(date => checked.has(date) || isResolved(date, report.days, report.periods))) {
      await github.rest.issues.update({ ...repo, issue_number: issue.number, state: 'closed', state_reason: 'completed' });
    }
  }
}
