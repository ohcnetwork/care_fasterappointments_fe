import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Banknote, FileText, Printer } from "lucide-react";
import {
  type ComponentType,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { navigate, usePath, useQueryParams } from "raviger";
import { toast } from "sonner";

import {
  createAndIssueInvoice,
  findInvoice,
  hasBillableChargeItems,
  type Invoice,
  runAppointmentFlow,
} from "@/lib/appointmentFlow";
import { getFlowConfig } from "@/lib/config";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, ShortcutBadge } from "./ui";

const CollectPaymentSheet = lazy(() => import("./CollectPaymentSheet"));

interface Props {
  appointmentId: string;
  // Injected by the host's override registry.
  __base?: ComponentType<{ appointmentId: string }>;
}

// Survives remounts and StrictMode double effects; one run per appointment.
const handled = new Set<string>();

export default function AppointmentDetail({ __base: Base, ...props }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const path = usePath();
  const [{ showSuccess }] = useQueryParams();
  const [sheetInvoice, setSheetInvoice] = useState<Invoice | null>(null);
  const facilityId = path?.match(/^\/facility\/([^/]+)\//)?.[1];
  const { appointmentId } = props;

  const config = getFlowConfig();
  // Redirecting to the invoice page takes precedence over in-page payment.
  const collectInPage =
    !!config.collect_payment_on_appointment_page && !config.redirect_to_invoice;
  const printEnabled = !!config.print_invoice_on_appointment_page;
  const autoInvoice = config.auto_create_invoice !== false;

  // Under the host's ["chargeItems", facilityId, appointmentId] prefix so its invalidations refresh this too.
  const { data: appointmentInvoice } = useQuery({
    queryKey: ["chargeItems", facilityId, appointmentId, "flow-invoice"],
    queryFn: () => findInvoice(facilityId!, appointmentId),
    enabled: (collectInPage || printEnabled || !autoInvoice) && !!facilityId,
  });
  const { data: hasBillable } = useQuery({
    queryKey: ["chargeItems", facilityId, appointmentId, "flow-billable"],
    queryFn: () => hasBillableChargeItems(facilityId!, appointmentId),
    enabled: !autoInvoice && !!facilityId,
  });
  const pendingPayment =
    collectInPage && appointmentInvoice?.status === "issued";
  // `null` means the invoice lookup finished and found none.
  const canCreateInvoice =
    !autoInvoice && appointmentInvoice === null && !!hasBillable;

  const onInvoiceIssued = useCallback(
    (invoice: Invoice, patientId: string) => {
      toast.success(t("fasterappointments__invoice_issued"));
      queryClient.invalidateQueries({
        queryKey: ["chargeItems", facilityId, appointmentId],
      });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });

      const flowConfig = getFlowConfig();
      if (flowConfig.redirect_to_invoice) {
        const sourceUrl = `/facility/${facilityId}/patient/${patientId}/appointments/${appointmentId}`;
        navigate(
          `/facility/${facilityId}/billing/invoices/${invoice.id}/pay?sourceUrl=${encodeURIComponent(sourceUrl)}`,
        );
      } else if (flowConfig.collect_payment_on_appointment_page) {
        setSheetInvoice(invoice);
      }
    },
    [facilityId, appointmentId, queryClient, t],
  );

  const { mutate: createInvoice, isPending: creatingInvoice } = useMutation({
    mutationFn: () => createAndIssueInvoice(facilityId!, appointmentId),
    onSuccess: ({ invoice, patientId }) => {
      if (invoice) onInvoiceIssued(invoice, patientId);
      else toast.error(t("fasterappointments__invoice_failed"));
    },
    onError: () => toast.error(t("fasterappointments__invoice_failed")),
  });

  useEffect(() => {
    if (!showSuccess || !facilityId || handled.has(appointmentId)) return;
    handled.add(appointmentId);

    runAppointmentFlow(facilityId, appointmentId, autoInvoice)
      .then(({ tokenGenerated, invoice, patientId }) => {
        if (tokenGenerated)
          toast.success(t("fasterappointments__token_generated"));
        if (tokenGenerated) {
          queryClient.invalidateQueries({
            queryKey: ["appointment", appointmentId],
          });
        }
        if (invoice) onInvoiceIssued(invoice, patientId);
      })
      .catch(() => handled.delete(appointmentId));
  }, [
    showSuccess,
    facilityId,
    appointmentId,
    autoInvoice,
    queryClient,
    onInvoiceIssued,
    t,
  ]);

  const showBar =
    canCreateInvoice ||
    (appointmentInvoice && (pendingPayment || printEnabled));

  return (
    <>
      {Base ? <Base {...props} /> : null}
      {!sheetInvoice && showBar && (
        <div
          role="alert"
          className="text-sm grid grid-cols-[0_1fr] gap-y-0.5 items-start fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-full mx-auto shadow-lg rounded-lg p-0 bg-white border border-gray-200"
        >
          <div className="col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight flex items-center justify-between gap-0">
            {canCreateInvoice ? (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-l-lg p-4 flex-1">
                <FileText className="size-5 text-orange-600" />
                <span className="font-semibold text-orange-900">
                  {t("fasterappointments__invoice_not_created")}
                </span>
              </div>
            ) : pendingPayment ? (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-l-lg p-4 flex-1">
                <Banknote className="size-5 text-orange-600" />
                <span className="font-semibold text-orange-900">
                  {t("payment_pending")}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-l-lg p-4 flex-1">
                <BadgeCheck className="size-5 text-green-600" />
                <span className="font-semibold text-green-900">
                  {appointmentInvoice?.status === "balanced"
                    ? t("paid")
                    : t("invoice_alert_title")}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-white rounded-r-lg p-2 pl-0">
              {canCreateInvoice && (
                <button
                  type="button"
                  className={`${BUTTON_PRIMARY} shadow ml-2`}
                  disabled={creatingInvoice}
                  onClick={() => createInvoice()}
                >
                  {t("fasterappointments__create_and_issue_invoice")}
                  <ShortcutBadge actionId="enter-action" label="ENTER" />
                </button>
              )}
              {printEnabled && !pendingPayment && appointmentInvoice && (
                <a
                  href={`/facility/${facilityId}/billing/invoice/${appointmentInvoice.id}/print`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(e.currentTarget.getAttribute("href")!);
                  }}
                  className={`${BUTTON_OUTLINE} ml-2`}
                >
                  <Printer />
                  {t("print_invoice")}
                  <ShortcutBadge actionId="enter-action" label="ENTER" />
                </a>
              )}
              {pendingPayment && appointmentInvoice && (
                <button
                  type="button"
                  className={`${BUTTON_PRIMARY} shadow ml-2`}
                  onClick={() => setSheetInvoice(appointmentInvoice)}
                >
                  {t("collect_payment")}
                  <ShortcutBadge actionId="enter-action" label="ENTER" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {sheetInvoice && facilityId && (
        <Suspense fallback={null}>
          <CollectPaymentSheet
            facilityId={facilityId}
            invoice={sheetInvoice}
            onClose={() => setSheetInvoice(null)}
          />
        </Suspense>
      )}
    </>
  );
}
