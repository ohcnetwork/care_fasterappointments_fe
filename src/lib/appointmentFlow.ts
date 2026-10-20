import { type Paginated, request } from "@/utils/api";

// Structural mirrors of the care_fe types; only the fields read here.
interface Appointment {
  id: string;
  status: string;
  resource_type: string;
  token: unknown | null;
  patient: { id: string };
}

interface TokenCategory {
  id: string;
  default: boolean;
}

interface IdOnly {
  id: string;
}

// Fields read from the issued `InvoiceRead`.
export interface Invoice {
  id: string;
  number: string;
  status: string;
  total_gross: string;
  total_payments?: string;
  payment_terms?: string;
  note?: string;
  issue_date?: string;
  account: { id: string };
  charge_items: { id: string }[];
}

const FINAL_STATUSES = [
  "cancelled",
  "entered_in_error",
  "rescheduled",
  "noshow",
  "fulfilled",
];

export interface AppointmentFlowResult {
  tokenGenerated: boolean;
  invoice: Invoice | null;
  patientId: string;
}

async function generateToken(facilityId: string, appointment: Appointment) {
  if (appointment.token || FINAL_STATUSES.includes(appointment.status)) {
    return false;
  }

  const categories = await request<Paginated<TokenCategory>>(
    `/api/v1/facility/${facilityId}/token/category/`,
    "GET",
    undefined,
    { resource_type: appointment.resource_type },
  );
  // Fall back to the only category when none is marked default.
  const category =
    categories.results.find((c) => c.default) ??
    (categories.results.length === 1 ? categories.results[0] : undefined);
  if (!category) return false;

  await request(
    `/api/v1/facility/${facilityId}/appointments/${appointment.id}/generate_token/`,
    "POST",
    { category: category.id, note: "" },
  );
  return true;
}

async function issueInvoice(
  facilityId: string,
  appointment: Appointment,
): Promise<Invoice | null> {
  // Only billable items are returned, so a re-run never double-bills.
  const chargeItems = await request<Paginated<IdOnly>>(
    `/api/v1/facility/${facilityId}/charge_item/`,
    "GET",
    undefined,
    {
      service_resource: "appointment",
      service_resource_id: appointment.id,
      status: "billable",
      limit: 100,
    },
  );
  if (chargeItems.results.length === 0) return null;

  const accounts = await request<Paginated<IdOnly>>(
    `/api/v1/facility/${facilityId}/account/`,
    "GET",
    undefined,
    {
      patient: appointment.patient.id,
      status: "active",
      billing_status: "open",
      limit: 1,
    },
  );
  const account = accounts.results[0];
  if (!account) return null;

  const body = {
    account: account.id,
    charge_items: chargeItems.results.map((item) => item.id),
  };
  const draft = await request<IdOnly>(
    `/api/v1/facility/${facilityId}/invoice/`,
    "POST",
    { ...body, status: "draft" },
  );
  const issued = await request<Invoice>(
    `/api/v1/facility/${facilityId}/invoice/${draft.id}/`,
    "PUT",
    { ...body, status: "issued", issue_date: new Date().toISOString() },
  );
  return issued;
}

/** The appointment's issued (pending) or balanced (paid) invoice, if any. */
export async function findInvoice(
  facilityId: string,
  appointmentId: string,
): Promise<Invoice | null> {
  const chargeItems = await request<
    Paginated<{ paid_invoice?: { id: string; status: string } | null }>
  >(`/api/v1/facility/${facilityId}/charge_item/`, "GET", undefined, {
    service_resource: "appointment",
    service_resource_id: appointmentId,
    limit: 100,
  });
  const invoiceId = chargeItems.results.find(
    (item) =>
      item.paid_invoice?.status === "issued" ||
      item.paid_invoice?.status === "balanced",
  )?.paid_invoice?.id;
  if (!invoiceId) return null;

  return request<Invoice>(
    `/api/v1/facility/${facilityId}/invoice/${invoiceId}/`,
  );
}

/** Token and invoice are independent: one failing does not block the other. */
export async function runAppointmentFlow(
  facilityId: string,
  appointmentId: string,
): Promise<AppointmentFlowResult> {
  const appointment = await request<Appointment>(
    `/api/v1/facility/${facilityId}/appointments/${appointmentId}/`,
  );

  const [token, invoice] = await Promise.allSettled([
    generateToken(facilityId, appointment),
    issueInvoice(facilityId, appointment),
  ]);

  return {
    tokenGenerated: token.status === "fulfilled" && token.value,
    invoice: invoice.status === "fulfilled" ? invoice.value : null,
    patientId: appointment.patient.id,
  };
}
