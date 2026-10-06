import { jalaliToGregorian, JALALI_MONTHS } from '../utils/jalali';
import type { AnalyticsReport } from '../utils/reportBuilder';

export type ReminderOffset = '1week' | '3days' | '1day' | '6hours' | '1hour';

export const REMINDER_OFFSET_OPTIONS: { id: ReminderOffset; labelFa: string; labelEn: string; ms: number }[] = [
  { id: '1week', labelFa: 'یک هفته قبل (۷ روز)', labelEn: '1 week before', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '3days', labelFa: 'سه روز قبل', labelEn: '3 days before', ms: 3 * 24 * 60 * 60 * 1000 },
  { id: '1day', labelFa: 'یک روز قبل (۲۴ ساعت)', labelEn: '1 day before', ms: 1 * 24 * 60 * 60 * 1000 },
  { id: '6hours', labelFa: '۶ ساعت قبل', labelEn: '6 hours before', ms: 6 * 60 * 60 * 1000 },
  { id: '1hour', labelFa: '۱ ساعت قبل', labelEn: '1 hour before', ms: 1 * 60 * 60 * 1000 },
];

export function getOffsetMs(offset?: ReminderOffset): number {
  const match = REMINDER_OFFSET_OPTIONS.find(o => o.id === offset);
  return match ? match.ms : 1 * 24 * 60 * 60 * 1000; // default 1 day
}

export function getOffsetLabelFa(offset?: ReminderOffset): string {
  const match = REMINDER_OFFSET_OPTIONS.find(o => o.id === offset);
  return match ? match.labelFa : 'یک روز قبل';
}

export function parseItemDeadlineMs(item: any, defaultYear: number = 1405): number | null {
  try {
    if (item.date && typeof item.date === 'string') {
      const parts = item.date.trim().split(' ')[0].split('/');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          const gDate = jalaliToGregorian(y, m, d);
          let hour = 9;
          let min = 0;
          if (item.date.includes(' ')) {
            const timePart = item.date.split(' ')[1];
            if (timePart.includes(':')) {
              hour = parseInt(timePart.split(':')[0], 10) || 9;
              min = parseInt(timePart.split(':')[1], 10) || 0;
            }
          } else if (item.time && typeof item.time === 'string' && item.time.includes(':')) {
            hour = parseInt(item.time.split(':')[0], 10) || 9;
            min = parseInt(item.time.split(':')[1], 10) || 0;
          }
          gDate.setHours(hour, min, 0, 0);
          return gDate.getTime();
        }
      }
    }

    if (item.deadline && typeof item.deadline === 'object') {
      const { day, month, year, time } = item.deadline;
      if (day && month) {
        const mIdx = JALALI_MONTHS.indexOf(month);
        if (mIdx !== -1) {
          const y = year || defaultYear;
          const gDate = jalaliToGregorian(y, mIdx + 1, day);
          let hour = 9;
          let min = 0;
          if (time && typeof time === 'string' && time.includes(':')) {
            hour = parseInt(time.split(':')[0], 10) || 9;
            min = parseInt(time.split(':')[1], 10) || 0;
          }
          gDate.setHours(hour, min, 0, 0);
          return gDate.getTime();
        }
      }
    }

    if (item.time && typeof item.time === 'string' && item.time.includes(':')) {
      const parts = item.time.split(':');
      const hour = parseInt(parts[0], 10) || 9;
      const min = parseInt(parts[1], 10) || 0;
      const nowD = new Date();
      nowD.setHours(hour, min, 0, 0);
      return nowD.getTime();
    }
  } catch (e) {
    console.warn('Error parsing item deadline:', e);
  }
  return null;
}

export function makeMimeEmail(to: string, subject: string, htmlContent: string) {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const emailLines = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    htmlContent
  ];
  const email = emailLines.join('\r\n');
  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sendGmailEmail(accessToken: string, toEmail: string, subject: string, htmlContent: string) {
  const raw = makeMimeEmail(toEmail, subject, htmlContent);
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`خطا در ارسال ایمیل جیمیل: ${errText}`);
  }

  return await response.json();
}

export function buildReminderEmailHtml(title: string, tabName: string, deadlineDisplay: string, description?: string) {
  return `
    <div style="font-family: Tahoma, 'IRANSans', Arial, sans-serif; direction: rtl; text-align: right; background-color: #f8fafc; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0; max-width: 600px; margin: 0 auto; color: #1e293b;">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 18px 24px; border-radius: 14px; color: white; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);">
        <h2 style="margin: 0; font-size: 18px; font-weight: 800;">⏰ یادآوری برنامه‌ریزی هفتگی</h2>
        <p style="margin: 6px 0 0 0; font-size: 12px; opacity: 0.9;">ارسال شده خودکار از اپلیکیشن برنامه‌ریزی هفتگی</p>
      </div>
      
      <div style="background: white; border-radius: 14px; padding: 22px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; border-bottom: 2px solid #f1f5f9; pb: 12px; margin-bottom: 16px;">
          📌 عنوان: <span style="color: #4f46e5;">${title}</span>
        </h3>
        <p style="color: #334155; font-size: 13px; margin: 10px 0;"><strong>بخش مربوطه:</strong> ${tabName}</p>
        <p style="color: #334155; font-size: 13px; margin: 10px 0;"><strong>زمان سررسید / ددلاین:</strong> <span style="color: #059669; font-weight: bold;">${deadlineDisplay}</span></p>
        
        ${description ? `
          <div style="margin-top: 16px; background-color: #f8fafc; border-right: 4px solid #6366f1; padding: 12px 16px; border-radius: 8px;">
            <strong style="font-size: 12px; color: #475569; display: block; margin-bottom: 4px;">توضیحات:</strong>
            <p style="margin: 0; font-size: 13px; color: #1e293b; line-height: 1.6;">${description}</p>
          </div>
        ` : ''}
      </div>

      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        این ایمیل به صورت خودکار بر اساس زمانبندی یادآوری‌های شما ارسال شده است.
      </p>
    </div>
  `;
}

export function buildAnalyticsEmailHtml(report: AnalyticsReport): string {
  const categoriesHtml = report.categoryBreakdown.length > 0
    ? report.categoryBreakdown.slice(0, 6).map(c => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 12px; font-weight: bold; color: #334155;">${c.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 12px; text-align: center; color: #475569;">${c.completedTasks} از ${c.totalTasks}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 12px; text-align: center; font-weight: bold; color: #4f46e5;">${c.percentage}%</td>
      </tr>
    `).join('')
    : '<tr><td colspan="3" style="padding: 12px; text-align: center; font-size: 12px; color: #94a3b8;">اطلاعات دسته‌بندی در این بازه ثبت نشده است.</td></tr>';

  const examsHtml = report.upcomingExamsDeadlines.length > 0
    ? report.upcomingExamsDeadlines.map(ex => `
      <li style="margin-bottom: 6px; font-size: 12px; color: #334155;">
        <strong>${ex.text}</strong>
        ${ex.type ? `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 4px;">${ex.type}</span>` : ''}
        <span style="color: #64748b; font-size: 11px;">(${ex.date})</span>
        <span style="color: ${ex.completed ? '#059669' : '#d97706'}; font-weight: bold; font-size: 11px; margin-right: 6px;">${ex.completed ? '✓ تکمیل' : 'در انتظار'}</span>
      </li>
    `).join('')
    : '<p style="margin: 0; font-size: 12px; color: #94a3b8;">مورد ثبت‌شده‌ای برای این بازه یافت نشد.</p>';

  return `
    <div style="font-family: Tahoma, 'IRANSans', Arial, sans-serif; direction: rtl; text-align: right; background-color: #f8fafc; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0; max-width: 650px; margin: 0 auto; color: #1e293b;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%); padding: 20px 24px; border-radius: 14px; color: white; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);">
        <h2 style="margin: 0; font-size: 18px; font-weight: 800;">📊 گزارش تحلیلی عملکرد برنامه‌ریزی</h2>
        <p style="margin: 6px 0 0 0; font-size: 12px; opacity: 0.95;">بازه زمانی: ${report.rangeLabelFa} (${report.startDate} تا ${report.endDate})</p>
      </div>

      <!-- High-level KPIs Grid -->
      <div style="background: white; border-radius: 14px; padding: 18px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
        <h3 style="margin-top: 0; font-size: 14px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 14px;">
          🎯 شاخص‌های کلیدی عملکرد (KPIs)
        </h3>
        <table style="width: 100%; border-collapse: collapse; text-align: center;">
          <tr>
            <td style="padding: 12px; background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; width: 25%;">
              <div style="font-size: 11px; color: #166534; font-weight: bold;">نرخ موفقیت (TCR)</div>
              <div style="font-size: 20px; font-weight: 900; color: #15803d; margin-top: 4px;">${report.tcr}%</div>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 12px; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 10px; width: 25%;">
              <div style="font-size: 11px; color: #1e40af; font-weight: bold;">کارهای انجام شده</div>
              <div style="font-size: 18px; font-weight: 900; color: #1d4ed8; margin-top: 4px;">${report.tasksCompleted} / ${report.tasksTotal}</div>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 12px; background: #fefce8; border: 1px solid #fef08a; border-radius: 10px; width: 25%;">
              <div style="font-size: 11px; color: #854d0e; font-weight: bold;">پایداری در عادت‌ها</div>
              <div style="font-size: 20px; font-weight: 900; color: #a16207; margin-top: 4px;">${report.habitConsistency}%</div>
            </td>
            <td style="width: 10px;"></td>
            <td style="padding: 12px; background: #faf5ff; border: 1px solid #f3e8ff; border-radius: 10px; width: 25%;">
              <div style="font-size: 11px; color: #6b21a8; font-weight: bold;">روزهای فعال</div>
              <div style="font-size: 20px; font-weight: 900; color: #7e22ce; margin-top: 4px;">${report.daysWithData}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Best & Worst Day -->
      ${report.bestDay || report.worstDay ? `
        <div style="background: white; border-radius: 14px; padding: 18px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
          <h3 style="margin-top: 0; font-size: 14px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px;">
            ⚡ تحلیل روزهای هفته
          </h3>
          <div style="display: flex; gap: 12px;">
            ${report.bestDay ? `
              <div style="flex: 1; padding: 10px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                <span style="font-size: 11px; color: #166534; font-weight: bold;">🌟 پربازده‌ترین روز:</span>
                <span style="font-size: 13px; font-weight: 900; color: #14532d; margin-right: 6px;">${report.bestDay.dayName} (${report.bestDay.rate}%)</span>
              </div>
            ` : ''}
            ${report.worstDay ? `
              <div style="flex: 1; padding: 10px 14px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px;">
                <span style="font-size: 11px; color: #9f1239; font-weight: bold;">📉 روز نیازمند توجه:</span>
                <span style="font-size: 13px; font-weight: 900; color: #881337; margin-right: 6px;">${report.worstDay.dayName} (${report.worstDay.rate}%)</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Category Breakdown Table -->
      <div style="background: white; border-radius: 14px; padding: 18px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
        <h3 style="margin-top: 0; font-size: 14px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px;">
          📂 تفکیک عملکرد دسته‌بندی‌ها
        </h3>
        <table style="width: 100%; border-collapse: collapse; text-align: right;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 8px 12px; font-size: 11px; color: #64748b; border-bottom: 2px solid #e2e8f0;">دسته‌بندی</th>
              <th style="padding: 8px 12px; font-size: 11px; color: #64748b; border-bottom: 2px solid #e2e8f0; text-align: center;">کارهای انجام‌شده</th>
              <th style="padding: 8px 12px; font-size: 11px; color: #64748b; border-bottom: 2px solid #e2e8f0; text-align: center;">نرخ موفقیت</th>
            </tr>
          </thead>
          <tbody>
            ${categoriesHtml}
          </tbody>
        </table>
      </div>

      <!-- Upcoming Exams & Deadlines -->
      ${report.upcomingExamsDeadlines.length > 0 ? `
        <div style="background: white; border-radius: 14px; padding: 18px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
          <h3 style="margin-top: 0; font-size: 14px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px;">
            🎓 امتحانات و ددلاین‌های این بازه
          </h3>
          <ul style="margin: 0; padding-right: 20px;">
            ${examsHtml}
          </ul>
        </div>
      ` : ''}

      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        ارسال شده خودکار از اپلیکیشن برنامه‌ریزی هفتگی • داده‌ها مستقیماً بر اساس ثبت واقعی فعالیت‌های شما محاسبه شده‌اند.
      </p>
    </div>
  `;
}
