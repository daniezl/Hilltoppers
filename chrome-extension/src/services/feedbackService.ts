import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getDb } from '../firebase/app';
import { isFirebaseConfigured } from '../firebase/config';
import { waitForAuthReady } from '../firebase/auth';

/**
 * Who answers feedback. Flip to 'us' the day someone else is reading these too.
 * Every place the popup or the feedback page says "me" derives from this.
 */
export const FEEDBACK_AUDIENCE: 'me' | 'us' = 'me';

export const FEEDBACK_HEADING = 'What would make this better?';

export const FEEDBACK_PROMPT = `${FEEDBACK_HEADING} Tell ${FEEDBACK_AUDIENCE} \u2192`;

export const FEEDBACK_MAX_LENGTH = 2000;

/**
 * Submissions land in the `feedback` collection, readable only from the
 * Firebase console. The matching Security Rule (create-only, size-capped) is
 * in SETUP.md; without it every submission is rejected with permission-denied.
 */
const COLLECTION = 'feedback';

export class FeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackError';
  }
}

export interface FeedbackSubmission {
  message: string;
  /** Free text: a name, an email, whatever the sender wants to be reached by. */
  contact?: string;
}

export async function submitFeedback({ message, contact }: FeedbackSubmission): Promise<void> {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    throw new FeedbackError('Write something first.');
  }
  if (trimmed.length > FEEDBACK_MAX_LENGTH) {
    throw new FeedbackError(`Keep it under ${FEEDBACK_MAX_LENGTH} characters.`);
  }
  if (!isFirebaseConfigured()) {
    throw new FeedbackError('This build cannot send feedback.');
  }

  // Session restore is async; without waiting, a freshly opened page always sees null.
  const user = await waitForAuthReady();
  const version =
    typeof chrome !== 'undefined' && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : null;

  try {
    await addDoc(collection(getDb(), COLLECTION), {
      message: trimmed,
      contact: contact?.trim() || null,
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      extensionVersion: version,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('[feedback] Failed to submit', error);
    throw new FeedbackError('Could not send. Check your connection and try again.');
  }
}
