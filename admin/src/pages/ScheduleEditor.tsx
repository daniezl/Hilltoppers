import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import './ScheduleEditor.css';

interface SubBlock {
  name: string;
  start: string;
  end: string;
}

interface Block {
  name: string;
  start: string;
  end: string;
  subBlocks?: SubBlock[];
}

interface ScheduleData {
  type: string;
  details?: string;
  schedule: Block[];
}

export default function ScheduleEditor() {
  const { dateKey: paramDateKey } = useParams<{ dateKey?: string }>();
  const navigate = useNavigate();
  
  const [dateKey, setDateKey] = useState(paramDateKey || '');
  const [type, setType] = useState('custom');
  const [details, setDetails] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (paramDateKey) {
      loadDraft(paramDateKey);
    }
  }, [paramDateKey]);

  const loadDraft = async (key: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/drafts`);
      
      if (!response.ok) return;
      
      const data = await response.json();
      const draft = data.drafts?.[key];
      
      if (draft) {
        setDateKey(key);
        setType(draft.data?.type || 'custom');
        setDetails(draft.data?.details || '');
        setBlocks(draft.data?.schedule || []);
      }
    } catch (err) {
      setError('Failed to load draft');
    } finally {
      setLoading(false);
    }
  };

  const addBlock = () => {
    setBlocks([...blocks, { name: '', start: '', end: '' }]);
  };

  const removeBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const updateBlock = (index: number, field: keyof Block, value: any) => {
    const updated = [...blocks];
    updated[index] = { ...updated[index], [field]: value };
    setBlocks(updated);
  };

  const addSubBlock = (blockIndex: number) => {
    const updated = [...blocks];
    if (!updated[blockIndex].subBlocks) {
      updated[blockIndex].subBlocks = [];
    }
    updated[blockIndex].subBlocks!.push({ name: '', start: '', end: '' });
    setBlocks(updated);
  };

  const removeSubBlock = (blockIndex: number, subIndex: number) => {
    const updated = [...blocks];
    updated[blockIndex].subBlocks = updated[blockIndex].subBlocks?.filter(
      (_, i) => i !== subIndex
    );
    setBlocks(updated);
  };

  const updateSubBlock = (
    blockIndex: number,
    subIndex: number,
    field: keyof SubBlock,
    value: string
  ) => {
    const updated = [...blocks];
    if (!updated[blockIndex].subBlocks) {
      updated[blockIndex].subBlocks = [];
    }
    updated[blockIndex].subBlocks![subIndex] = {
      ...updated[blockIndex].subBlocks![subIndex],
      [field]: value,
    };
    setBlocks(updated);
  };

  const handleSave = async () => {
    if (!dateKey) {
      setError('Date is required');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      setError('Invalid date format. Use YYYY-MM-DD');
      return;
    }

    if (blocks.length === 0) {
      setError('At least one block is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const scheduleData: ScheduleData = {
        type,
        details: details.trim() || undefined,
        schedule: blocks,
      };

      const response = await fetch(`${API_BASE}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey,
          data: scheduleData,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to save');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="schedule-editor">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="schedule-editor">
      <div className="schedule-editor-header">
        <h1>{paramDateKey ? 'Edit Schedule' : 'New Schedule'}</h1>
        <div className="schedule-editor-actions">
          <button onClick={() => navigate('/')} className="button">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="button primary"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {success && (
        <div className="status success">
          Draft saved successfully. Redirecting...
        </div>
      )}

      <div className="schedule-editor-form">
        <div className="form-section">
          <label>
            Date (YYYY-MM-DD)
            <input
              type="text"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              placeholder="2025-11-21"
              disabled={!!paramDateKey}
            />
          </label>
        </div>

        <div className="form-section">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="custom">Custom</option>
              <option value="no_school">No School</option>
            </select>
          </label>
        </div>

        {type === 'custom' && (
          <>
            <div className="form-section">
              <label>
                Details (optional)
                <input
                  type="text"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="e.g., Green Day, Early Dismissal"
                />
              </label>
            </div>

            <div className="form-section">
              <div className="form-section-header">
                <h3>Schedule Blocks</h3>
                <button onClick={addBlock} className="button">
                  Add Block
                </button>
              </div>

              {blocks.map((block, blockIndex) => (
                <div key={blockIndex} className="block-editor">
                  <div className="block-editor-header">
                    <h4>Block {blockIndex + 1}</h4>
                    <button
                      onClick={() => removeBlock(blockIndex)}
                      className="button danger"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="block-editor-fields">
                    <label>
                      Name
                      <input
                        type="text"
                        value={block.name}
                        onChange={(e) =>
                          updateBlock(blockIndex, 'name', e.target.value)
                        }
                        placeholder="e.g., A Block"
                      />
                    </label>
                    <label>
                      Start Time (HH:mm)
                      <input
                        type="text"
                        value={block.start}
                        onChange={(e) =>
                          updateBlock(blockIndex, 'start', e.target.value)
                        }
                        placeholder="08:00"
                      />
                    </label>
                    <label>
                      End Time (HH:mm)
                      <input
                        type="text"
                        value={block.end}
                        onChange={(e) =>
                          updateBlock(blockIndex, 'end', e.target.value)
                        }
                        placeholder="09:30"
                      />
                    </label>
                  </div>

                  <div className="subblocks-section">
                    <div className="subblocks-header">
                      <h5>Sub-blocks (optional, e.g., lunch periods)</h5>
                      <button
                        onClick={() => addSubBlock(blockIndex)}
                        className="button"
                      >
                        Add Sub-block
                      </button>
                    </div>

                    {block.subBlocks?.map((subBlock, subIndex) => (
                      <div key={subIndex} className="subblock-editor">
                        <label>
                          Name
                          <input
                            type="text"
                            value={subBlock.name}
                            onChange={(e) =>
                              updateSubBlock(
                                blockIndex,
                                subIndex,
                                'name',
                                e.target.value
                              )
                            }
                            placeholder="e.g., 1st Lunch"
                          />
                        </label>
                        <label>
                          Start (HH:mm)
                          <input
                            type="text"
                            value={subBlock.start}
                            onChange={(e) =>
                              updateSubBlock(
                                blockIndex,
                                subIndex,
                                'start',
                                e.target.value
                              )
                            }
                            placeholder="10:45"
                          />
                        </label>
                        <label>
                          End (HH:mm)
                          <input
                            type="text"
                            value={subBlock.end}
                            onChange={(e) =>
                              updateSubBlock(
                                blockIndex,
                                subIndex,
                                'end',
                                e.target.value
                              )
                            }
                            placeholder="11:05"
                          />
                        </label>
                        <button
                          onClick={() => removeSubBlock(blockIndex, subIndex)}
                          className="button danger"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

