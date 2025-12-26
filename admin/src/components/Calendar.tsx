import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import DaySidebar from './DaySidebar';
import './Calendar.css';

interface CalendarDay {
  date: Date;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasDraft: boolean;
  dayType: 'normal' | 'special' | 'no-school' | null;
}

interface Draft {
  dateKey: string;
  data: any;
  updatedBy: string;
  updatedAt: string;
}

interface SpecialDayRecord {
  type?: string;
  details?: string;
  schedule?: any[];
}

interface SpecialPeriod {
  start: string;
  end: string;
  details?: string;
}

// Worker API 配置 - 统一从 Worker API 获取数据
// 本地开发时使用本地 Worker，生产环境通过 Pages Function 代理
// Worker 端口固定为 8787（在 wrangler.toml 中配置）
const WORKER_PORT = import.meta.env.VITE_WORKER_PORT || '8787';
const WORKER_API_BASE = import.meta.env.DEV
  ? `http://localhost:${WORKER_PORT}/api`
  : '/api';

export default function Calendar() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [specialDays, setSpecialDays] = useState<Record<string, SpecialDayRecord>>({});
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // 当侧边栏打开时，在 body 上添加 class 来隐藏 header
  useEffect(() => {
    if (selectedDay) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    // 清理函数
    return () => {
      document.body.classList.remove('sidebar-open');
    };
  }, [selectedDay]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load drafts from Worker
      const draftsRes = await fetch(`${API_BASE}/drafts`);
      if (draftsRes.ok) {
        const draftsData = await draftsRes.json();
        setDrafts(draftsData.drafts || {});
      }

      // Load special_days and special_periods from Worker API
      try {
        const [specialDaysRes, specialPeriodsRes] = await Promise.all([
          fetch(`${WORKER_API_BASE}/special_days.json`, { cache: 'no-cache' }),
          fetch(`${WORKER_API_BASE}/special_periods.json`, { cache: 'no-cache' })
        ]);

        if (specialDaysRes.ok) {
          const specialDaysData = await specialDaysRes.json();
          setSpecialDays(specialDaysData || {});
        } else {
          console.warn('Failed to load special_days:', specialDaysRes.status);
        }

        if (specialPeriodsRes.ok) {
          const specialPeriodsData = await specialPeriodsRes.json();
          setSpecialPeriods(specialPeriodsData || []);
        } else {
          console.warn('Failed to load special_periods:', specialPeriodsRes.status);
        }
      } catch (err) {
        console.error('Failed to load schedule data from Worker API:', err);
      }

    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // 标准化日期字符串为 yyyy-MM-dd 格式
  const normalizeDateString = (dateStr: string): string => {
    // 处理 "2026-1-6" -> "2026-01-06"
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  };

  const isDateInRange = (date: Date, startStr: string, endStr: string): boolean => {
    const dateKey = formatDateKey(date);
    const normalizedStart = normalizeDateString(startStr);
    const normalizedEnd = normalizeDateString(endStr);
    return dateKey >= normalizedStart && dateKey <= normalizedEnd;
  };

  const getDayType = (dateKey: string, date: Date, isCurrentMonth: boolean): 'normal' | 'special' | 'no-school' | null => {
    // 不属于当前月的日期不显示颜色标记
    if (!isCurrentMonth) {
      return null;
    }

    // Check if in special period (no school)
    for (const period of specialPeriods) {
      if (isDateInRange(date, period.start, period.end)) {
        return 'no-school';
      }
    }

    // Check special_days
    const specialDay = specialDays[dateKey];
    if (specialDay) {
      if (specialDay.type === 'no_school') {
        return 'no-school';
      }
      if (specialDay.type === 'custom' || specialDay.schedule) {
        return 'special';
      }
    }

    return 'normal';
  };

  const getDaysInMonth = (date: Date): CalendarDay[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const startDay = firstDay.getDay();
    const days: CalendarDay[] = [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      const dateKey = formatDateKey(date);
      days.push({
        date,
        dateKey,
        isCurrentMonth: false,
        isToday: isSameDay(date, today),
        hasDraft: false, // 其他月的日期不显示 draft
        dayType: getDayType(dateKey, date, false)
      });
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = formatDateKey(date);
      days.push({
        date,
        dateKey,
        isCurrentMonth: true,
        isToday: isSameDay(date, today),
        hasDraft: dateKey in drafts,
        dayType: getDayType(dateKey, date, true)
      });
    }
    
    // Next month days (fill to 6 weeks)
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      const dateKey = formatDateKey(date);
      days.push({
        date,
        dateKey,
        isCurrentMonth: false,
        isToday: isSameDay(date, today),
        hasDraft: false, // 其他月的日期不显示 draft
        dayType: getDayType(dateKey, date, false)
      });
    }
    
    return days;
  };

  const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const handleDateClick = (day: CalendarDay) => {
    setSelectedDay(day);
  };

  const handleCloseSidebar = () => {
    setSelectedDay(null);
  };

  const handleSaveSidebar = () => {
    loadData(); // 重新加载数据
    setSelectedDay(null);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const days = getDaysInMonth(currentDate);
  const monthYear = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  if (loading) {
    return <div className="calendar-loading">Loading calendar...</div>;
  }

  // 获取选中日期的 special period
  const getSelectedDayPeriod = (): SpecialPeriod | null => {
    if (!selectedDay) return null;
    for (const period of specialPeriods) {
      if (isDateInRange(selectedDay.date, period.start, period.end)) {
        return period;
      }
    }
    return null;
  };

  return (
    <>
      <div className={`calendar ${selectedDay ? 'calendar-with-sidebar' : ''}`}>
        <div className="calendar-header">
          <div className="calendar-nav">
            <button onClick={handlePrevMonth} className="calendar-nav-btn">‹</button>
            <h2 className="calendar-month-year">{monthYear}</h2>
            <button onClick={handleNextMonth} className="calendar-nav-btn">›</button>
          </div>
          <button onClick={handleToday} className="calendar-today-btn">Today</button>
        </div>

        <div className="calendar-grid">
          <div className="calendar-weekdays">
            {dayNames.map(day => (
              <div key={day} className="calendar-weekday">{day}</div>
            ))}
          </div>

          <div className="calendar-days">
            {days.map((day, index) => (
              <div
                key={index}
                className={`calendar-day ${!day.isCurrentMonth ? 'calendar-day-other-month' : ''} ${day.isToday ? 'calendar-day-today' : ''} ${day.hasDraft ? 'calendar-day-has-draft' : ''} ${day.dayType ? `calendar-day-${day.dayType}` : ''}`}
                onClick={() => day.isCurrentMonth && handleDateClick(day)}
                style={{ cursor: day.isCurrentMonth ? 'pointer' : 'default' }}
              >
              <div className="calendar-day-number">{day.date.getDate()}</div>
              <div className="calendar-day-indicators">
                {/* Draft is now shown with diagonal lines, no indicator needed */}
              </div>
              </div>
            ))}
          </div>
        </div>

        <div className="calendar-legend">
          <div className="calendar-legend-item">
            <span 
              className="calendar-day-normal calendar-day-has-draft" 
              style={{ 
                width: '20px', 
                height: '20px', 
                display: 'inline-block', 
                border: '1px solid var(--border)',
                position: 'relative'
              }}
            ></span>
            <span>Draft</span>
          </div>
          <div className="calendar-legend-item">
            <span className="calendar-day-normal" style={{ width: '20px', height: '20px', display: 'inline-block', border: '1px solid var(--border)' }}></span>
            <span>Normal</span>
          </div>
          <div className="calendar-legend-item">
            <span className="calendar-day-special" style={{ width: '20px', height: '20px', display: 'inline-block' }}></span>
            <span>Special Day</span>
          </div>
          <div className="calendar-legend-item">
            <span className="calendar-day-no-school" style={{ width: '20px', height: '20px', display: 'inline-block' }}></span>
            <span>No School</span>
          </div>
        </div>
      </div>

      {selectedDay && (
        <DaySidebar
          dateKey={selectedDay.dateKey}
          date={selectedDay.date}
          specialDay={specialDays[selectedDay.dateKey] || null}
          specialPeriod={getSelectedDayPeriod()}
          dayType={selectedDay.dayType}
          onClose={handleCloseSidebar}
          onSave={handleSaveSidebar}
        />
      )}
    </>
  );
}

