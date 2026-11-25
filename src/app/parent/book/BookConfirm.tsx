"use client";
import { useActionState } from "react";
import { bookAction } from "../actions";
import { FormMessage, SubmitButton } from "@/components/forms";

type T = { id: string; name: string; bio: string; years: number; qualification: string };

export function BookConfirm({ subscriptionId, studentId, subject, date, minute, teachers, summary }: {
  subscriptionId: string; studentId: string; subject: string; date: string; minute: number; teachers: T[]; summary: string;
}) {
  const [state, action] = useActionState(bookAction, {});
  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="subscription_id" value={subscriptionId} />
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="subject" value={subject} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="minute" value={minute} />

      <fieldset>
        <legend className="sr-only">اختر المعلمة</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {teachers.map((t, i) => (
            <label key={t.id} className="panel cursor-pointer p-5 has-[:checked]:border-lav-600 has-[:checked]:bg-lav-100/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500">
              <input type="radio" name="teacher_id" value={t.id} defaultChecked={i === 0} className="sr-only" />
              <span className="flex items-center justify-between">
                <span className="font-semibold">{t.name}</span>
                {t.years > 0 && <span className="chip">{t.years} سنوات خبرة</span>}
              </span>
              {t.qualification && <span className="mt-1 block text-sm text-muted">{t.qualification}</span>}
              {t.bio && <span className="mt-2 block line-clamp-3 text-[.92rem]">{t.bio}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="description">ما الذي تودّون التركيز عليه في الحصة؟ (يظهر للمعلمة)</label>
        <textarea id="description" name="description" className="input" maxLength={1000}
          placeholder="مثلاً: مراجعة درس الكسور وحل واجب صفحة 42" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-wash p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[.95rem]">{summary}</p>
        <SubmitButton className="btn btn-primary" pending="جارٍ الحجز...">أكّد الحجز</SubmitButton>
      </div>
      <p className="text-sm text-muted">لا تُلغى الحصص المؤكدة من الموقع. وإذا طرأ ظرف، تواصل مع الإدارة قبل الموعد لإعادة الجدولة.</p>
    </form>
  );
}
