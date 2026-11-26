"use client";
import { useActionState, useState } from "react";
import { createStaffAction, createTeacherAction, updateStaffAction } from "../team-actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { GRADES, SUBJECTS } from "@/lib/domain";
import { ALL_PERMISSIONS, PERMISSIONS, STAFF_ROLES, STAFF_ROLE_KEYS, type StaffRole } from "@/lib/permissions";

/** Role picker + optional per-person permission ticks (defaults come from the role). */
function RoleAndPerms({ role: initialRole = "support", custom: initialCustom = null }: { role?: StaffRole; custom?: string[] | null }) {
  const [role, setRole] = useState<StaffRole>(initialRole);
  const [custom, setCustom] = useState(initialCustom !== null);
  const [perms, setPerms] = useState<string[]>(initialCustom ?? [...STAFF_ROLES[initialRole].perms]);
  const pick = (r: StaffRole) => { setRole(r); if (!custom) setPerms([...STAFF_ROLES[r].perms]); };
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 font-medium">الدور</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {STAFF_ROLE_KEYS.map((r) => (
            <label key={r} className="flex cursor-pointer gap-3 rounded-xl border-[1.5px] border-line bg-white p-3 has-[:checked]:border-lav-600 has-[:checked]:bg-lav-100/60">
              <input type="radio" name="staff_role" value={r} checked={role === r} onChange={() => pick(r)} className="mt-1 accent-lav-700" />
              <span><span className="block font-medium">{STAFF_ROLES[r].label}</span><span className="block text-sm text-muted">{STAFF_ROLES[r].hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-[.95rem]">
        <input type="checkbox" name="custom" checked={custom} onChange={(e) => { setCustom(e.target.checked); if (!e.target.checked) setPerms([...STAFF_ROLES[role].perms]); }} className="accent-lav-700" />
        تخصيص الصلاحيات لهذا الشخص
      </label>
      <fieldset disabled={!custom} className="grid gap-2 rounded-xl bg-wash p-4 sm:grid-cols-2 disabled:opacity-70">
        <legend className="sr-only">الصلاحيات</legend>
        {ALL_PERMISSIONS.map((p) => (
          <label key={p} className="flex items-start gap-2 text-[.93rem]">
            <input type="checkbox" name="perms" value={p} checked={perms.includes(p)} className="mt-1 accent-lav-700"
              onChange={(e) => setPerms((x) => (e.target.checked ? [...x, p] : x.filter((y) => y !== p)))} />
            {PERMISSIONS[p]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export function AddStaffForm() {
  const [state, action] = useActionState(createStaffAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="full_name" label="الاسم" required state={state} />
        <Field name="email" label="البريد" type="email" dir="ltr" required state={state} />
        <Field name="phone" label="الجوال (اختياري)" dir="ltr" inputMode="tel" state={state} />
      </div>
      <RoleAndPerms />
      <SubmitButton className="btn btn-primary" pending="جارٍ الإضافة...">إضافة للفريق</SubmitButton>
    </form>
  );
}

export function EditStaffForm({ id, role, permissions }: { id: string; role: StaffRole; permissions: string[] | null }) {
  const [state, action] = useActionState(updateStaffAction, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <RoleAndPerms role={role} custom={permissions} />
      <SubmitButton className="btn btn-primary btn-sm" pending="جارٍ الحفظ...">حفظ</SubmitButton>
    </form>
  );
}

export function AddTeacherForm() {
  const [state, action] = useActionState(createTeacherAction, {});
  const chosen = (state.values?.subjects ?? "").split(",");
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="full_name" label="اسم المعلمة" required state={state} />
        <Field name="email" label="البريد" type="email" dir="ltr" required state={state} />
        <Field name="phone" label="الجوال" dir="ltr" inputMode="tel" required state={state} />
      </div>
      <fieldset>
        <legend className="mb-2 font-medium">المواد</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SUBJECTS).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 rounded-full border-[1.5px] border-line px-4 py-2 has-[:checked]:border-lav-400 has-[:checked]:bg-lav-100">
              <input type="checkbox" name="subjects" value={k} defaultChecked={chosen.includes(k)} className="accent-lav-700" />{l}
            </label>
          ))}
        </div>
        <FieldErrorText state={state} name="subjects" />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-4">
        {(["min_grade", "max_grade"] as const).map((n, i) => (
          <div key={n} className="field">
            <label htmlFor={n}>{i === 0 ? "من الصف" : "إلى الصف"}</label>
            <select id={n} name={n} className="input" defaultValue={state.values?.[n] ?? (i === 0 ? "1" : "9")}>
              {Object.entries(GRADES).map(([g, l]) => <option key={g} value={g}>{l}</option>)}
            </select>
            <FieldErrorText state={state} name={n} />
          </div>
        ))}
        <Field name="years_experience" label="سنوات الخبرة" inputMode="numeric" defaultValue="0" state={state} />
        <Field name="qualification" label="المؤهل" required state={state} />
      </div>
      <div className="field">
        <label htmlFor="t-bio">نبذة تظهر لأولياء الأمور</label>
        <textarea id="t-bio" name="bio" className="input" rows={3} maxLength={1500} defaultValue={state.values?.bio} />
        <FieldErrorText state={state} name="bio" />
      </div>
      <Field name="teams_link" label="رابط Teams دائم (اختياري)" dir="ltr" state={state} hint="لا يلزم بعد تفعيل الروابط التلقائية." />
      <SubmitButton className="btn btn-primary" pending="جارٍ الإضافة...">إضافة المعلمة معتمدة</SubmitButton>
    </form>
  );
}
