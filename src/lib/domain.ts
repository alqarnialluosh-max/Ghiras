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
  requested: "بانتظار تأكيد المعلمة",
  proposed: "موعد بديل مقترح",
  declined: "لم تؤكدها المعلمة",
  not_taken: "لم تُحجز",
};

/** Rows that no longer hold a time slot or a session credit. */
export const DEAD_STATUSES = ["rescheduled", "declined", "not_taken"] as const;
/** Requests still waiting for an answer: they hold the slot and the credit. */
export const OPEN_STATUSES = ["requested", "proposed"] as const;
/** Hours the teacher has to accept or decline a request. */
export const TEACHER_RESPONSE_HOURS = 3;
/** Hours the parent has to answer a proposed alternative time. */
export const PARENT_RESPONSE_HOURS = 24;

export const SUB_STATUS: Record<string, string> = {
  pending_payment: "بانتظار تأكيد الدفع",
  active: "فعّال",
  expired: "منتهي",
  void: "ملغى من الإدارة",
};

export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Session length in minutes (one hour and a quarter). */
export const SESSION_MINUTES = 75;
/** Human label for the session length. */
export const SESSION_LABEL = "ساعة وربع";
/** Slot granularity for start times. */
export const SLOT_STEP_MINUTES = 30;
/** Requests must be made at least this many hours ahead (room for the teacher to answer, or an alternative). */
export const MIN_LEAD_HOURS = 12;
/** Booking window shown to parents. */
export const BOOKING_HORIZON_DAYS = 21;
/** Join button opens this many minutes before start. */
export const JOIN_OPENS_MINUTES = 15;
