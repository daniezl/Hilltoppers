import { isResolved } from './lib/schedule_reviews.mjs';

const REVIEW_LABEL = 'schedule-review';

export async function syncScheduleIssues({ github, context, report }) {
  const repo = { owner: context.repo.owner, repo: context.repo.repo };
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'all', per_page: 100 });
  const marker = date => `<!-- hilltoppers-schedule-review:${date} -->`;
  const tracked = issues.filter(i => !i.pull_request && /^<!-- hilltoppers-schedule-review:\d{4}-\d{2}-\d{2} -->/.test(i.body ?? ''));
  if (tracked.length || Object.keys(report.reviews).length) {
    try {
      await github.rest.issues.getLabel({ ...repo, name: REVIEW_LABEL });
    } catch (error) {
      if (error.status !== 404) throw error;
      await github.rest.issues.createLabel({
        ...repo, name: REVIEW_LABEL, color: 'D4C5F9',
        description: 'School schedule dates that need verification'
      });
    }
    // Backfill older issues, including closed ones, without replacing other labels.
    for (const issue of tracked) {
      if (!(issue.labels ?? []).some(label => (typeof label === 'string' ? label : label.name) === REVIEW_LABEL)) {
        await github.rest.issues.addLabels({ ...repo, issue_number: issue.number, labels: [REVIEW_LABEL] });
      }
    }
  }
  for (const [date, review] of Object.entries(report.reviews)) {
    const title = `Schedule needs confirmation: ${date}`;
    const body = `${marker(date)}\n\nThis date needs review; this is not proof that the timetable is incorrect. This issue does not change the extension's timetable or countdown.\n\n${review.reasons.map(r => `- ${r}`).join('\n')}\n\nSource: https://stjacademy.org/?feed=eo-events\n\nCheck the school's schedule for this date. If the existing timetable is correct, close this issue; the bot will leave it closed. Otherwise, fill in the correct schedule in data/public/special_days.json. A merged custom schedule or no-school entry (including a break in special_periods.json) resolves this issue automatically.`;
    const existing = tracked.find(i => i.body.startsWith(marker(date)));
    if (!existing) {
      await github.rest.issues.create({ ...repo, title, body, labels: [REVIEW_LABEL] });
    } else if (existing.state === 'open' && (existing.title !== title || existing.body !== body)) {
      await github.rest.issues.update({ ...repo, issue_number: existing.number, title, body, state: 'open' });
    }
  }
  for (const issue of tracked) {
    const date = issue.body.match(/review:(\d{4}-\d{2}-\d{2})/)[1];
    // Disappearing feed entries and elapsed dates are not evidence of a fix.
    if (issue.state === 'open' && !report.reviews[date] && isResolved(date, report.days, report.periods)) {
      await github.rest.issues.update({ ...repo, issue_number: issue.number, state: 'closed', state_reason: 'completed' });
    }
  }
}
