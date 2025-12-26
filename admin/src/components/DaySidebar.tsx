import { useState, useEffect } from 'react';
import { API_BASE } from '../config';
import './DaySidebar.css';

interface Block {
  name: string;
  start: string;
  end: string;
  subBlocks?: SubBlock[];
}

interface SubBlock {
  name: string;
  start: string;
  end: string;
}

interface SpecialDayRecord {
  type?: string;
  details?: string;
  schedule?: Block[];
  banner?: string;
  color?: string;
}

interface SpecialPeriod {
  start: string;
  end: string;
  details?: string;
}

interface DaySidebarProps {
  dateKey: string;
  date: Date;
  specialDay: SpecialDayRecord | null;
  specialPeriod: SpecialPeriod | null;
  dayType: 'normal' | 'special' | 'no-school' | null;
  onClose: () => void;
  onSave: () => void;
}

// Preset 列表
const PRESETS = [
  { value: 'custom', label: 'Custom' },
  { value: 'late_start', label: 'Late Start' },
  { value: 'abdec', label: 'ABDEC' },
  { value: 'schedule_mon_thu', label: 'Monday/Thursday' },
  { value: 'schedule_wed', label: 'Wednesday' },
  { value: 'schedule_fri', label: 'Friday' },
];

// Worker API 配置
// Worker 端口固定为 8787（在 wrangler.toml 中配置）
const WORKER_PORT = import.meta.env.VITE_WORKER_PORT || '8787';
const WORKER_API_BASE = import.meta.env.DEV
  ? `http://localhost:${WORKER_PORT}/api`
  : '/api';

export default function DaySidebar({
  dateKey,
  date,
  specialDay,
  specialPeriod,
  dayType,
  onClose,
  onSave,
}: DaySidebarProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [schedule, setSchedule] = useState<Block[]>([]);
  const [details, setDetails] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presetData, setPresetData] = useState<Record<string, Block[]>>({});
  const [showJson, setShowJson] = useState(false);

  // 加载 preset 数据
  useEffect(() => {
    const loadPresets = async () => {
      const presetsToLoad = PRESETS.filter(p => p.value !== 'custom');
      const loaded: Record<string, Block[]> = {};

      for (const preset of presetsToLoad) {
        try {
          // 尝试从多个位置加载 preset
          const urls = [
            `/schedule/${preset.value}.json`,
            `https://hilltoppers.pages.dev/schedule/${preset.value}.json`,
            `../chrome-extension/public/schedule/${preset.value}.json`,
          ];

          let loadedPreset = false;
          for (const url of urls) {
            try {
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.json();
                loaded[preset.value] = data;
                loadedPreset = true;
                break;
              }
            } catch (err) {
              // 继续尝试下一个 URL
            }
          }

          if (!loadedPreset) {
            console.warn(`Failed to load preset ${preset.value} from all sources`);
          }
        } catch (err) {
          console.warn(`Failed to load preset ${preset.value}:`, err);
        }
      }

      setPresetData(loaded);
    };

    loadPresets();
  }, []);

  // 初始化数据
  useEffect(() => {
    if (specialDay) {
      setDetails(specialDay.details || '');
      if (specialDay.schedule) {
        setSchedule(specialDay.schedule);
        setSelectedPreset('custom');
      } else {
        // 尝试匹配 preset
        const matchedPreset = PRESETS.find(p => {
          if (p.value === 'custom') return false;
          const presetSchedule = presetData[p.value];
          if (!presetSchedule) return false;
          return JSON.stringify(presetSchedule) === JSON.stringify(specialDay.schedule);
        });
        if (matchedPreset) {
          setSelectedPreset(matchedPreset.value);
          setSchedule(presetData[matchedPreset.value] || []);
        } else {
          setSelectedPreset('custom');
          setSchedule([]);
        }
      }
    } else {
      setDetails('');
      setSchedule([]);
      setSelectedPreset('custom');
    }
  }, [specialDay, presetData]);

  // 处理 preset 选择
  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue);
    if (presetValue === 'custom') {
      // 保持当前 schedule
    } else {
      const presetSchedule = presetData[presetValue];
      if (presetSchedule) {
        setSchedule(JSON.parse(JSON.stringify(presetSchedule))); // 深拷贝
      }
    }
  };

  // 处理 schedule 修改（自动变成 custom）
  const handleScheduleChange = () => {
    if (selectedPreset !== 'custom') {
      setSelectedPreset('custom');
    }
  };

  // 添加 block
  const addBlock = () => {
    setSchedule([...schedule, { name: '', start: '', end: '' }]);
    handleScheduleChange();
  };

  // 删除 block
  const removeBlock = (index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
    handleScheduleChange();
  };

  // 更新 block
  const updateBlock = (index: number, field: keyof Block, value: any) => {
    const updated = [...schedule];
    updated[index] = { ...updated[index], [field]: value };
    setSchedule(updated);
    handleScheduleChange();
  };

  // 添加 subBlock
  const addSubBlock = (blockIndex: number) => {
    const updated = [...schedule];
    if (!updated[blockIndex].subBlocks) {
      updated[blockIndex].subBlocks = [];
    }
    updated[blockIndex].subBlocks!.push({ name: '', start: '', end: '' });
    setSchedule(updated);
    handleScheduleChange();
  };

  // 删除 subBlock
  const removeSubBlock = (blockIndex: number, subIndex: number) => {
    const updated = [...schedule];
    updated[blockIndex].subBlocks = updated[blockIndex].subBlocks?.filter(
      (_, i) => i !== subIndex
    );
    setSchedule(updated);
    handleScheduleChange();
  };

  // 更新 subBlock
  const updateSubBlock = (
    blockIndex: number,
    subIndex: number,
    field: keyof SubBlock,
    value: any
  ) => {
    const updated = [...schedule];
    if (!updated[blockIndex].subBlocks) {
      updated[blockIndex].subBlocks = [];
    }
    updated[blockIndex].subBlocks![subIndex] = {
      ...updated[blockIndex].subBlocks![subIndex],
      [field]: value,
    };
    setSchedule(updated);
    handleScheduleChange();
  };

  // 转换为 special day
  const handleConvertToSpecialDay = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${API_BASE}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey,
          data: {
            type: 'custom',
            details: '',
            schedule: [],
          },
        }),
      });

      if (response.ok) {
        onSave();
      }
    } catch (err) {
      console.error('Failed to convert to special day:', err);
    } finally {
      setSaving(false);
    }
  };

  // 保存
  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${API_BASE}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey,
          data: {
            type: 'custom',
            details,
            schedule,
          },
        }),
      });

      if (response.ok) {
        onSave();
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // 格式化日期字符串为可读格式
  const formatPeriodDate = (dateStr: string): string => {
    // 标准化日期格式
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      const normalized = `${year}-${month}-${day}`;
      
      // 转换为可读格式
      const date = new Date(normalized + 'T00:00:00');
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return dateStr;
  };

  return (
    <div className="day-sidebar">
      <div className="day-sidebar-header">
        <h2>{formatDate(date)}</h2>
        <button className="day-sidebar-close" onClick={onClose}>×</button>
      </div>

      <div className="day-sidebar-content">
        {/* 特殊信息（banner, color 等） */}
        {specialDay && (specialDay.banner || specialDay.color) && (
          <div className="day-sidebar-special-info">
            {specialDay.banner && (
              <div className="day-sidebar-banner">{specialDay.banner}</div>
            )}
            {specialDay.color && (
              <div
                className="day-sidebar-color"
                style={{ backgroundColor: specialDay.color }}
              />
            )}
          </div>
        )}

        {/* 日期类型信息 */}
        <div className="day-sidebar-info">
          {dayType === 'no-school' && specialPeriod && (
            <div className="day-sidebar-period">
              <h3>Special Period</h3>
              <p>{specialPeriod.details || 'No School Period'}</p>
              <p className="day-sidebar-period-dates">
                {formatPeriodDate(specialPeriod.start)} - {formatPeriodDate(specialPeriod.end)}
              </p>
              <div className="day-sidebar-info-actions">
                <button
                  className="button"
                  onClick={() => setShowJson(!showJson)}
                >
                  {showJson ? 'Hide JSON' : 'View JSON'}
                </button>
              </div>
              {showJson && (
                <div className="day-sidebar-json-view">
                  <pre>{JSON.stringify({
                    start: specialPeriod.start,
                    end: specialPeriod.end,
                    details: specialPeriod.details || undefined
                  }, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {dayType === 'special' && specialDay && (
            <div className="day-sidebar-special-day">
              <h3>Special Day</h3>
              {specialDay.details && <p>{specialDay.details}</p>}
              <div className="day-sidebar-info-actions">
                <button
                  className="button"
                  onClick={() => setShowJson(!showJson)}
                >
                  {showJson ? 'Hide JSON' : 'View JSON'}
                </button>
              </div>
              {showJson && (
                <div className="day-sidebar-json-view">
                  <pre>{JSON.stringify({
                    type: specialDay.type || 'custom',
                    details: specialDay.details || undefined,
                    schedule: specialDay.schedule || undefined,
                    banner: specialDay.banner || undefined,
                    color: specialDay.color || undefined
                  }, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {dayType === 'normal' && (
            <div className="day-sidebar-normal">
              <h3>Normal Day</h3>
              <button
                className="button primary"
                onClick={handleConvertToSpecialDay}
                disabled={saving}
              >
                Convert to Special Day
              </button>
            </div>
          )}
        </div>

        {/* Schedule Editor */}
        {(dayType === 'special' || dayType === 'normal') && (
          <div className="day-sidebar-schedule">
            <h3>Schedule</h3>

            {/* Preset 选择器 */}
            <div className="day-sidebar-preset">
              <label>Preset:</label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
              >
                {PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Details 输入 */}
            <div className="day-sidebar-details">
              <label>Details:</label>
              <input
                type="text"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g., Green Day, Early Dismissal"
              />
            </div>

            {/* Schedule Preview/Editor */}
            <div className="day-sidebar-schedule-editor">
              <div className="day-sidebar-schedule-header">
                <h4>Schedule Blocks</h4>
                <button className="button" onClick={addBlock}>
                  + Add Block
                </button>
              </div>

              {schedule.map((block, blockIndex) => (
                <div key={blockIndex} className="day-sidebar-block">
                  <div className="day-sidebar-block-header">
                    <input
                      type="text"
                      value={block.name}
                      onChange={(e) =>
                        updateBlock(blockIndex, 'name', e.target.value)
                      }
                      placeholder="Block name"
                    />
                    <input
                      type="time"
                      value={block.start}
                      onChange={(e) =>
                        updateBlock(blockIndex, 'start', e.target.value)
                      }
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={block.end}
                      onChange={(e) =>
                        updateBlock(blockIndex, 'end', e.target.value)
                      }
                    />
                    <button
                      className="button danger"
                      onClick={() => removeBlock(blockIndex)}
                    >
                      ×
                    </button>
                  </div>

                  {block.subBlocks && block.subBlocks.length > 0 && (
                    <div className="day-sidebar-subblocks">
                      {block.subBlocks.map((subBlock, subIndex) => (
                        <div key={subIndex} className="day-sidebar-subblock">
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
                            placeholder="Sub-block name"
                          />
                          <input
                            type="time"
                            value={subBlock.start}
                            onChange={(e) =>
                              updateSubBlock(
                                blockIndex,
                                subIndex,
                                'start',
                                e.target.value
                              )
                            }
                          />
                          <span>to</span>
                          <input
                            type="time"
                            value={subBlock.end}
                            onChange={(e) =>
                              updateSubBlock(
                                blockIndex,
                                subIndex,
                                'end',
                                e.target.value
                              )
                            }
                          />
                          <button
                            className="button danger"
                            onClick={() => removeSubBlock(blockIndex, subIndex)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        className="button"
                        onClick={() => addSubBlock(blockIndex)}
                      >
                        + Add Sub-block
                      </button>
                    </div>
                  )}

                  {(!block.subBlocks || block.subBlocks.length === 0) && (
                    <button
                      className="button"
                      onClick={() => addSubBlock(blockIndex)}
                    >
                      + Add Sub-blocks
                    </button>
                  )}
                </div>
              ))}

              {schedule.length === 0 && (
                <p className="day-sidebar-empty">No schedule blocks. Add one to get started.</p>
              )}
            </div>

            {/* 保存按钮 */}
            <div className="day-sidebar-actions">
              <button
                className="button primary"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

