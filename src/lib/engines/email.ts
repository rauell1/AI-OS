// Deterministic email classification with a confidence score. Used as the
// offline fallback so triage still works with no AI provider configured;
// user corrections (emails.category set by hand) always take precedence.

export type EmailCategory =
  | "NEEDS_RESPONSE" | "APPLICATION" | "SCHOLARSHIP" | "JOB" | "FINANCE"
  | "CLIENT" | "PROJECT" | "NEWSLETTER" | "REFERENCE" | "IMPORTANT" | "LOW_PRIORITY";

export type EmailClassification = {
  category: EmailCategory;
  confidence: number;
  needsResponse: boolean;
  urgency: "low" | "medium" | "high";
  topic?: string;
};

const RULES: { category: EmailCategory; needs: boolean; patterns: RegExp[]; weight: number }[] = [
  { category: "NEEDS_RESPONSE", needs: true, weight: 90, patterns: [/please (confirm|send|provide|review|let us know|advise)/i, /could you/i, /can you/i, /we need/i, /awaiting your/i, /kindly/i, /follow[- ]?up/i, /\?$/m] },
  { category: "APPLICATION", needs: true, weight: 75, patterns: [/application (received|status|update)/i, /your (application|candidacy)/i, /shortlist/i, /unsuccessful/i, /regrett/i, /we would like to (invite|move)/i, /next (round|stage|steps)/i] },
  { category: "SCHOLARSHIP", needs: true, weight: 75, patterns: [/scholarship/i, /fully[- ]funded/i, /master'?s (funding|programme)/i, /erasmus/i, /recommendation letter/i, /motivation (letter|statement)/i] },
  { category: "JOB", needs: true, weight: 70, patterns: [/job (opportunity|opening|vacancy)/i, /your (cv|resume)/i, /recruiter/i, /role at/i, /position at/i, /hiring/i, /opportunity to (join|interview)/i] },
  { category: "FINANCE", needs: false, weight: 60, patterns: [/invoice/i, /payment/i, /receipt/i, /m[- ]pesa/i, /bank transfer/i, /quotation/i, /proforma/i] },
  { category: "CLIENT", needs: true, weight: 65, patterns: [/proposal/i, /scope of work/i, /deliverab/i, /contract/i, /our client/i, /site visit/i] },
  { category: "PROJECT", needs: false, weight: 55, patterns: [/github/i, /pull request/i, /issue/i, /deploy/i, /vercel/i, /build (failed|passed)/i, /commit/i] },
  { category: "NEWSLETTER", needs: false, weight: 85, patterns: [/unsubscribe/i, /newsletter/i, /digest/i, /no[- ]?reply@/i, /mailing list/i, /weekly round[- ]?up/i] },
  { category: "REFERENCE", needs: true, weight: 65, patterns: [/reference/i, /referee/i, /recommendation/i] },
];

export function classifyEmailHeuristic(subject: string, body: string, from?: string): EmailClassification {
  const text = `${subject}\n${body.slice(0, 4000)}`;
  let best: { score: number; rule?: (typeof RULES)[number]; hits: number } = { score: 0, hits: 0 };

  for (const rule of RULES) {
    const hits = rule.patterns.filter((p) => p.test(text)).length;
    if (hits > 0) {
      const score = rule.weight + hits * 3;
      if (score > best.score) best = { score, rule, hits };
    }
  }

  const noReply = /no[-.]?reply|donotreply|notifications@|mailer/i.test(from ?? "");
  if (noReply && best.score < 80) {
    return { category: "LOW_PRIORITY", confidence: 85, needsResponse: false, urgency: "low", topic: subject.slice(0, 80) };
  }

  if (best.rule) {
    const confidence = Math.min(92, best.score);
    return {
      category: best.rule.category,
      confidence,
      needsResponse: best.rule.needs,
      urgency: best.rule.category === "NEEDS_RESPONSE" ? "high" : confidence > 75 ? "medium" : "low",
      topic: subject.slice(0, 80),
    };
  }

  const question = /\?/.test(subject) || /please|urgent|deadline/i.test(text.slice(0, 300));
  return question
    ? { category: "NEEDS_RESPONSE", confidence: 55, needsResponse: true, urgency: "medium", topic: subject.slice(0, 80) }
    : { category: "IMPORTANT", confidence: 40, needsResponse: false, urgency: "low", topic: subject.slice(0, 80) };
}
