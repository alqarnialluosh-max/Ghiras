"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { SURVEY } from "@/lib/survey";
import { fail, safeNext, type ActionState } from "@/lib/validation";

const keys = <K extends keyof typeof SURVEY>(k: K) => Object.keys(SURVEY[k].options) as [string, ...string[]];
const other = z.string().trim().max(200).optional().transform((v) => v || null);

const schema = z.object({
  source: z.enum([...keys("source"), "other"], { message: "اختر من أين عرفتنا" }),
  source_other: other,
  goal: z.enum([...keys("goal"), "other"], { message: "اختر هدفك" }),
  goal_other: other,
  needs: z.array(z.enum([...keys("needs"), "other"])).max(10),
  needs_other: other,
  expectations: z.array(z.enum([...keys("expectations"), "other"])).max(10),
  expectation_other: other,
});

export async function saveSurveyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const parsed = schema.safeParse({
    source: fd.get("source"), source_other: fd.get("source_other") ?? undefined,
    goal: fd.get("goal"), goal_other: fd.get("goal_other") ?? undefined,
    needs: fd.getAll("needs"), needs_other: fd.get("needs_other") ?? undefined,
    expectations: fd.getAll("expectations"), expectation_other: fd.get("expectation_other") ?? undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "أكمل الإجابات.");
  const d = parsed.data;
  if (d.source === "other" && !d.source_other) return fail("اكتب من أين عرفتنا.");
  if (d.goal === "other" && !d.goal_other) return fail("اكتب هدفك.");
  await q(
    `INSERT INTO onboarding_surveys (user_id, source, source_other, goal, goal_other, needs, needs_other, expectations, expectation_other)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id) DO UPDATE SET source = EXCLUDED.source, source_other = EXCLUDED.source_other, goal = EXCLUDED.goal,
       goal_other = EXCLUDED.goal_other, needs = EXCLUDED.needs, needs_other = EXCLUDED.needs_other,
       expectations = EXCLUDED.expectations, expectation_other = EXCLUDED.expectation_other`,
    [user.id, d.source, d.source === "other" ? d.source_other : null, d.goal, d.goal === "other" ? d.goal_other : null,
     d.needs, d.needs.includes("other") ? d.needs_other : null, d.expectations, d.expectations.includes("other") ? d.expectation_other : null],
  );
  await audit("survey.submit", "user", user.id, user.id, { source: d.source, goal: d.goal });
  redirect(safeNext(fd.get("next")) ?? "/parent?welcome=1");
}

export async function skipSurveyAction(fd: FormData) {
  const user = await requireRole("parent");
  await q(`UPDATE users SET survey_skipped_at = now() WHERE id = $1`, [user.id]);
  redirect(safeNext(fd.get("next")) ?? "/parent?welcome=1");
}
