import { jalaliToGregorian, JALALI_MONTHS } from '../utils/jalali';

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
