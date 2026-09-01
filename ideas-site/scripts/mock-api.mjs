/**
 * Throwaway stand-in for the Worker so the UI can be run without deploying
 * anything. Start it, then run the site with
 * VITE_IDEAS_API_URL=http://localhost:8788.
 */

import { createServer } from 'http';

const IDEAS = [
  {
    number: 9,
    title: 'School calendar: late starts, days off, and special schedules',
    body: "The SJA homepage has a strip of upcoming events — late starts, days with no classes, special schedules. Right now you have to go to the website to find it, which means most people hear about a late start the night before, or not at all.\n\nThis would bring it into the extension, and eventually go further than the website does.",
    author: null,
    status: 'open',
    votes: 12,
    hasVoted: false,
    url: 'https://github.com/daniezl/Hilltoppers/issues/9',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    number: 10,
    title: 'Dark Mode',
    body: 'The extension is bright white. If you check your schedule in bed, in a dark classroom, or during a late-night homework session, it is harsh.\n\nDark mode would follow whatever your computer is already set to, with a manual override in settings.',
    author: null,
    status: 'in-progress',
    votes: 8,
    hasVoted: true,
    url: 'https://github.com/daniezl/Hilltoppers/issues/10',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    number: 11,
    title: 'Ask an AI about dress code, events, and anything else at SJA',
    body: 'Instead of digging through the handbook or scrolling back through months of emails, you would just ask: "when is the next late start?", "is a hoodie in dress code?"',
    author: null,
    status: 'open',
    votes: 5,
    hasVoted: false,
    url: 'https://github.com/daniezl/Hilltoppers/issues/11',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    number: 12,
    title: 'Homework due dates next to my schedule',
    body: 'Pull assignments from the portal so I see what is due today without opening another tab.',
    author: 'Ming L.',
    status: 'open',
    votes: 3,
    hasVoted: false,
    url: 'https://github.com/daniezl/Hilltoppers/issues/12',
    createdAt: new Date(Date.now() - 12 * 3600000).toISOString()
  },
  {
    number: 13,
    title: 'Show how many days until the next break',
    body: 'A tiny countdown somewhere in the popup. Mostly for morale.',
    author: 'Alex R.',
    status: 'shipped',
    votes: 21,
    hasVoted: false,
    url: 'https://github.com/daniezl/Hilltoppers/issues/13',
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString()
  }
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ ideas: IDEAS, signedIn: false }));
}).listen(8788, () => console.log('mock ideas API on http://localhost:8788'));
