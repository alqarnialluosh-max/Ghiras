/** Client-safe survey vocabulary (labels shown to parents and in owner insights). */
export const SURVEY = {
  source: {
    title: "من أين عرفت غِراس؟",
    hint: "يساعدنا هذا على الوصول لأسر مثلكم.",
    multi: false,
    options: {
      snapchat: "سناب شات", instagram: "إنستغرام", tiktok: "تيك توك", x: "إكس (تويتر)",
      google: "بحث في Google", friend: "صديق أو قريب", school: "المدرسة أو معلمة", whatsapp: "مجموعة واتساب",
    },
  },
  goal: {
    title: "ما هدفك الأساسي من غِراس؟",
    hint: "اختر الأقرب، ويمكنك الكتابة إن لم تجده.",
    multi: false,
    options: {
      grades: "رفع درجات ابني", foundation: "سد الفجوات والتأسيس", followup: "متابعة المنهج والواجبات أولاً بأول",
      exams: "الاستعداد للاختبارات", confidence: "بناء الثقة وحب التعلم",
    },
  },
  needs: {
    title: "في أي جانب يحتاج ابنك الدعم أكثر؟",
    hint: "يمكنك اختيار أكثر من إجابة.",
    multi: true,
    options: {
      math: "الرياضيات", arabic: "لغتي", science: "العلوم", reading: "القراءة والكتابة",
      study: "تنظيم المذاكرة والوقت", focus: "التركيز والانتباه",
    },
  },
  expectations: {
    title: "ماذا تتوقع أن يتحقق بعد البرنامج؟",
    hint: "يمكنك اختيار أكثر من إجابة، وسنعمل عليها مع المعلمة.",
    multi: true,
    options: {
      better_grades: "تحسن واضح في الدرجات", understanding: "فهم أعمق بدل الحفظ", independence: "اعتماد ابني على نفسه في المذاكرة",
      reports: "معرفة مستواه بوضوح", love: "أن يحب المادة ويستمتع بالتعلم",
    },
  },
} as const;

export type SurveyKey = keyof typeof SURVEY;
export const SURVEY_STEPS = Object.keys(SURVEY) as SurveyKey[];

export function label(key: SurveyKey, value: string) {
  return (SURVEY[key].options as Record<string, string>)[value] ?? value;
}
