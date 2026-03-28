import { z } from 'zod';
import type {
  CompanyRow,
  FaqRow,
  IntakeFlowRow,
  RuleRow,
  ServiceAreaRow,
  ServiceRow,
  SheetData,
  SmsRow
} from './types.js';
import { areaMatchesPrefix, scoreKeywordMatch, uniqueBy } from './helpers.js';

export const rulesApplicableSchema = z.object({
  companyId: z.string().default('rapidflow_london'),
  issueSummary: z.string().min(2),
  postcode: z.string().optional().default(''),
  waterActive: z.boolean().optional(),
  electricsRisk: z.boolean().optional(),
  sewageRisk: z.boolean().optional(),
  onlyToiletUnusable: z.boolean().optional(),
  noWater: z.boolean().optional(),
  vulnerablePerson: z.boolean().optional()
});

export const logCallSchema = z.object({
  companyId: z.string().default('rapidflow_london'),
  callId: z.string().min(1),
  intent: z.string().default('plumbing_enquiry'),
  priority: z.string().default('P3'),
  emergencyFlag: z.enum(['Yes', 'No']).default('No'),
  name: z.string().min(1),
  phone: z.string().min(1),
  postcode: z.string().default(''),
  issueSummary: z.string().min(2),
  actionTaken: z.string().min(1),
  smsSent: z.string().default(''),
  escalatedTo: z.string().default(''),
  status: z.string().default('open')
});

export const sendSmsSchema = z.object({
  companyId: z.string().default('rapidflow_london'),
  to: z.string().min(8),
  templateId: z.string().min(1),
  callId: z.string().optional().default(''),
  name: z.string().optional().default(''),
  issueSummary: z.string().optional().default(''),
  postcode: z.string().optional().default('')
});

export const escalateHumanSchema = z.object({
  companyId: z.string().default('rapidflow_london'),
  callId: z.string().min(1),
  reason: z.string().min(1),
  priority: z.string().default('P2'),
  callerPhone: z.string().min(1),
  issueSummary: z.string().optional().default(''),
  name: z.string().optional().default('')
});

function intakeStepOrder(step: string | number): number {
  const n = Number(step);
  return Number.isFinite(n) ? n : 999;
}

function intakeMatchesAskWhen(row: IntakeFlowRow, askWhenFilter: string | undefined): boolean {
  if (!askWhenFilter?.trim()) return true;
  const w = String(row.ask_when || '').trim().toLowerCase();
  if (!w || w === 'always' || w === 'all') return true;
  const f = askWhenFilter.trim().toLowerCase();
  return w === f || w.includes(f);
}

function getCompany(data: SheetData, companyId: string): CompanyRow {
  const company = data.company.find((row) => row.company_id === companyId);
  if (!company) throw new Error(`Company not found: ${companyId}`);
  return company;
}

export function assertCompanyExists(data: SheetData, companyId: string): void {
  getCompany(data, companyId);
}

function getSmsById(data: SheetData, companyId: string, templateId: string): SmsRow | undefined {
  return data.sms.find((row) => row.company_id === companyId && row.template_id === templateId);
}

export function resolveSmsTemplate(data: SheetData, companyId: string, templateId: string): SmsRow {
  const row = getSmsById(data, companyId, templateId);
  if (!row) throw new Error(`SMS template not found: ${templateId}`);
  return row;
}

function detectCoverage(serviceAreas: ServiceAreaRow[], postcode?: string) {
  if (!postcode) {
    return {
      inArea: null,
      areaName: null,
      emergencyCoverage: 'Unknown',
      standardCoverage: 'Unknown'
    };
  }

  const area = serviceAreas.find((row) => areaMatchesPrefix(postcode, row.postcode_prefixes));
  if (!area) {
    return {
      inArea: false,
      areaName: null,
      emergencyCoverage: 'Unknown',
      standardCoverage: 'Unknown'
    };
  }

  return {
    inArea: area.standard_coverage === 'Yes' || area.emergency_coverage === 'Yes',
    areaName: area.area_name,
    emergencyCoverage: area.emergency_coverage,
    standardCoverage: area.standard_coverage,
    notes: area.notes
  };
}

function detectServices(services: ServiceRow[], companyId: string, issueSummary: string): ServiceRow[] {
  const scored = services
    .filter((row) => row.company_id === companyId)
    .map((row) => ({ row, score: scoreKeywordMatch(issueSummary, `${row.service_name}, ${row.common_customer_words}, ${row.what_it_means}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.row);

  return uniqueBy(scored, (row) => row.service_id).slice(0, 3);
}

function detectRule(data: SheetData, input: z.infer<typeof rulesApplicableSchema>): RuleRow | undefined {
  const base = data.emergencyRules
    .filter((row) => row.company_id === input.companyId)
    .map((row) => ({ row, score: scoreKeywordMatch(input.issueSummary, `${row.scenario}, ${row.trigger_keywords}`) }))
    .sort((a, b) => b.score - a.score);

  const bestKeywordMatch = base.find((item) => item.score > 0)?.row;

  if (input.electricsRisk) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R03') ?? bestKeywordMatch;
  }
  if (input.sewageRisk) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R04') ?? bestKeywordMatch;
  }
  if (input.onlyToiletUnusable) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R06') ?? bestKeywordMatch;
  }
  if (input.noWater) {
    return data.emergencyRules.find((row) => row.company_id === input.companyId && row.rule_id === 'R07') ?? bestKeywordMatch;
  }

  return bestKeywordMatch;
}

function findRelevantFaqs(faqs: FaqRow[], companyId: string, issueSummary: string): FaqRow[] {
  return faqs
    .filter((row) => row.company_id === companyId)
    .map((row) => ({ row, score: scoreKeywordMatch(issueSummary, `${row.topic}, ${row.customer_question}, ${row.approved_answer}`) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.row)
    .slice(0, 3);
}

export function buildIntakeFlow(data: SheetData, companyId: string, askWhen?: string) {
  getCompany(data, companyId);
  const steps = data.intakeFlow
    .filter((row) => row.company_id === companyId)
    .filter((row) => intakeMatchesAskWhen(row, askWhen))
    .sort((a, b) => intakeStepOrder(a.step_no) - intakeStepOrder(b.step_no))
    .map((row) => ({
      stepNo: row.step_no,
      fieldKey: row.field_key,
      askText: row.ask_text,
      askWhen: row.ask_when,
      required: row.required,
      exampleAnswer: row.example_answer,
      notes: row.notes
    }));

  return { companyId, askWhen: askWhen ?? null, steps };
}

export function buildCompanyContext(data: SheetData, companyId: string) {
  const company = getCompany(data, companyId);
  return {
    companyId: company.company_id,
    companyName: company.company_name,
    brandName: company.brand_name,
    phoneNumber: company.phone_number,
    emergencyHours: company.emergency_hours_text,
    standardHours: company.standard_hours_text,
    serviceArea: company.service_area_text,
    bookingLink: company.booking_link,
    paymentMethods: company.payment_methods,
    emergencyCalloutFee: company.emergency_callout_fee_text,
    estimatePolicy: company.estimate_policy,
    warrantyPolicy: company.warranty_policy,
    gasPolicy: company.gas_policy_text,
    safetyDisclaimer: company.safety_disclaimer
  };
}

export function buildServicesSearch(data: SheetData, companyId: string, query: string) {
  return detectServices(data.services, companyId, query).map((service) => ({
    serviceId: service.service_id,
    serviceName: service.service_name,
    category: service.category,
    emergencyEligible: service.emergency_eligible,
    whatItMeans: service.what_it_means,
    defaultPriority: service.default_priority,
    defaultNextStep: service.default_next_step
  }));
}

export function buildRulesApplicable(data: SheetData, rawInput: unknown) {
  const input = rulesApplicableSchema.parse(rawInput);
  const company = getCompany(data, input.companyId);
  const serviceAreas = data.serviceAreas.filter((row) => row.company_id === input.companyId);
  const services = detectServices(data.services, input.companyId, input.issueSummary);
  const rule = detectRule(data, input);
  const coverage = detectCoverage(serviceAreas, input.postcode);
  const faqs = findRelevantFaqs(data.faqs, input.companyId, input.issueSummary);
  const sms = rule ? getSmsById(data, input.companyId, rule.sms_template_id) : undefined;

  let priority = services[0]?.default_priority ?? 'P3';
  let nextStep = services[0]?.default_next_step ?? 'Standard callback';
  let emergency = services[0]?.emergency_eligible === 'Yes';
  let transferNow = false;
  let immediateInstruction = 'Collect the caller details and route to the appropriate next step.';

  if (rule) {
    priority = rule.priority;
    nextStep = rule.agent_action;
    emergency = rule.emergency_flag === 'Yes';
    transferNow = rule.transfer_now === 'Yes';
    immediateInstruction = rule.immediate_instruction;
  }

  if (input.vulnerablePerson && (input.noWater || input.issueSummary.toLowerCase().includes('no hot water'))) {
    priority = priority === 'P3' ? 'P2' : priority;
    emergency = true;
  }

  const gasDetected = /gas leak|gas smell|carbon monoxide|co alarm/i.test(input.issueSummary);
  if (gasDetected) {
    priority = 'Redirect';
    nextStep = company.gas_policy_text;
    emergency = true;
    transferNow = false;
    immediateInstruction = 'Tell the caller to contact the National Gas Emergency Service immediately on 0800 111 999.';
  }

  return {
    companyId: input.companyId,
    issueSummary: input.issueSummary,
    postcode: input.postcode,
    matchedServices: services.map((service) => ({
      serviceId: service.service_id,
      serviceName: service.service_name,
      defaultPriority: service.default_priority,
      defaultNextStep: service.default_next_step
    })),
    priority,
    emergencyFlag: emergency ? 'Yes' : 'No',
    transferNow,
    immediateInstruction,
    recommendedAction: nextStep,
    serviceAreaCheck: coverage,
    smsTemplateId: sms?.template_id ?? '',
    smsTemplateText: sms?.template_text ?? '',
    approvedFaqs: faqs.map((faq) => ({ topic: faq.topic, question: faq.customer_question, answer: faq.approved_answer })),
    safetyDisclaimer: company.safety_disclaimer
  };
}
