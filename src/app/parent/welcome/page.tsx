import { requireRole } from "@/lib/auth";
import { one } from "@/lib/db";
import { safeNext } from "@/lib/validation";
import { SurveyForm } from "./SurveyForm";

export const metadata = { title: "أخبرنا عن ابنك" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireRole("parent");
  const next = safeNext((await searchParams).next) ?? undefined;
  const prev = await one<{ source: string; source_other: string | null; goal: string; goal_other: string | null;
    needs: string[]; needs_other: string | null; expectations: string[]; expectation_other: string | null }>(
    `SELECT * FROM onboarding_surveys WHERE user_id = $1`, [user.id]);
  return (
    <div className="py-4 md:py-10">
      <SurveyForm
        name={user.full_name.split(" ")[0]}
        next={next}
        initial={prev ? {
          source: [prev.source], goal: [prev.goal], needs: prev.needs, expectations: prev.expectations,
          others: { source: prev.source_other ?? "", goal: prev.goal_other ?? "", needs: prev.needs_other ?? "", expectations: prev.expectation_other ?? "" },
        } : undefined}
      />
      <p className="mx-auto mt-12 max-w-2xl text-sm text-muted">إجاباتك تصل للمعلمة قبل حصص ابنك، لتبني الشرح على هدفكم من أول حصة.</p>
    </div>
  );
}
