import { useQueryClient } from "@tanstack/react-query";
import { type ComponentType, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { getFlowConfig } from "@/lib/config";
import { request } from "@/utils/api";

// Structural mirror of the fields read from the host's `InvoiceRead`.
interface Invoice {
  id: string;
  status: string;
  is_refund: boolean;
  total_gross: string;
  total_payments: string;
  payment_terms?: string;
  note?: string;
  issue_date?: string;
  account: { id: string };
  charge_items: { id: string }[];
}

interface Props {
  open: boolean;
  facilityId: string;
  invoice?: Invoice;
  // Injected by the host's override registry.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __base?: ComponentType<any>;
}

const toCents = (amount: string) => Math.round(Number(amount) * 100);

// One attempt per invoice, even across remounts.
const handled = new Set<string>();

export default function PaymentReconciliationSheet({
  __base: Base,
  ...props
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { open, facilityId, invoice } = props;
  // Only act on a payment recorded through this sheet, not on invoices that are merely viewed.
  const wasOpened = useRef(false);
  if (open) wasOpened.current = true;

  useEffect(() => {
    if (!wasOpened.current || !invoice || handled.has(invoice.id)) return;
    if (!getFlowConfig().mark_balanced_on_full_payment) return;
    if (invoice.status !== "issued" || invoice.is_refund) return;

    const gross = toCents(invoice.total_gross);
    if (gross <= 0 || gross - toCents(invoice.total_payments) > 0) return;

    handled.add(invoice.id);
    request(`/api/v1/facility/${facilityId}/invoice/${invoice.id}/`, "PUT", {
      status: "balanced",
      payment_terms: invoice.payment_terms,
      note: invoice.note,
      account: invoice.account.id,
      charge_items: invoice.charge_items.map((item) => item.id),
      issue_date: invoice.issue_date,
    })
      .then(() => {
        toast.success(t("fasterappointments__invoice_balanced"));
        for (const key of [
          "invoice",
          "medication_dispense",
          "accounts",
          "chargeItems",
        ]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      })
      .catch(() => handled.delete(invoice.id));
  }, [open, facilityId, invoice, queryClient, t]);

  return Base ? <Base {...props} /> : null;
}
