import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import IdeaDetail from './pages/IdeaDetail';
import IdeasList from './pages/IdeasList';
import NewIdea from './pages/NewIdea';
import NotFound from './pages/NotFound';
import SignIn from './pages/SignIn';
import { fetchIdeas, setVote, type Idea } from './api';
import { useAuthUser } from './auth';

export interface IdeasContext {
  ideas: Idea[] | null;
  loading: boolean;
  error: string | null;
  onVote: (idea: Idea) => void;
  signedIn: boolean;
  reload: () => void;
}

const App: React.FC = () => {
  const { user, ready } = useAuthUser();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setIdeas(await fetchIdeas());
      setError(null);
    } catch (err) {
      console.error('[ideas] Failed to load', err);
      setError('Could not load ideas right now. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetching on auth change matters: hasVoted is per-account, so the list has
  // to be re-read once we know who is signed in.
  useEffect(() => {
    if (ready) {
      void reload();
    }
  }, [ready, user, reload]);

  useEffect(() => {
    if (!toast) {
      return () => {};
    }
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleVote = useCallback(
    async (idea: Idea) => {
      if (!user) {
        setToast('Sign in first so we can count one vote per person.');
        return;
      }

      const nextVoted = !idea.hasVoted;
      const apply = (voted: boolean, votes: number) =>
        setIdeas((prev) =>
          (prev ?? []).map((item) =>
            item.number === idea.number ? { ...item, hasVoted: voted, votes } : item
          )
        );

      // Optimistic, then reconciled with whatever the server actually stored.
      apply(nextVoted, idea.votes + (nextVoted ? 1 : -1));

      try {
        const result = await setVote(idea.number, nextVoted);
        apply(result.hasVoted, result.votes);
      } catch (err) {
        apply(idea.hasVoted, idea.votes);
        setToast(err instanceof Error ? err.message : 'Could not save your vote.');
      }
    },
    [user]
  );

  const context: IdeasContext = {
    ideas,
    loading,
    error,
    onVote: handleVote,
    signedIn: Boolean(user),
    reload: () => void reload()
  };

  return (
    <BrowserRouter>
      <div className="page">
        <Header user={user} ready={ready} />
        <Routes>
          <Route path="/" element={<IdeasList {...context} />} />
          <Route path="/idea/:number" element={<IdeaDetail {...context} />} />
          <Route path="/new" element={<NewIdea user={user} onSubmitted={context.reload} />} />
          <Route path="/sign-in" element={<SignIn signedIn={Boolean(user)} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    </BrowserRouter>
  );
};

export default App;
