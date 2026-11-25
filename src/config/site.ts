/**
 * Editable site content. Change these values without touching page code.
 */
export const site = {
  name: "غِراس",
  tagline: "دروس خصوصية أونلاين للصفوف من الأول الابتدائي إلى الثالث المتوسط",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://ghiras.sa",

  supervisor: {
    name: "أ. غادة القرني",
    title: "المشرفة التعليمية على غِراس",
    // ✏️ Fill in the real numbers & highlights before launch
    yearsExperience: "", // e.g. "15"
    bio: "معلمة وتربوية قضت سنوات طويلة في الفصول الدراسية، وتعرف من قرب وين يتعثر الطالب ووين يحتاج يد تمسك فيه. تختار بنفسها معلمات غِراس، وتتابع جودة الحصص وتقارير الطلاب أولاً بأول.",
    highlights: [
      "تقابل كل معلمة قبل انضمامها وتراجع طريقة شرحها",
      "تراجع تقارير المتابعة الأسبوعية للطلاب",
      "متاحة لأولياء الأمور في أي ملاحظة على مستوى الطالب",
    ],
  },

  contact: {
    /** Displayed phone numbers (international format, no +). Each gets call + WhatsApp links. */
    phones: ["966565975402", "966546229962"],
    email: "Alialqarni329@gmail.com",
  },


  /** Ghiras store on Salla */
  sallaStore: process.env.NEXT_PUBLIC_SALLA_STORE ?? "https://salla.sa/ghirasedu",

  /** Fallback Salla links (the admin can also set these per plan in the dashboard). */
  sallaLinks: {
    ALL_SUBJECTS: process.env.NEXT_PUBLIC_SALLA_ALL_SUBJECTS ?? "",
    SINGLE_SUBJECT: process.env.NEXT_PUBLIC_SALLA_SINGLE_SUBJECT ?? "",
    SINGLE_SESSION: process.env.NEXT_PUBLIC_SALLA_SINGLE_SESSION ?? "",
  } as Record<string, string>,
};
