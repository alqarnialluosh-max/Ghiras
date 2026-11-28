/** Client-safe ticket vocabulary. */

export const SEVERITY = {
  low: { label: "منخفضة", hours: 72, tone: "bg-wash text-muted" },
  medium: { label: "متوسطة", hours: 24, tone: "bg-sky-50 text-sky-900" },
  high: { label: "عالية", hours: 4, tone: "bg-amber-50 text-amber-900" },
  critical: { label: "حرجة", hours: 1, tone: "bg-red-50 text-red-800" },
} as const;
export type Severity = keyof typeof SEVERITY;

export const TICKET_CATEGORY = {
  teams: "الاجتماعات (Meet / Teams)",
  technical: "عطل تقني في الموقع",
  account: "الحساب وتسجيل الدخول",
  booking: "الحجز والمواعيد",
  payment: "الدفع والاشتراك",
  teacher: "المعلمات والحصص",
  other: "أخرى",
} as const;
export type Category = keyof typeof TICKET_CATEGORY;

export const TICKET_STATUS = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  waiting: "بانتظار العميل",
  resolved: "تم الحل",
  closed: "مغلقة",
} as const;
export type TicketStatus = keyof typeof TICKET_STATUS;

export const TICKET_LEVELS = ["الدعم الفني", "مسؤول التقنية", "المدير", "المالك"] as const;

export const APPROVAL_KIND = {
  extra_session: "حصة تعويضية",
  extend_subscription: "تمديد اشتراك",
  manual_activation: "تفعيل اشتراك يدوي",
} as const;
export type ApprovalKind = keyof typeof APPROVAL_KIND;
