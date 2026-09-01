import React from 'react';

/**
 * Renders an issue body as plain text plus images.
 *
 * The board mixes text written by maintainers with text submitted by students,
 * and this runs on a page where a script injection would be a real problem. So
 * nothing here ever builds HTML from the body: text goes through React (which
 * escapes it), and only `![alt](url)` pointing at a known image host becomes an
 * actual <img>. Anything else stays visible as literal text.
 *
 * A side benefit is that arbitrary remote images cannot be used to track who
 * opened the page.
 */

const ALLOWED_IMAGE_HOSTS = new Set([
  'github.com', // github.com/user-attachments/assets/<uuid>
  'user-images.githubusercontent.com',
  'raw.githubusercontent.com'
]);

const IMAGE_PATTERN = /!\[([^\]]*)\]\((\S+?)\)/g;

function isAllowedImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

type Segment = { kind: 'text'; value: string } | { kind: 'image'; alt: string; url: string };

function parse(body: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(IMAGE_PATTERN)) {
    const [raw, alt, url] = match;
    const start = match.index ?? 0;

    if (start > lastIndex) {
      segments.push({ kind: 'text', value: body.slice(lastIndex, start) });
    }

    if (isAllowedImage(url)) {
      segments.push({ kind: 'image', alt, url });
    } else {
      // Not a host we trust, so show the markdown as written instead.
      segments.push({ kind: 'text', value: raw });
    }

    lastIndex = start + raw.length;
  }

  if (lastIndex < body.length) {
    segments.push({ kind: 'text', value: body.slice(lastIndex) });
  }

  return segments;
}

const IdeaBody: React.FC<{ body: string }> = ({ body }) => {
  const segments = parse(body);

  return (
    <div className="idea-body">
      {segments.map((segment, index) =>
        segment.kind === 'image' ? (
          <img
            key={index}
            className="idea-body-image"
            src={segment.url}
            alt={segment.alt || 'Screenshot'}
            loading="lazy"
          />
        ) : segment.value.trim() ? (
          <p key={index} className="idea-body-text">
            {segment.value.trim()}
          </p>
        ) : null
      )}
    </div>
  );
};

export default IdeaBody;
