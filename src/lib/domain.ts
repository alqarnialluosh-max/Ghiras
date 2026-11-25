/** Shared, client-safe domain vocabulary. */

export const SUBJECTS = {
  math: "الرياضيات",
  arabic: "لغتي العربية",
  science: "العلوم",
} as const;
export type Subject = keyof typeof SUBJECTS;
export const SUBJECT_KEYS = Object.keys(SUBJECTS) as Subject[];

export const TRACKS = {
  remedial: { name: "التقوية", short: "تقوية", desc: "نعود إلى الأساسيات ونسد الفجوات المتراكمة خطوة بخطوة، حتى يستعيد الطالب ثقته بنفسه." },
  followup: { name: "المتابعة المستمرة", short: "متابعة", desc: "نواكب منهج المدرسة أسبوعاً بأسبوع: شرح الدروس، وحل الواجبات، ومتابعة مستمرة لمستوى الطالب." },
  exam_prep: { name: "تحضير الاختبارات النهائية", short: "اختبارات", desc: "مراجعة مركّزة، ونماذج اختبارات، وتدريب على إدارة الوقت قبل الاختبارات النهائية." },
} as const;
export type Track = keyof typeof TRACKS;
export const TRACK_KEYS = Object.keys(TRACKS) as Track[];

export const GRADES: Record<number, string> = {
  1: "الأول الابتدائي", 2: "الثاني الابتدائي", 3: "الثالث الابتدائي",
  4: "الرابع الابتدائي", 5: "الخامس الابتدائي", 6: "السادس الابتدائي",
  7: "الأول المتوسط", 8: "الثاني المتوسط", 9: "الثالث المتوسط",
};

export const BOOKING_STATUS: Record<string, string> = {
  scheduled: "مجدولة",
  completed: "تمت",
  student_absent: "غياب الطالب",
  teacher_absent: "غياب المعلمة",
  rescheduled: "أعيدت جدولتها",
};

export const SUB_STATUS: Record<string, string> = {
  pending_payment: "بانتظار تأكيد الدفع",
  active: "فعّال",
  expired: "منتهي",
  void: "ملغى من الإدارة",
};

export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Session length in minutes (one hour as specified). */
export const SESSION_MINUTES = 60;
/** Slot granularity for start times. */
export const SLOT_STEP_MINUTES = 30;
/** Bookings must be made at least this many hours ahead. */
export const MIN_LEAD_HOURS = 3;
/** Booking window shown to parents. */
export const BOOKING_HORIZON_DAYS = 21;
/** Join button opens this many minutes before start. */
export const JOIN_OPENS_MINUTES = 15;
