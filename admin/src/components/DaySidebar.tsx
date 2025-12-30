import { useState, useEffect, useRef } from 'react';
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

interface DraftRecord {
  data: SpecialDayRecord;
  updatedAt?: string;
  updatedBy?: string;
}

interface DaySidebarProps {
  dateKey: string;
  date: Date;
  specialDay: SpecialDayRecord | null;
  specialPeriod: SpecialPeriod | null;
  dayType: 'normal' | 'special' | 'no-school' | null;
  draft: DraftRecord | null;
  onClose: () => void;
  onSave: () => void;
  onRefreshDrafts?: () => void; // 可选：只刷新 drafts，不刷新其他数据
}

// Preset 列表（不包含普通的周一到周五课表）
const PRESETS = [
  { value: 'normal', label: 'Normal' },
  { value: 'custom', label: 'Custom' },
  { value: 'late_start', label: 'Late Start' },
  { value: 'abdec', label: 'ABDEC' },
];

// Worker API 配置
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
  draft,
  onClose,
  onSave,
  onRefreshDrafts,
}: DaySidebarProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [schedule, setSchedule] = useState<Block[]>([]);
  const [details, setDetails] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [banner, setBanner] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presetData, setPresetData] = useState<Record<string, Block[]>>({});
  const [showJson, setShowJson] = useState(false);
  const [editingTag, setEditingTag] = useState<'details' | 'color' | 'banner' | null>(null);
  const [editingBlock, setEditingBlock] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'name' | 'start' | 'end' | null>(null);
  
  // 初始状态（用于检测变化）
  const [initialState, setInitialState] = useState<{
    details: string;
    color: string;
    banner: string;
    schedule: Block[];
    preset: string;
  } | null>(null);

  // 加载 preset 数据
  useEffect(() => {
    const loadPresets = async () => {
      // 只加载非 custom 和非 normal 的 preset
      const presetsToLoad = PRESETS.filter(p => p.value !== 'custom' && p.value !== 'normal');
      const loaded: Record<string, Block[]> = {};

      for (const preset of presetsToLoad) {
        try {
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

  // 初始化数据（优先从 draft 加载，如果没有 draft 则从 specialDay 加载）
  useEffect(() => {
    // 如果 presetData 还没加载完，等待
    if (Object.keys(presetData).length === 0 && PRESETS.filter(p => p.value !== 'custom' && p.value !== 'normal').length > 0) {
      return;
    }
    
    // 优先使用 draft 数据
    // 如果 draft 的 type 是 'normal'，表示用户选择了 normal，即使有 specialDay 也不使用
    // 如果没有 draft 或 draft.type 不是 'normal'，才使用 specialDay（已发布的）
    const dataSource = draft?.data?.type === 'normal' 
      ? null  // type 是 'normal' 时，不使用任何数据（显示 normal）
      : (draft?.data || specialDay);
    
    // 如果当前状态已经是正确的，不需要重新初始化
    // 情况1：如果 draft?.data?.type === 'normal'，且 selectedPreset 已经是 'normal'，且 initialState 已经设置
    if (draft?.data?.type === 'normal' && selectedPreset === 'normal' && initialState && initialState.preset === 'normal') {
      // 状态已经正确，不需要重新初始化
      return;
    }
    
    // 情况2：selectedPreset 是 'normal'，且 dataSource 是 null（没有数据源），且 initialState 已经设置
    if (selectedPreset === 'normal' && !dataSource && initialState && initialState.preset === 'normal') {
      // 状态已经正确，不需要重新初始化
      return;
    }
    
    // 情况3：selectedPreset 已经匹配 dataSource 的 type，且 initialState 已经设置
    if (initialState && dataSource) {
      const expectedPreset = dataSource.type && dataSource.type !== 'custom' && dataSource.type !== 'normal' && presetData[dataSource.type]
        ? dataSource.type
        : (dataSource.schedule && dataSource.schedule.length > 0 ? 'custom' : 'custom');
      
      if (selectedPreset === expectedPreset && 
          initialState.preset === expectedPreset &&
          details === (dataSource.details || '') &&
          color === (dataSource.color || '') &&
          banner === (dataSource.banner || '')) {
        // 状态已经匹配，不需要重新初始化
        return;
      }
    }
    
    if (dataSource) {
      const newDetails = dataSource.details || '';
      const newColor = dataSource.color || '';
      const newBanner = dataSource.banner || '';
      let newSchedule: Block[] = [];
      let newPreset = 'custom';
      
      // 检查 type 是否是 preset
      if (dataSource.type && dataSource.type !== 'custom' && dataSource.type !== 'normal' && presetData[dataSource.type]) {
        // 如果是 preset type（如 late_start），直接使用 preset 的 schedule
        newPreset = dataSource.type;
        newSchedule = JSON.parse(JSON.stringify(presetData[dataSource.type] || []));
      } else if (dataSource.schedule && dataSource.schedule.length > 0) {
        // 如果有 schedule，说明是 custom
        newSchedule = dataSource.schedule;
        newPreset = 'custom';
      } else if (dataSource.type === 'custom') {
        // 如果 type 是 custom 但没有 schedule，说明是空的 custom
        newSchedule = [];
        newPreset = 'custom';
      } else {
        // 尝试匹配 preset
        const matchedPreset = PRESETS.find(p => {
          if (p.value === 'custom' || p.value === 'normal') return false;
          const presetSchedule = presetData[p.value];
          if (!presetSchedule) return false;
          return JSON.stringify(presetSchedule) === JSON.stringify(dataSource.schedule);
        });
        if (matchedPreset) {
          newPreset = matchedPreset.value;
          newSchedule = JSON.parse(JSON.stringify(presetData[matchedPreset.value] || []));
        } else {
          newPreset = 'custom';
          newSchedule = [];
        }
      }
      
      setDetails(newDetails);
      setColor(newColor);
      setBanner(newBanner);
      setSchedule(newSchedule);
      setSelectedPreset(newPreset);
      
      // 保存初始状态
      setInitialState({
        details: newDetails,
        color: newColor,
        banner: newBanner,
        schedule: JSON.parse(JSON.stringify(newSchedule)),
        preset: newPreset,
      });
    } else {
      setDetails('');
      setColor('');
      setBanner('');
      setSchedule([]);
      setSelectedPreset('normal');
      
      // 保存初始状态
      setInitialState({
        details: '',
        color: '',
        banner: '',
        schedule: [],
        preset: 'normal',
      });
    }
  }, [draft, specialDay, presetData, dateKey]); // 只保留必要的依赖，通过检查避免不必要的重新初始化

  // 处理 preset 选择
  const handlePresetChange = async (presetValue: string) => {
    if (presetValue === 'normal') {
      // Normal: 清空所有数据
      // 先更新状态（立即更新，避免闪烁）
      setDetails('');
      setColor('');
      setBanner('');
      setSchedule([]);
      setSelectedPreset('normal');
      
      // 更新初始状态
      setInitialState({
        details: '',
        color: '',
        banner: '',
        schedule: [],
        preset: 'normal',
      });
      
      // 如果有已发布的 specialDay，需要创建一个空的 draft 来覆盖它
      // 如果没有 specialDay，直接删除 draft
      // 不立即调用 onSave()，避免闪烁
      // 状态已经在组件内部更新，不需要重新加载
      if (specialDay) {
        // 有已发布的 specialDay，创建空的 draft 来覆盖
        try {
          const response = await fetch(`${API_BASE}/drafts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dateKey,
              data: {
                type: 'normal', // 标记为 normal，覆盖已发布的 specialDay
              },
            }),
          });
          
          if (response.ok && onRefreshDrafts) {
            // 只刷新 drafts，不刷新其他数据，避免闪烁但更新日历标记
            onRefreshDrafts();
          }
        } catch (err) {
          console.error('Failed to save normal draft:', err);
        }
      } else {
        // 没有 specialDay，直接删除 draft
        try {
          const response = await fetch(`${API_BASE}/drafts/${dateKey}`, {
            method: 'DELETE',
          });
          
          if (response.ok && onRefreshDrafts) {
            // 只刷新 drafts，不刷新其他数据，避免闪烁但更新日历标记
            onRefreshDrafts();
          }
        } catch (err) {
          console.error('Failed to delete draft:', err);
        }
      }
    } else {
      // 立即保存（不使用防抖，确保切换日期前已保存）
      // 先构建要保存的数据
      const presetSchedule = presetData[presetValue];
      const newSchedule = presetSchedule 
        ? JSON.parse(JSON.stringify(presetSchedule)) // 深拷贝
        : schedule; // custom 时保持当前 schedule
      
      // 立即保存，使用最新的值（在状态更新之前）
      // 使用 ref 获取最新的状态值
      const currentDetails = detailsRef.current;
      const currentColor = colorRef.current;
      const currentBanner = bannerRef.current;
      const currentSchedule = scheduleRef.current;
      
      try {
        setSaving(true);
        const data: any = {
          type: presetValue === 'custom' ? 'custom' : presetValue,
        };
        
        // 如果选择的是 preset，不保存 schedule（因为 preset 的 schedule 是固定的）
        // 如果选择的是 custom，保存当前的 schedule
        if (presetValue === 'custom') {
          data.schedule = currentSchedule;
        }
        // preset 类型不保存 schedule，只保存 type
        
        if (currentDetails) data.details = currentDetails;
        if (currentColor) data.color = currentColor;
        if (currentBanner) data.banner = currentBanner;

        const response = await fetch(`${API_BASE}/drafts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateKey,
            data,
          }),
        });

        if (response.ok) {
          // 更新状态（在保存成功后）
          setSelectedPreset(presetValue);
          if (presetSchedule) {
            setSchedule(newSchedule);
          }
          
          // 更新初始状态为当前状态
          const savedSchedule = presetValue !== 'custom' && presetSchedule
            ? presetSchedule
            : currentSchedule;
          setInitialState({
            details: currentDetails,
            color: currentColor,
            banner: currentBanner,
            schedule: JSON.parse(JSON.stringify(savedSchedule)),
            preset: presetValue,
          });
          
          // 只刷新 drafts，不刷新其他数据，避免闪烁但更新日历标记
          if (onRefreshDrafts) {
            onRefreshDrafts();
          }
        }
      } catch (err) {
        console.error('Failed to save:', err);
      } finally {
        setSaving(false);
      }
    }
  };

  // 处理 schedule 修改（自动变成 custom）
  const handleScheduleChange = () => {
    if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
      setSelectedPreset('custom');
    }
    // 自动保存
    triggerAutoSave();
  };

  // 添加 block
  const addBlock = () => {
    // 如果是 preset 模式，不允许添加
    if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
      return;
    }
    setSchedule([...schedule, { name: '', start: '', end: '' }]);
    handleScheduleChange();
  };

  // 删除 block
  const removeBlock = (index: number) => {
    // 如果是 preset 模式，不允许删除
    if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
      return;
    }
    setSchedule(schedule.filter((_, i) => i !== index));
    handleScheduleChange();
  };
  
  // 切换到 custom 模式
  const switchToCustom = () => {
    handlePresetChange('custom');
  };

  // 更新 block
  const updateBlock = (index: number, field: keyof Block, value: any) => {
    // 如果是 preset 模式，不允许修改
    if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
      return;
    }
    
    const updated = [...schedule];
    updated[index] = { ...updated[index], [field]: value };
    setSchedule(updated);
    handleScheduleChange();
  };

  // 自动转换为 special day（当添加属性时）
  const ensureSpecialDay = () => {
    // 如果当前是 normal day，切换到 custom 模式
    // 这样添加 details/color/banner 时，会自动保存为 special day
    if (selectedPreset === 'normal') {
      setSelectedPreset('custom');
    }
    // 自动保存会在 triggerAutoSave 中处理
  };

  // 自动保存（带防抖）
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 使用 useRef 保存最新的状态值，确保 autoSave 使用最新值
  const scheduleRef = useRef<Block[]>(schedule);
  const detailsRef = useRef<string>(details);
  const colorRef = useRef<string>(color);
  const bannerRef = useRef<string>(banner);
  const selectedPresetRef = useRef<string>(selectedPreset);
  
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);
  
  useEffect(() => {
    detailsRef.current = details;
  }, [details]);
  
  useEffect(() => {
    colorRef.current = color;
  }, [color]);
  
  useEffect(() => {
    bannerRef.current = banner;
  }, [banner]);
  
  useEffect(() => {
    selectedPresetRef.current = selectedPreset;
  }, [selectedPreset]);
  
  const autoSave = async () => {
    // 使用 ref 获取最新的状态值
    const currentPreset = selectedPresetRef.current;
    const currentDetails = detailsRef.current;
    const currentColor = colorRef.current;
    const currentBanner = bannerRef.current;
    const currentSchedule = scheduleRef.current;
    
    // 如果是 normal，不保存
    if (currentPreset === 'normal') {
      return;
    }

    try {
      setSaving(true);
      
      const data: any = {
        // 根据 selectedPreset 设置 type
        // 如果是 'custom'，type 为 'custom'；如果是其他 preset，type 为 preset 值
        type: currentPreset === 'custom' ? 'custom' : currentPreset,
      };
      
      // 如果选择了 preset（不是 custom），使用 preset 的 schedule
      // 如果选择了 custom，使用当前编辑的 schedule
      if (currentPreset !== 'custom' && presetData[currentPreset]) {
        data.schedule = presetData[currentPreset];
      } else {
        data.schedule = currentSchedule;
      }
      
      // 使用 ref 获取的最新值
      if (currentDetails) data.details = currentDetails;
      if (currentColor) data.color = currentColor;
      if (currentBanner) data.banner = currentBanner;

      const response = await fetch(`${API_BASE}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateKey,
          data,
        }),
      });

      if (response.ok) {
        // 更新初始状态为当前状态
        const savedSchedule = currentPreset !== 'custom' && presetData[currentPreset] 
          ? presetData[currentPreset] 
          : currentSchedule;
        setInitialState({
          details: currentDetails,
          color: currentColor,
          banner: currentBanner,
          schedule: JSON.parse(JSON.stringify(savedSchedule)),
          preset: currentPreset,
        });
        
        // 只刷新 drafts，不刷新其他数据，避免闪烁但更新日历标记
        if (onRefreshDrafts) {
          onRefreshDrafts();
        }
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  // 带防抖的自动保存
  const triggerAutoSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 500); // 500ms 防抖
  };

  // 删除草稿
  const handleDiscard = async () => {
    if (!confirm(`Are you sure you want to discard the draft for ${dateKey}?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/drafts/${dateKey}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // 重新加载初始状态
        if (specialDay) {
          const newDetails = specialDay.details || '';
          const newColor = specialDay.color || '';
          const newBanner = specialDay.banner || '';
          let newSchedule: Block[] = [];
          let newPreset = 'custom';
          
          if (specialDay.schedule && specialDay.schedule.length > 0) {
            newSchedule = specialDay.schedule;
            newPreset = 'custom';
          } else {
            const matchedPreset = PRESETS.find(p => {
              if (p.value === 'custom' || p.value === 'normal') return false;
              const presetSchedule = presetData[p.value];
              if (!presetSchedule) return false;
              return JSON.stringify(presetSchedule) === JSON.stringify(specialDay.schedule);
            });
            if (matchedPreset) {
              newPreset = matchedPreset.value;
              newSchedule = presetData[matchedPreset.value] || [];
            } else {
              newPreset = 'custom';
              newSchedule = [];
            }
          }
          
          setDetails(newDetails);
          setColor(newColor);
          setBanner(newBanner);
          setSchedule(newSchedule);
          setSelectedPreset(newPreset);
          
          setInitialState({
            details: newDetails,
            color: newColor,
            banner: newBanner,
            schedule: JSON.parse(JSON.stringify(newSchedule)),
            preset: newPreset,
          });
        } else {
          setDetails('');
          setColor('');
          setBanner('');
          setSchedule([]);
          setSelectedPreset('normal');
          
          setInitialState({
            details: '',
            color: '',
            banner: '',
            schedule: [],
            preset: 'normal',
          });
        }
        onSave();
      }
    } catch (err) {
      console.error('Failed to discard:', err);
    }
  };

  // 删除标签
  const handleRemoveTag = (tag: 'details' | 'color' | 'banner') => {
    if (tag === 'details') setDetails('');
    if (tag === 'color') setColor(''); // 删除 color 字段
    if (tag === 'banner') setBanner('');
    // 自动保存
    triggerAutoSave();
  };

  // 清理防抖定时器（组件卸载时）
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // 检测是否有未保存的改动（draft）
  const hasChanges = (): boolean => {
    if (!initialState) return false;
    
    // 检查 preset 是否变化
    if (selectedPreset !== initialState.preset) {
      return true;
    }
    
    // 检查标签是否变化
    if (details !== initialState.details || 
        color !== initialState.color || 
        banner !== initialState.banner) {
      return true;
    }
    
    // 检查 schedule 是否变化
    if (JSON.stringify(schedule) !== JSON.stringify(initialState.schedule)) {
      return true;
    }
    
    return false;
  };

  // 格式化日期
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
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      const normalized = `${year}-${month}-${day}`;
      
      const date = new Date(normalized + 'T00:00:00');
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return dateStr;
  };

  // 格式化时间显示
  const formatTime = (time: string): string => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="day-sidebar">
      <div className="day-sidebar-header">
        <h2>{formatDate(date)}</h2>
        <button className="day-sidebar-close" onClick={onClose}>×</button>
      </div>

      <div className="day-sidebar-content">
        {/* 1. 日期类型信息 */}
        <div className="day-sidebar-section">
          {dayType === 'no-school' && specialPeriod && (
            <div className="day-sidebar-day-type">
              <h3>Special Period</h3>
              <p>{specialPeriod.details || 'No School Period'}</p>
              <p className="day-sidebar-period-dates">
                {formatPeriodDate(specialPeriod.start)} - {formatPeriodDate(specialPeriod.end)}
              </p>
            </div>
          )}

          {dayType === 'special' && specialDay && (
            <div className="day-sidebar-day-type">
              <h3>Special Day</h3>
            </div>
          )}

          {dayType === 'normal' && selectedPreset === 'normal' && (
            <div className="day-sidebar-day-type">
              <h3>Normal Day</h3>
            </div>
          )}
          {dayType === 'normal' && selectedPreset !== 'normal' && (
            <div className="day-sidebar-day-type">
              <h3>Special Day (Draft)</h3>
            </div>
          )}
        </div>

        {/* 2. 标签（details, color, banner） */}
        {dayType !== 'no-school' && (
          <div className="day-sidebar-section">
            <div className="day-sidebar-tags">
              {details && (
                <div
                  className="day-sidebar-tag"
                  onMouseEnter={() => setEditingTag('details')}
                  onMouseLeave={() => setEditingTag(null)}
                  onClick={async () => {
                    const newValue = prompt('Edit details:', details);
                    if (newValue !== null) {
                      setDetails(newValue);
                      ensureSpecialDay();
                      triggerAutoSave();
                    }
                  }}
                >
                  <span>Details: {details}</span>
                  {editingTag === 'details' && (
                    <button
                      className="day-sidebar-tag-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTag('details');
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
              {color && (
                <div
                  className="day-sidebar-tag"
                  onMouseEnter={() => setEditingTag('color')}
                  onMouseLeave={() => setEditingTag(null)}
                >
                  {editingTag === 'color' ? (
                    <>
                      <select
                        className="day-sidebar-tag-select"
                        value={color}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setColor(newValue);
                          ensureSpecialDay();
                          triggerAutoSave();
                          setEditingTag(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setEditingTag(null)}
                      >
                        <option value="green">green</option>
                        <option value="white">white</option>
                        <option value="N/A">N/A</option>
                      </select>
                      <button
                        className="day-sidebar-tag-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTag('color');
                        }}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span>Color: {color}</span>
                  )}
                </div>
              )}
              {banner && (
                <div
                  className="day-sidebar-tag"
                  onMouseEnter={() => setEditingTag('banner')}
                  onMouseLeave={() => setEditingTag(null)}
                  onClick={async () => {
                    const newValue = prompt('Edit banner:', banner);
                    if (newValue !== null) {
                      setBanner(newValue);
                      ensureSpecialDay();
                      triggerAutoSave();
                    }
                  }}
                >
                  <span>Banner: {banner}</span>
                  {editingTag === 'banner' && (
                    <button
                      className="day-sidebar-tag-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTag('banner');
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
              {!details && (
                <div
                  className="day-sidebar-tag day-sidebar-tag-add"
                  onClick={async () => {
                    const value = prompt('Enter details:');
                    if (value) {
                      setDetails(value);
                      ensureSpecialDay();
                      triggerAutoSave();
                    }
                  }}
                >
                  <span>+ Details</span>
                </div>
              )}
              {!color && (
                <div
                  className="day-sidebar-tag day-sidebar-tag-add"
                  onMouseEnter={() => setEditingTag('color')}
                  onMouseLeave={() => setEditingTag(null)}
                >
                  {editingTag === 'color' ? (
                    <select
                      className="day-sidebar-tag-select"
                      value=""
                      onChange={(e) => {
                        const newValue = e.target.value;
                        if (newValue) {
                          setColor(newValue);
                          ensureSpecialDay();
                          triggerAutoSave();
                        }
                        setEditingTag(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => setEditingTag(null)}
                      autoFocus
                    >
                      <option value="">Select color...</option>
                      <option value="green">green</option>
                      <option value="white">white</option>
                      <option value="N/A">N/A</option>
                    </select>
                  ) : (
                    <span>+ Color</span>
                  )}
                </div>
              )}
              {!banner && (
                <div
                  className="day-sidebar-tag day-sidebar-tag-add"
                  onClick={async () => {
                    const value = prompt('Enter banner:');
                    if (value) {
                      setBanner(value);
                      ensureSpecialDay();
                      triggerAutoSave();
                    }
                  }}
                >
                  <span>+ Banner</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Preset 选择器 */}
        <div className="day-sidebar-section">
          <div className="day-sidebar-preset">
            <label>Schedule Type:</label>
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
        </div>

        {/* 4. Schedule Preview */}
        {selectedPreset !== 'normal' && (
          <div className="day-sidebar-section">
            <div className="day-sidebar-schedule-preview">
              <div className="day-sidebar-schedule-preview-header">
                <h4>Schedule</h4>
                {selectedPreset === 'custom' ? (
                  <button className="button day-sidebar-schedule-add-btn" onClick={addBlock}>
                    + Add
                  </button>
                ) : (
                  <span className="day-sidebar-schedule-edit-hint">
                    Switch schedule type to Custom to edit
                  </span>
                )}
              </div>
              <div className="day-sidebar-schedule-list">
                {schedule.map((block, blockIndex) => (
                  <div
                    key={blockIndex}
                    className="day-sidebar-schedule-item"
                    onClick={() => {
                      // 如果是 preset 模式，不允许编辑
                      if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
                        return;
                      }
                      setEditingBlock(blockIndex);
                      setEditingField('name');
                    }}
                  >
                    <div className="day-sidebar-schedule-item-name">
                      {editingBlock === blockIndex && editingField === 'name' ? (
                        <input
                          type="text"
                          value={block.name}
                          onChange={(e) => {
                            updateBlock(blockIndex, 'name', e.target.value);
                            // updateBlock 内部已经调用了 handleScheduleChange，不需要重复调用
                          }}
                          onBlur={() => {
                            setEditingBlock(null);
                            setEditingField(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setEditingBlock(null);
                              setEditingField(null);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <span>{block.name || 'Untitled'}</span>
                      )}
                    </div>
                    <div className="day-sidebar-schedule-item-time">
                      {editingBlock === blockIndex && editingField === 'start' ? (
                        <input
                          type="time"
                          value={block.start}
                          onChange={(e) => {
                            updateBlock(blockIndex, 'start', e.target.value);
                            // updateBlock 内部已经调用了 handleScheduleChange，不需要重复调用
                          }}
                          onBlur={() => {
                            setEditingBlock(null);
                            setEditingField(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={(e) => {
                            // 如果是 preset 模式，不允许编辑
                            if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
                              return;
                            }
                            e.stopPropagation();
                            setEditingBlock(blockIndex);
                            setEditingField('start');
                          }}
                          style={selectedPreset !== 'custom' ? { cursor: 'default', opacity: 0.8 } : {}}
                        >
                          {formatTime(block.start)}
                        </span>
                      )}
                      <span> - </span>
                      {editingBlock === blockIndex && editingField === 'end' ? (
                        <input
                          type="time"
                          value={block.end}
                          onChange={(e) => {
                            updateBlock(blockIndex, 'end', e.target.value);
                            // updateBlock 内部已经调用了 handleScheduleChange，不需要重复调用
                          }}
                          onBlur={() => {
                            setEditingBlock(null);
                            setEditingField(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={(e) => {
                            // 如果是 preset 模式，不允许编辑
                            if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
                              return;
                            }
                            e.stopPropagation();
                            setEditingBlock(blockIndex);
                            setEditingField('end');
                          }}
                          style={selectedPreset !== 'custom' ? { cursor: 'default', opacity: 0.8 } : {}}
                        >
                          {formatTime(block.end)}
                        </span>
                      )}
                      {selectedPreset === 'custom' && (
                        <button
                          className="day-sidebar-schedule-item-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeBlock(blockIndex);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {schedule.length === 0 && (
                  <div className="day-sidebar-schedule-empty">
                    {selectedPreset === 'custom' 
                      ? 'No schedule blocks. Click "+ Add" to add one.'
                      : 'No schedule blocks.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 5. 操作按钮 */}
        <div className="day-sidebar-section day-sidebar-actions-section">
          <div className="day-sidebar-actions">
            {/* View JSON 只在 special day 或 no-school 时显示，normal day 不显示 */}
            {(dayType === 'special' || dayType === 'no-school' || selectedPreset !== 'normal') && (
              <button
                className="button"
                onClick={() => setShowJson(!showJson)}
              >
                {showJson ? 'Hide JSON' : 'View JSON'}
              </button>
            )}
            {/* 只要有 draft 就显示 Discard 按钮 */}
            {draft && selectedPreset !== 'normal' && (
              <button
                className="button danger"
                onClick={handleDiscard}
              >
                Discard
              </button>
            )}
            {/* 正在保存时显示保存指示器 */}
            {selectedPreset !== 'normal' && saving && (
              <span className="day-sidebar-saving-indicator">Saving...</span>
            )}
          </div>
          {showJson && (dayType === 'special' || dayType === 'no-school' || selectedPreset !== 'normal') && (
            <div className="day-sidebar-json-view">
              <pre>{JSON.stringify(
                (() => {
                  // 如果是 no-school 且是 special period，显示 period 信息
                  if (dayType === 'no-school' && specialPeriod) {
                    return {
                      start: specialPeriod.start,
                      end: specialPeriod.end,
                      details: specialPeriod.details || undefined,
                    };
                  }
                  
                  // 如果选择了 preset（不是 custom），只显示 type 和可选属性
                  if (selectedPreset !== 'custom' && selectedPreset !== 'normal') {
                    const json: any = { type: selectedPreset };
                    if (details) json.details = details;
                    if (color) json.color = color;
                    if (banner) json.banner = banner;
                    return json;
                  }
                  
                  // 如果是 custom，显示完整的 schedule
                  if (selectedPreset === 'custom') {
                    const json: any = {
                      type: 'custom',
                    };
                    if (schedule.length > 0) json.schedule = schedule;
                    if (details) json.details = details;
                    if (color) json.color = color;
                    if (banner) json.banner = banner;
                    return json;
                  }
                  
                  // 默认返回空对象
                  return {};
                })(),
                null,
                2
              )}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
