import { one } from "@/lib/db";
import { label } from "@/lib/survey";

/** The parent's survey answers, shown to the teacher (and owner) as lesson context. */
export async function FamilyGoals({ parentId }: { parentId: string }) {
  const s = await one<{ goal: string; goal_other: string | null; needs: string[]; needs_other: string | null;
    expectations: string[]; expectation_other: string | null }>(`SELECT * FROM onboarding_surveys WHERE user_id = $1`, [parentId]);
  if (!s) return null;
  const list = (k: "needs" | "expectations", vals: string[], other: string | null) =>
    vals.filter((v) => v !== "other").map((v) => label(k, v)).concat(other ? [other] : []).join("، ");
  return (
    <section className="mt-6 rounded-xl border-r-4 border-lav-400 bg-wash p-4">
      <h2 className="text-lg font-semibold">هدف الأسرة من غِراس</h2>
      <dl className="mt-2 space-y-1 text-[.95rem]">
        <div><dt className="inline text-muted">الهدف: </dt><dd className="inline">{s.goal === "other" ? s.goal_other : label("goal", s.goal)}</dd></div>
        {s.needs.length > 0 && <div><dt className="inline text-muted">يحتاج الدعم في: </dt><dd className="inline">{list("needs", s.needs, s.needs_other)}</dd></div>}
        {s.expectations.length > 0 && <div><dt className="inline text-muted">يتوقعون: </dt><dd className="inline">{list("expectations", s.expectations, s.expectation_other)}</dd></div>}
      </dl>
    </section>
  );
}
