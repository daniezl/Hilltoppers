import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config';
import './Dashboard.css';

interface Draft {
  dateKey: string;
  data: any;
  updatedBy: string;
  updatedAt: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchDrafts = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/drafts`);
        
        if (!response.ok) {
          setError('Failed to load drafts');
          return;
        }
        
        const data = await response.json();
        setDrafts(data.drafts || {});
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchDrafts();
  }, [user]);

  const draftEntries = Object.entries(drafts).sort(([a], [b]) => b.localeCompare(a));

  const handleDiscardDraft = async (dateKey: string) => {
    if (!confirm(`Are you sure you want to discard the draft for ${dateKey}? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/drafts/${dateKey}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from local state
        const updatedDrafts = { ...drafts };
        delete updatedDrafts[dateKey];
        setDrafts(updatedDrafts);
      } else {
        const data = await response.json();
        alert(`Failed to discard draft: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Network error while discarding draft');
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted">Manage schedule drafts and published schedules</p>
        </div>
        {user && (
          <Link to="/editor" className="button primary">
            New Schedule
          </Link>
        )}
      </div>

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="dashboard-loading">
          <p>Loading drafts...</p>
        </div>
      ) : (
        <>
          {draftEntries.length === 0 ? (
            <div className="dashboard-empty">
              <p>No drafts found.</p>
              <Link to="/editor" className="button primary">
                Create your first schedule
              </Link>
            </div>
          ) : (
            <div className="dashboard-table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Details</th>
                    <th>Updated By</th>
                    <th>Updated At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {draftEntries.map(([dateKey, draft]) => (
                    <tr key={dateKey}>
                      <td>
                        <strong>{dateKey}</strong>
                      </td>
                      <td>{draft.data?.type || 'custom'}</td>
                      <td>{draft.data?.details || '-'}</td>
                      <td className="text-muted">{draft.updatedBy}</td>
                      <td className="text-muted">
                        {new Date(draft.updatedAt).toLocaleString()}
                      </td>
                      <td>
                        <div className="dashboard-actions">
                          <Link
                            to={`/editor/${dateKey}`}
                            className="button"
                          >
                            Edit
                          </Link>
                          {user?.role === 'admin' && (
                            <button
                              className="button"
                              onClick={async () => {
                                if (!confirm(`Publish schedule for ${dateKey}?`)) return;
                                
                                try {
                                  const response = await fetch(`${API_BASE}/publish`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ dateKey }),
                                  });
                                  
                                  if (response.ok) {
                                    alert('Published successfully');
                                    window.location.reload();
                                  } else {
                                    const data = await response.json();
                                    alert(`Failed: ${data.error}`);
                                  }
                                } catch (err) {
                                  alert('Network error');
                                }
                              }}
                            >
                              Publish
                            </button>
                          )}
                          <button
                            className="button danger"
                            onClick={() => handleDiscardDraft(dateKey)}
                            title="Discard draft"
                          >
                            Discard
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

