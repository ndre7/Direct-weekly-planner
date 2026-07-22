import { PlannerData } from './types';

export const INITIAL_PLANNER_DATA: PlannerData = {
  month: '1405 خرداد',
  term: 'ترم دانشگاه : 6',
  activeClassesOnly: true,
  quoteText: 'Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time!',
  quoteAuthor: 'Thomas A. Edison',
  classRows: 4,
  classStatusList: [
    "همه کلاس ها فعال",
    "فقط کلاس دانشگاه فعال",
    "فقط کلاس زبان فعال",
    "همه کلاس ها غیر فعال"
  ],
  activeClassStatus: "همه کلاس ها فعال",
  classesTitle: "برنامه کلاس‌های دانشگاه و کلاس زبان",
  dailyTasksTitle: "کارهایی که باید انجام شود (روزانه)",
  detailsTitle: "توضیحات و ددلاین‌های تفکیک‌شده کارهای هفتگی",
  secondaryTitle: "برگه کارهای فکری بدون زمان مشخص (کارهای فرعی)",
  remindersTitle: "پیگیری داروها و عادت‌های هفتگی",
  notesTitle: "رویداد های هفته",
  todoTitle: "لیست کلی کارهای فوری (TO DO LIST)",
  categories: [
    { id: 'university', nameFa: 'کارهای دانشگاه', nameEn: 'University Tasks', color: 'bg-blue-100 border-blue-300 text-blue-900 hover:bg-blue-200' },
    { id: 'programming', nameFa: 'تمرین برنامه نویسی', nameEn: 'Programming Practice', color: 'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200' },
    { id: 'language', nameFa: 'زبان خواندن', nameEn: 'Language Learning', color: 'bg-emerald-100 border-emerald-350 text-emerald-950 hover:bg-emerald-200/80' },
    { id: 'sport', nameFa: 'ورزش', nameEn: 'Sports & Exercise', color: 'bg-purple-100 border-purple-300 text-purple-900 hover:bg-purple-200' },
    { id: 'done', nameFa: 'کار انجام شده', nameEn: 'Task Completed', color: 'bg-green-100 border-green-400 text-green-950 hover:bg-green-200' },
    { id: 'not_done', nameFa: 'کار انجام نشده', nameEn: 'Task Incomplete', color: 'bg-rose-100 border-rose-300 text-rose-900 hover:bg-rose-200' },
  ],
  classesSchedule: [
    {
      id: 'c1',
      row: 1,
      dayKey: 'monday',
      textFa: 'نظریه زبان',
      textEn: 'Language Theory',
      timeFa: '8 تا 10:30',
      timeEn: '8 to 10:30',
      categoryId: 'university'
    },
    {
      id: 'c2',
      row: 1,
      dayKey: 'thursday',
      textFa: 'زبان تخصصی کامپیوتر',
      textEn: 'Computer English',
      timeFa: '8 تا 10:30',
      timeEn: '8 to 10:30',
      categoryId: 'university'
    },
    {
      id: 'c3',
      row: 2,
      dayKey: 'saturday',
      textFa: 'پیاده سازی پایگاه داده',
      textEn: 'Database Implementation',
      timeFa: '10:30 تا 12 و 13 تا 14',
      timeEn: '10:30 to 12 & 13 to 14',
      categoryId: 'university'
    },
    {
      id: 'c4',
      row: 2,
      dayKey: 'sunday',
      textFa: 'مهندسی نرم افزار',
      textEn: 'Software Engineering',
      timeFa: '10:30 تا 12 و 13 تا 14',
      timeEn: '10:30 to 12 & 13 to 14',
      categoryId: 'university'
    },
    {
      id: 'c5',
      row: 3,
      dayKey: 'monday',
      textFa: 'شبکه های کامپیوتری',
      textEn: 'Computer Networks',
      timeFa: '14 تا 16:30',
      timeEn: '14 to 16:30',
      categoryId: 'university'
    },
    {
      id: 'c6',
      row: 3,
      dayKey: 'tuesday',
      textFa: 'کلاس زبان آلمانی',
      textEn: 'German Language Class',
      timeFa: '14:15 تا 15:45',
      timeEn: '14:15 to 15:45',
      categoryId: 'language'
    },
    {
      id: 'c7',
      row: 3,
      dayKey: 'wednesday',
      textFa: 'کلاس زبان آلمانی',
      textEn: 'German Language Class',
      timeFa: '14:15 تا 15:45',
      timeEn: '14:15 to 15:45',
      categoryId: 'language'
    },
    {
      id: 'c8',
      row: 3,
      dayKey: 'thursday',
      textFa: 'کلاس زبان آلمانی',
      textEn: 'German Language Class',
      timeFa: '14:15 تا 15:45',
      timeEn: '14:15 to 15:45',
      categoryId: 'language'
    },
    {
      id: 'c9',
      row: 4,
      dayKey: 'monday',
      textFa: 'اندیشه اسلامی 1',
      textEn: 'Islamic Thought 1',
      timeFa: '17:45 تا 19:30',
      timeEn: '17:45 to 19:30',
      categoryId: 'university'
    },
    {
      id: 'c10',
      row: 4,
      dayKey: 'thursday',
      textFa: 'طراحی کامپایلر',
      textEn: 'Compiler Design',
      timeFa: '16:30 تا 19',
      timeEn: '16:30 to 19:00',
      categoryId: 'university'
    }
  ],
  dailyTasks: {
    saturday: [
      { id: 'dt_sa1', textFa: 'کارهای دانشگاه', textEn: 'University Tasks', categoryId: 'university', status: 'pending' },
      { id: 'dt_sa2', textFa: 'زبان خواندن', textEn: 'Language Learning', categoryId: 'language', status: 'pending' },
      { id: 'dt_sa3', textFa: 'تمرین برنامه نویسی', textEn: 'Programming Practice', categoryId: 'programming', status: 'pending' }
    ],
    sunday: [
      { id: 'dt_su1', textFa: 'ورزش', textEn: 'Exercise', categoryId: 'sport', status: 'pending' },
      { id: 'dt_su2', textFa: 'زبان خواندن', textEn: 'Language Learning', categoryId: 'language', status: 'pending' },
      { id: 'dt_su3', textFa: 'کارهای دانشگاه', textEn: 'University Tasks', categoryId: 'university', status: 'pending' }
    ],
    monday: [
      { id: 'dt_mo1', textFa: 'کارهای دانشگاه', textEn: 'University Tasks', categoryId: 'university', status: 'pending' },
      { id: 'dt_mo2', textFa: 'ورزش (اگر یکشنبه انجام ندادم)', textEn: 'Sport (if Sunday missed)', categoryId: 'sport', status: 'pending' },
      { id: 'dt_mo3', textFa: 'زبان خواندن', textEn: 'Language Learning', categoryId: 'language', status: 'pending' }
    ],
    tuesday: [
      { id: 'dt_tu1', textFa: 'کارهای دانشگاه', textEn: 'University Tasks', categoryId: 'university', status: 'pending' },
      { id: 'dt_tu2', textFa: 'زبان خواندن', textEn: 'Language Learning', categoryId: 'language', status: 'pending' },
      { id: 'dt_tu3', textFa: 'تمرین برنامه نویسی', textEn: 'Programming Practice', categoryId: 'programming', status: 'pending' }
    ],
    wednesday: [
      { id: 'dt_we1', textFa: 'ورزش', textEn: 'Exercise', categoryId: 'sport', status: 'pending' },
      { id: 'dt_we2', textFa: 'زبان خواندن', textEn: 'Language Learning', categoryId: 'language', status: 'pending' },
      { id: 'dt_we3', textFa: 'کارهای دانشگاه', textEn: 'University Tasks', categoryId: 'university', status: 'pending' }
    ],
    thursday: [
      { id: 'dt_th1', textFa: 'تمرین برنامه نویسی', textEn: 'Programming Practice', categoryId: 'programming', status: 'pending' },
      { id: 'dt_th2', textFa: 'انجام کارهای انجام نشده', textEn: 'Complete leftover tasks', categoryId: 'university', status: 'pending' },
      { id: 'dt_th3', textFa: '', textEn: '', categoryId: 'university', status: 'pending' }
    ],
    friday: [
      { id: 'dt_fr1', textFa: 'ورزش', textEn: 'Exercise', categoryId: 'sport', status: 'pending' },
      { id: 'dt_fr2', textFa: 'کارهای دانشگاه', textEn: 'University Tasks', categoryId: 'university', status: 'pending' },
      { id: 'dt_fr3', textFa: 'زبان خواندن', textEn: 'Language Learning', categoryId: 'language', status: 'pending' }
    ]
  },
  detailsColumns: [
    {
      id: 'uni_deadline',
      titleFa: 'ددلاین انجام کارهای دانشگاه',
      titleEn: 'University Deadlines',
      items: [
        { id: 'ud1', text: 'تحویل پروژه مهندسی نرم افزار', date: '1405/03/10' },
        { id: 'ud2', text: 'ارائه پروژه شبکه', date: '1405/03/12' }
      ]
    },
    {
      id: 'prog_deadline',
      titleFa: 'ددلاین کار تمرین برنامه نویسی',
      titleEn: 'Programming Deadlines',
      items: [
        { id: 'pd1', text: 'حل تمرین‌های بخش سوم وب', date: '1405/03/08' },
        { id: 'pd2', text: 'ساخت مینی پروژه گیت', date: '1405/03/15' }
      ]
    },
    {
      id: 'lang_deadline',
      titleFa: 'ددلاین خواندن زبان',
      titleEn: 'Language Deadlines',
      items: [
        { id: 'ld1', text: 'کتاب آلمانی فصل ۳ تموم شه', date: '1405/03/11' },
        { id: 'ld2', text: 'حفظ لغات سطح B1', date: '1405/03/14' }
      ]
    },
    {
      id: 'uni_desc',
      titleFa: 'توضیحات انجام کارهای دانشگاه',
      titleEn: 'University Descriptions',
      items: [
        { id: 'unid1', text: 'مطالعه فصول ۴ و ۵ کتاب مرجع پایگاه داده' },
        { id: 'unid2', text: 'هماهنگی با هم‌گروهی برای ارائه شبکه' }
      ]
    },
    {
      id: 'prog_desc',
      titleFa: 'توضیحات تمرین برنامه نویسی',
      titleEn: 'Programming Descriptions',
      items: [
        { id: 'progd1', text: 'مرور مفاهیم کانتینر در داکر' },
        { id: 'progd2', text: 'زدن ۲ تست در لیت‌کد به صورت روزانه' }
      ]
    },
    {
      id: 'lang_desc',
      titleFa: 'توضیحات زبان خواندن',
      titleEn: 'Language Descriptions',
      items: [
        { id: 'langd1', text: 'مشاهده ۲ ویدیو به زبان آلمانی با زیرنویس' },
        { id: 'langd2', text: 'نوشتن خلاصه روزانه در ۵ خط' }
      ]
    },
    {
      id: 'sport_desc',
      titleFa: 'توضیحات ورزش',
      titleEn: 'Exercise Descriptions',
      items: [
        { id: 'sd1', text: 'تمرینات کششی صبحگاهی ۲۰ دقیقه' },
        { id: 'sd2', text: 'باشگاه ۳ روز در هفته (زوج)' }
      ]
    }
  ],
  secondaryTaskColumns: [
    { id: 'daily', titleFa: 'کارهای روزمره', titleEn: 'Daily Tasks' },
    { id: 'learn', titleFa: 'چیزهایی که باید یادبگیرم (نه خیلی بزرگ)', titleEn: 'Things to Learn (Micro-learning)' },
    { id: 'english', titleFa: 'انگلیسی', titleEn: 'English' },
    { id: 'skill', titleFa: 'ارتقای مهارت ها', titleEn: 'Skill Upgrades' },
    { id: 'reading', titleFa: 'کتابخوانی', titleEn: 'Book Reading' },
    { id: 'migration', titleFa: 'مهاجرت', titleEn: 'Migration' },
    { id: 'leisure', titleFa: 'تفریحات', titleEn: 'Leisure / Recreation' }
  ],
  secondaryTasks: [
    // Active (pending)
    { id: 'st1', columnId: 'daily', textFa: 'تمیز کردن میز کار', textEn: 'Clean the workspace desk', status: 'pending' },
    { id: 'st2', columnId: 'learn', textFa: 'آشنایی با مفاهیم پایه‌ای انیمیشن در CSS', textEn: 'Intro to CSS animation basics', status: 'pending' },
    { id: 'st3', columnId: 'english', textFa: 'خواندن ۳ صفحه از کتاب داستان انگلیسی', textEn: 'Read 3 pages of English story book', status: 'pending' },
    { id: 'st4', columnId: 'skill', textFa: 'شروع دوره فریم‌ورک جدید', textEn: 'Start new framework course', status: 'pending' },
    { id: 'st5', columnId: 'reading', textFa: 'مطالعه ۱۵ صفحه کتاب کار عمیق', textEn: 'Read 15 pages of Deep Work book', status: 'pending' },
    { id: 'st6', columnId: 'migration', textFa: 'سرچ کردن شرایط کاری و هزینه کشورها', textEn: 'Research job markets and cost of living', status: 'pending' },
    { id: 'st7', columnId: 'leisure', textFa: 'بازی ویدیویی نیم ساعت', textEn: 'Play video games for 30 mins', status: 'pending' },

    // Completed
    { id: 'st8', columnId: 'daily', textFa: 'آب دادن به گلدان‌ها', textEn: 'Water the plants', status: 'completed', completionDate: '1405/03/02' },
    { id: 'st9', columnId: 'skill', textFa: 'حل چالش الگوریتمی', textEn: 'Solve algorithmic challenge', status: 'completed', completionDate: '1405/03/04' },
    { id: 'st10', columnId: 'leisure', textFa: 'دیدن یک قسمت سریال', textEn: 'Watch 1 series episode', status: 'completed', completionDate: '1405/03/05' },

    // Incomplete / Passed Due (failed)
    { id: 'st11', columnId: 'skill', textFa: 'تمرین تایپ ده انگشتی فشرده', textEn: 'Touch typing practice session', status: 'failed' }
  ],
  reminders: [
    { id: 'rem1', textFa: 'خوردن ویتامین D اول هر ماه', textEn: 'Take Vitamin D first of every month', checkedDays: ['friday'] },
    { id: 'rem2', textFa: 'خوردن قرص امگا 3 روز های فرد', textEn: 'Take Omega-3 on odd days', checkedDays: ['sunday', 'tuesday', 'thursday'] },
    { id: 'rem3', textFa: 'خوردن قرص ب 12 روز های فرد', textEn: 'Take Vitamin B12 on odd days', checkedDays: ['sunday', 'tuesday', 'thursday'] },
    { id: 'rem4', textFa: 'زدن پماد دست ساز به ضایعات پوستی هر شب قبل خواب', textEn: 'Apply custom skin ointment before bed', checkedDays: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'] }
  ],
  notes: 'نکات مهم هفته:\n- تمرکز روی پیاده‌سازی پروژه دانشگاهی در اولویت است.\n- کارهای فرعی را به مرور در زمان‌های استراحت انجام دهم.',
  weeklyEvents: [
    { id: 'we1', text: 'تمرکز روی پیاده‌سازی پروژه دانشگاهی در اولویت است.', completed: false },
    { id: 'we2', text: 'کارهای فرعی را به مرور در زمان‌های استراحت انجام دهم.', completed: false }
  ],
  dailyThoughts: [
    { id: 'dt1', text: 'امروز پیشرفت بسیار خوبی در طراحی رابط کاربری داشتم.', completed: false },
    { id: 'dt2', text: 'باید برای هفته آینده برنامه‌ریزی دقیق‌تری انجام دهم.', completed: false }
  ],
  todoList: [
    { id: 't1', text: 'خرید خودکار و دفترچه جدید', completed: false },
    { id: 't2', text: 'هماهنگی با استاد راهنما', completed: true },
    { id: 't3', text: 'بکاپ گرفتن از فایل‌های هارد', completed: false }
  ],
  coreTasksTitle: 'کارهای اصلی تفکیک‌شده بر اساس دسته‌بندی با توضیحات کامل',
  coreTasks: [
    {
      id: 'ct1',
      categoryId: 'university',
      title: 'انجام فاز اول پروژه مهندسی نرم‌افزار',
      description: 'نوشتن مستندات نیازمندی‌ها، رسم نمودارهای سناریو (Use Case Diagram)، طراحی نمودارهای توالی (Sequence Diagrams) و تشکیل جلسه آنلاین هماهنگی به همراه هم‌گروهی در دیسکورد.',
      status: 'pending'
    },
    {
      id: 'ct2',
      categoryId: 'programming',
      title: 'یادگیری عمیق Tailwind CSS v4',
      description: 'مطالعه تغییرات ساختاری و کانفیگ جدید نسخه v4، بررسی ویژگی‌های فایل css و تعریف متغیرهای دلخواه در روت قالب پروژه و جایگزینی کلاس‌های قدیمی با استانداردهای نوین تفکیک قالب.',
      status: 'pending'
    },
    {
      id: 'ct3',
      categoryId: 'language',
      title: 'مطالعه و تسلط روی گرامر مجهول آلمانی (Passiv)',
      description: 'مطالعه دقیق گرامر زمان حال ساده مجهول و زمان گذشته کامل مجهول، ساخت ۲۰ جمله نمونه مجهول با افعال پرکاربرد روزمره آلمانی و حل حداقل ۵ تمرین تشریحی کتاب کار.',
      status: 'completed'
    }
  ],
  weekStartDay: 1,
  weekEndDay: 7,
  weekYear: 1405,
  weekMonth: 'خرداد',
  dailyTaskRows: 3,
  postponedEvents: [
    {
      id: 'pe1',
      title: 'امتحان ریاضی مهندسی',
      type: 'امتحان',
      action: 'به تعویق افتاده',
      date: '۱۴۰۵/۰۳/۱۲',
      newDate: '۱۴۰۵/۰۳/۱۹',
      description: 'به دلیل تداخل با کلاس جبر خطی به هفته آینده منتقل شد.'
    },
    {
      id: 'pe2',
      title: 'ارائه نظریه زبان‌ها',
      type: 'ارائه',
      action: 'لغو شده',
      date: '۱۴۰۵/۰۳/۱۵',
      description: 'استاد اعلام کرد که ارائه اختیاری است و نمره‌اش بین کوییزها تقسیم می‌شود.'
    }
  ]
};
