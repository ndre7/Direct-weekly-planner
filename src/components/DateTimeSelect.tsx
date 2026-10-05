import React, { useMemo } from 'react';
import { JALALI_MONTHS, YEARS_1400_TO_1430, getDaysInJalaliMonth, getTodayJalali, getJalaliWeekday } from '../utils/jalali';

export interface DateTimeSelectProps {
  value: string; // 'YYYY/MM/DD' or 'YYYY/MM/DD HH:mm' or ''
  onChange: (val: string) => void;
  showTime?: boolean;
  className?: string;
}

// Convert Persian and Arabic digits to Latin/English digits
function toAsciiDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export const DateTimeSelect: React.FC<DateTimeSelectProps> = ({
  value,
  onChange,
  showTime = false,
  className = ''
}) => {
  // Parse current value
  const parsed = useMemo(() => {
    if (!value || typeof value !== 'string') {
      return { year: '', monthName: '', day: '', hour: '10', minute: '00' };
    }
    const clean = toAsciiDigits(value.trim());
    const match = clean.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
    if (!match) {
      return { year: '', monthName: '', day: '', hour: '10', minute: '00' };
    }
    const y = parseInt(match[1], 10);
    const mNum = parseInt(match[2], 10);
    const d = parseInt(match[3], 10);
    const mName = (mNum >= 1 && mNum <= 12) ? JALALI_MONTHS[mNum - 1] : '';
    const h = match[4] ? String(parseInt(match[4], 10)).padStart(2, '0') : '10';
    const min = match[5] ? String(parseInt(match[5], 10)).padStart(2, '0') : '00';

    return {
      year: String(y),
      monthName: mName,
      day: String(d),
      hour: h,
      minute: min
    };
  }, [value]);

  const currentYearNum = parsed.year ? parseInt(parsed.year, 10) : getTodayJalali().year;
  const currentMonthName = parsed.monthName || getTodayJalali().monthName;
  const maxDays = useMemo(() => {
    return getDaysInJalaliMonth(currentMonthName, currentYearNum);
  }, [currentMonthName, currentYearNum]);

  // Handle updates
  const emitChange = (newYear: string, newMonthName: string, newDay: string, newHour: string, newMinute: string) => {
    if (!newYear || !newMonthName || !newDay) {
      onChange('');
      return;
    }
    const yNum = parseInt(newYear, 10);
    const maxD = getDaysInJalaliMonth(newMonthName, yNum);
    let dNum = parseInt(newDay, 10);
    if (isNaN(dNum) || dNum < 1) {
      onChange('');
      return;
    }
    if (dNum > maxD) {
      // Invalid day after month/year change -> reset to empty
      onChange('');
      return;
    }

    const mIdx = JALALI_MONTHS.indexOf(newMonthName) + 1;
    const formattedDate = `${newYear}/${String(mIdx).padStart(2, '0')}/${String(dNum).padStart(2, '0')}`;
    if (showTime) {
      const hStr = newHour ? String(parseInt(newHour, 10)).padStart(2, '0') : '10';
      const mStr = newMinute ? String(parseInt(newMinute, 10)).padStart(2, '0') : '00';
      onChange(`${formattedDate} ${hStr}:${mStr}`);
    } else {
      onChange(formattedDate);
    }
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextY = e.target.value;
    const nextM = parsed.monthName || getTodayJalali().monthName;
    const maxD = getDaysInJalaliMonth(nextM, parseInt(nextY, 10) || getTodayJalali().year);
    const nextD = (parseInt(parsed.day, 10) > maxD) ? '' : parsed.day;
    emitChange(nextY, nextM, nextD, parsed.hour, parsed.minute);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextM = e.target.value;
    const nextY = parsed.year || String(getTodayJalali().year);
    const maxD = getDaysInJalaliMonth(nextM, parseInt(nextY, 10));
    const nextD = (parseInt(parsed.day, 10) > maxD) ? '' : parsed.day;
    emitChange(nextY, nextM, nextD, parsed.hour, parsed.minute);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextD = e.target.value;
    const nextY = parsed.year || String(getTodayJalali().year);
    const nextM = parsed.monthName || getTodayJalali().monthName;
    emitChange(nextY, nextM, nextD, parsed.hour, parsed.minute);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    emitChange(parsed.year, parsed.monthName, parsed.day, e.target.value, parsed.minute);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    emitChange(parsed.year, parsed.monthName, parsed.day, parsed.hour, e.target.value);
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-slate-800 ${className}`} dir="rtl">
      {/* Day Select */}
      <select
        value={parsed.day}
        onChange={handleDayChange}
        className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
      >
        <option value="">روز</option>
        {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d)}>
            {d}
          </option>
        ))}
      </select>

      {/* Month Select */}
      <select
        value={parsed.monthName}
        onChange={handleMonthChange}
        className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
      >
        <option value="">ماه</option>
        {JALALI_MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {/* Year Select */}
      <select
        value={parsed.year}
        onChange={handleYearChange}
        className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
      >
        <option value="">سال</option>
        {YEARS_1400_TO_1430.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>

      {/* Auto-calculated Weekday Badge */}
      {(() => {
        if (!parsed.year || !parsed.monthName || !parsed.day) return null;
        const mIndex = JALALI_MONTHS.indexOf(parsed.monthName);
        if (mIndex === -1) return null;
        const yNum = parseInt(parsed.year, 10);
        const dNum = parseInt(parsed.day, 10);
        if (isNaN(yNum) || isNaN(dNum)) return null;
        const weekdayName = getJalaliWeekday(yNum, mIndex + 1, dNum).weekday.fa;
        return (
          <span className="px-1.5 py-0.5 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/60 rounded-md shrink-0">
            {weekdayName}
          </span>
        );
      })()}

      {/* Optional Time Selects */}
      {showTime && (
        <div className="flex items-center gap-1 mr-1 border-r border-slate-200 pr-2">
          <select
            value={parsed.hour}
            onChange={handleHourChange}
            className="px-1.5 py-1 text-xs bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span className="font-bold text-slate-400">:</span>
          <select
            value={parsed.minute}
            onChange={handleMinuteChange}
            className="px-1.5 py-1 text-xs bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {['00', '05', '10', '15', '20', '25', '30', '35', '40', '41', '45', '50', '55'].map((min) => (
              <option key={min} value={min}>
                {min}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
