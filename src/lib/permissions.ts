/** Client-safe: permission names, labels and the default set for each staff role. */

export const PERMISSIONS = {
  "sessions.view": "متابعة الحصص",
  "sessions.manage": "إدارة الحصص (إعادة الجدولة وتعديل الحالة)",
  "requests.manage": "طلبات الحجز ومراجعة الاعتذارات",
  "parents.view": "عرض أولياء الأمور والمشتركين",
  "parents.manage": "إنشاء حسابات العملاء وإعادة كلمات المرور",
  "teachers.view": "عرض المعلمات وسيرهن الذاتية",
  "teachers.manage": "اعتماد المعلمات وإيقافهن وإضافتهن",
  "subscriptions.manage": "تفعيل الاشتراكات ومدفوعات سلة",
  "finance.view": "عرض المحاسبة والمستحقات",
  "finance.manage": "تسجيل المصروفات وصرف الأجور",
  "tickets.handle": "الدعم الفني (التذاكر)",
  "approvals.decide": "اعتماد الطلبات الحساسة",
  "insights.view": "استبيان التسجيل",
  "settings.manage": "الإعدادات (الباقات، سلة، تيمز، البريد)",
  "audit.view": "سجل العمليات",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const STAFF_ROLES = {
  manager: {
    label: "مدير/ة",
    hint: "كل الصلاحيات، وتصل إليه التذاكر المصعّدة ويعتمد الطلبات الحساسة",
    perms: ALL_PERMISSIONS,
  },
  tech_lead: {
    label: "مسؤول/ة التقنية",
    hint: "تصل إليه مشكلات الاجتماعات والحسابات والأعطال التقنية",
    perms: ["tickets.handle", "sessions.view", "parents.view", "teachers.view", "settings.manage", "audit.view"],
  },
  support: {
    label: "دعم فني",
    hint: "يفتح التذاكر ويتابع العملاء والحصص وطلبات الحجز",
    perms: ["tickets.handle", "sessions.view", "parents.view", "teachers.view", "requests.manage"],
  },
  coordinator: {
    label: "منسق/ة أكاديمي/ة",
    hint: "يتابع الحصص والمعلمات وطلبات الحجز وأهداف الأسر",
    perms: ["sessions.view", "sessions.manage", "requests.manage", "teachers.view", "parents.view", "tickets.handle", "insights.view"],
  },
  accountant: {
    label: "محاسب/ة",
    hint: "المحاسبة والاشتراكات وصرف أجور المعلمات",
    perms: ["finance.view", "finance.manage", "subscriptions.manage", "parents.view"],
  },
} as const satisfies Record<string, { label: string; hint: string; perms: readonly Permission[] }>;
export type StaffRole = keyof typeof STAFF_ROLES;
export const STAFF_ROLE_KEYS = Object.keys(STAFF_ROLES) as StaffRole[];

type Who = { role: string; staff_role?: string | null; permissions?: string[] | null };

/** The owner (admin) can do everything; staff get their custom list, or their role's defaults. */
export function permissionsOf(u: Who): Permission[] {
  if (u.role === "admin") return ALL_PERMISSIONS;
  if (u.role !== "staff" || !u.staff_role || !(u.staff_role in STAFF_ROLES)) return [];
  const list = u.permissions ?? STAFF_ROLES[u.staff_role as StaffRole].perms;
  return list.filter((p): p is Permission => p in PERMISSIONS);
}

export function can(u: Who, ...any: Permission[]) {
  const mine = permissionsOf(u);
  return any.some((p) => mine.includes(p));
}

export function roleLabel(u: Who) {
  if (u.role === "admin") return "المالك";
  if (u.role === "staff" && u.staff_role && u.staff_role in STAFF_ROLES) return STAFF_ROLES[u.staff_role as StaffRole].label;
  return u.role === "teacher" ? "معلمة" : "ولي أمر";
}
