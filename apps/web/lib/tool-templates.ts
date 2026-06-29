import type { CustomTool } from "./custom-tools";

/*
 * Reusable, ready-made tool templates for the no-code builder. A non-developer
 * picks one, clicks "Use this template", and it is added to their tools (the
 * same localStorage the builder uses), instantly callable by the live
 * assistant, with the app's governance (routing, PII redaction, eval gates,
 * audit) applied by default.
 *
 * These are deliberately GENERIC: the logic (percentages, deadlines, penalties,
 * standard replies, status lookups) is the same whatever the department or tax
 * type, so every workspace can use them as-is or tweak them. Department-specific
 * facts live in that workspace's uploaded documents (RAG), not in a template.
 */

export interface ToolTemplate {
  category: string;
  blurb: string;
  tool: CustomTool;
}

export const TOOL_TEMPLATES: ToolTemplate[] = [
  // ── Lookups ──
  {
    category: "Lookups",
    blurb: "Explain what each case status means.",
    tool: {
      id: "tpl_case_status",
      kind: "lookup",
      name: "case_status",
      description: "Explain what a case status means (pending, under review, assessed, closed).",
      paramName: "status",
      paramDescription: "pending, under review, info requested, assessed, or closed",
      pairs: [
        { key: "pending", value: "Pending: the case has been received and is awaiting review." },
        { key: "under review", value: "Under review: an officer is actively assessing the case." },
        { key: "info requested", value: "Information requested: waiting on the taxpayer for documents or clarification." },
        { key: "assessed", value: "Assessed: an assessment or decision has been issued." },
        { key: "closed", value: "Closed: no further action is required." },
      ],
      fallback: "Known statuses: pending, under review, info requested, assessed, closed.",
    },
  },
  {
    category: "Lookups",
    blurb: "Route a request type to the right team or channel.",
    tool: {
      id: "tpl_service_channels",
      kind: "lookup",
      name: "service_channels",
      description: "Point a request type to the right team or channel.",
      paramName: "request",
      paramDescription: "payment, registration, appeal, filing, or general",
      pairs: [
        { key: "payment", value: "Payments and refunds are handled by the collections unit, or via the official payment portal." },
        { key: "registration", value: "New and ceased registrations are handled by the registration desk." },
        { key: "appeal", value: "Objections and appeals against an assessment go to the review unit." },
        { key: "filing", value: "Filing and portal-access help is handled by the e-services helpdesk." },
        { key: "general", value: "General enquiries and status checks go to the contact centre." },
      ],
      fallback: "Ask about: payment, registration, appeal, filing, or general.",
    },
  },
  // ── Calculators (sandboxed code) ──
  {
    category: "Calculators",
    blurb: "Apply a rate (any percentage) to an amount.",
    tool: {
      id: "tpl_percentage_of",
      kind: "code",
      name: "percentage_of",
      description: "Apply a percentage, such as a tax rate, to an amount.",
      params: [
        { name: "amount", type: "number", description: "Base amount" },
        { name: "rate", type: "number", description: "Rate as a percentage, e.g. 9" },
      ],
      code: `function run(input) {
  const amount = Number(input.amount) || 0;
  const rate = Number(input.rate) || 0;
  const result = Math.round(amount * rate) / 100;
  return { amount: amount, rate: rate, result: result };
}`,
    },
  },
  {
    category: "Calculators",
    blurb: "Split a tax-inclusive amount into net and tax.",
    tool: {
      id: "tpl_tax_portion",
      kind: "code",
      name: "tax_portion",
      description: "Split a tax-inclusive (gross) amount into its net and tax parts at a given rate.",
      params: [
        { name: "gross", type: "number", description: "Tax-inclusive amount" },
        { name: "rate", type: "number", description: "Tax rate as a percentage, e.g. 9" },
      ],
      code: `function run(input) {
  const gross = Number(input.gross) || 0;
  const rate = Number(input.rate) || 0;
  const tax = Math.round(gross * rate / (100 + rate) * 100) / 100;
  const net = Math.round((gross - tax) * 100) / 100;
  return { gross: gross, rate: rate, tax: tax, net: net };
}`,
    },
  },
  {
    category: "Calculators",
    blurb: "Taxable amount = base minus deductions, floored at zero.",
    tool: {
      id: "tpl_taxable_amount",
      kind: "code",
      name: "taxable_amount",
      description: "Taxable amount: base minus allowable deductions or reliefs, floored at zero (e.g. chargeable income).",
      params: [
        { name: "base", type: "number", description: "Gross base amount (e.g. income or turnover)" },
        { name: "deductions", type: "number", description: "Total allowable deductions or reliefs" },
      ],
      code: `function run(input) {
  const base = Number(input.base) || 0;
  const deductions = Number(input.deductions) || 0;
  const taxable = Math.max(0, base - deductions);
  return { base: base, deductions: deductions, taxable: taxable };
}`,
    },
  },
  {
    category: "Calculators",
    blurb: "Simple interest or penalty on an overdue amount.",
    tool: {
      id: "tpl_late_payment_interest",
      kind: "code",
      name: "late_payment_interest",
      description: "Simple interest or penalty on an overdue amount for a number of days.",
      params: [
        { name: "amount", type: "number", description: "Outstanding amount" },
        { name: "annual_rate", type: "number", description: "Annual interest/penalty rate as a percentage" },
        { name: "days", type: "number", description: "Number of days overdue" },
      ],
      code: `function run(input) {
  const amount = Number(input.amount) || 0;
  const annual_rate = Number(input.annual_rate) || 0;
  const days = Number(input.days) || 0;
  const interest = Math.round(amount * (annual_rate / 100) * (days / 365) * 100) / 100;
  return { amount: amount, interest: interest, total_due: Math.round((amount + interest) * 100) / 100 };
}`,
    },
  },
  {
    category: "Calculators",
    blurb: "Pro-rate an amount over a period.",
    tool: {
      id: "tpl_prorate",
      kind: "code",
      name: "prorate",
      description: "Pro-rate an amount over part of a whole period (e.g. days used out of total days).",
      params: [
        { name: "amount", type: "number", description: "Full-period amount" },
        { name: "part", type: "number", description: "Part of the period (e.g. days used)" },
        { name: "whole", type: "number", description: "Whole period (e.g. total days)" },
      ],
      code: `function run(input) {
  const amount = Number(input.amount) || 0;
  const part = Number(input.part) || 0;
  const whole = Number(input.whole) || 0;
  const prorated = whole === 0 ? 0 : Math.round(amount * part / whole * 100) / 100;
  return { amount: amount, part: part, whole: whole, prorated: prorated };
}`,
    },
  },
  // ── Messages ──
  {
    category: "Messages",
    blurb: "Remind a taxpayer that something is due.",
    tool: {
      id: "tpl_due_date_reminder",
      kind: "template",
      name: "due_date_reminder",
      description: "Compose a due-date reminder.",
      params: [
        { name: "name", type: "string", description: "Taxpayer name" },
        { name: "item", type: "string", description: "What is due, e.g. a return or payment" },
        { name: "deadline", type: "string", description: "Due date" },
      ],
      template:
        "Dear {name}, this is a reminder that your {item} is due by {deadline}. Please complete it on time to avoid late penalties.",
    },
  },
  {
    category: "Messages",
    blurb: "Ask a taxpayer for missing information or documents.",
    tool: {
      id: "tpl_request_information",
      kind: "template",
      name: "request_information",
      description: "Compose a request for missing information or documents.",
      params: [
        { name: "name", type: "string", description: "Taxpayer name" },
        { name: "items", type: "string", description: "What is needed" },
        { name: "due_by", type: "string", description: "Date to respond by" },
      ],
      template:
        "Dear {name}, to continue processing your case we need the following: {items}. Please provide them by {due_by}. Thank you.",
    },
  },
  {
    category: "Messages",
    blurb: "Notify a taxpayer of a decision or outcome.",
    tool: {
      id: "tpl_outcome_notice",
      kind: "template",
      name: "outcome_notice",
      description: "Compose a decision or outcome notice.",
      params: [
        { name: "name", type: "string", description: "Taxpayer name" },
        { name: "reference", type: "string", description: "Case or reference number" },
        { name: "outcome", type: "string", description: "The decision or outcome" },
      ],
      template:
        "Dear {name}, regarding case {reference}: {outcome}. If you have any questions, please reply to this notice.",
    },
  },
];

export const TEMPLATE_CATEGORIES = ["Lookups", "Calculators", "Messages"] as const;
