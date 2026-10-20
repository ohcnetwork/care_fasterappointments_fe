import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  BanknoteArrowUp,
  CircleIcon,
  CreditCard,
  Landmark,
  Loader2,
  Signature,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type Invoice } from "@/lib/appointmentFlow";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, ShortcutBadge } from "@/components/ui";
import { getFlowConfig } from "@/lib/config";
import { type Paginated, request } from "@/utils/api";

// Markup and class names mirror care_fe's PaymentReconciliationSheet so the host's stylesheet applies.

interface Location {
  id: string;
  name: string;
}

interface Props {
  facilityId: string;
  invoice: Invoice;
  onClose: () => void;
}

const PAYMENT_METHODS = [
  { value: "cash", icon: Banknote, label: "cash" },
  { value: "ddpo", icon: Landmark, label: "direct_deposit" },
  { value: "ccca", icon: CreditCard, label: "credit_card" },
  { value: "debc", icon: CreditCard, label: "debit_card" },
  { value: "chck", icon: Signature, label: "check" },
  { value: "cdac", icon: BanknoteArrowUp, label: "credit_account" },
] as const;

const env = () => window.__CORE_ENV__ ?? {};
const precision = (): number => env().decimal?.accountingPrecision ?? 2;

const toCents = (amount: string) => Math.round((Number(amount) || 0) * 100);
const fromCents = (cents: number) => (cents / 100).toFixed(precision());
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});
const money = (amount: string | number) => currency.format(Number(amount) || 0);

const nowLocalInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

// Shared with the host's payment sheet so the last used location carries over.
const locationCacheKey = (facilityId: string) =>
  `payment_reconcilation_location_cache--${facilityId}`;

function readCachedLocation(facilityId: string): Location | null {
  try {
    return JSON.parse(
      localStorage.getItem(locationCacheKey(facilityId)) ?? "null",
    );
  } catch {
    return null;
  }
}

const INPUT_CLASS =
  "flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base shadow-xs transition-colors file:border-0 file:bg-transparent focus:ring-primary-500 focus:border-primary-500 file:text-sm file:font-medium file:text-gray-950 placeholder:text-gray-500 focus-visible:outline-hidden  disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-gray-800 dark:file:text-gray-50 dark:placeholder:text-gray-400 dark:focus-visible:ring-gray-300 duration-300";
const LABEL_CLASS =
  "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 text-gray-950";
const RADIO_CLASS =
  "border-gray-200 text-gray-900 focus-visible:border-gray-950 focus-visible:ring-gray-950/50 aria-invalid:ring-red-500/20 dark:aria-invalid:ring-red-500/40 aria-invalid:border-red-500 dark:bg-gray-200/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-50 dark:focus-visible:border-gray-300 dark:focus-visible:ring-gray-300/50 dark:aria-invalid:ring-red-900/20 dark:dark:aria-invalid:ring-red-900/40 dark:aria-invalid:border-red-900 dark:dark:bg-gray-800/30";
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className={LABEL_CLASS}>{label}</label>
      {children}
      {hint && <p className="text-gray-700 italic text-sm -mt-1.5">{hint}</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const pattern = new RegExp(`^\\d*\\.?\\d{0,${precision()}}$`);
  return (
    <div className="relative">
      <span className="font-medium absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">
        ₹
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={`0.${"0".repeat(precision())}`}
        onChange={(event) => {
          if (pattern.test(event.target.value)) onChange(event.target.value);
        }}
        className={`${INPUT_CLASS} font-bold tracking-widest pl-8`}
      />
    </div>
  );
}

export default function CollectPaymentSheet({
  facilityId,
  invoice,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const locationRequired: boolean = env().paymentLocationRequired ?? true;

  const due = toCents(invoice.total_gross) - toCents(invoice.total_payments ?? "0");
  const allowedMethods = getFlowConfig().payment_methods;
  const methods = PAYMENT_METHODS.filter(
    (option) => !allowedMethods?.length || allowedMethods.includes(option.value),
  );
  const [method, setMethod] = useState<string>(() => {
    const preferred: string | undefined = env().defaultPaymentMethod;
    if (methods.some((option) => option.value === preferred)) return preferred!;
    return methods.length === 1 ? methods[0].value : "";
  });
  const [locationId, setLocationId] = useState(
    () => readCachedLocation(facilityId)?.id ?? "",
  );
  const [amount, setAmount] = useState(fromCents(due));
  const [tendered, setTendered] = useState(fromCents(due));
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(nowLocalInput());
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const isCash = method === "cash";
  const returned = isCash ? Math.max(0, toCents(tendered) - toCents(amount)) : 0;

  const { data: locations } = useQuery({
    queryKey: ["fasterappointments", "payment-locations", facilityId],
    enabled: locationRequired,
    queryFn: () =>
      request<Paginated<Location>>(
        `/api/v1/facility/${facilityId}/location/`,
        "GET",
        undefined,
        {
          mode: "kind",
          status: "active",
          mine: "true",
          ordering: "sort_index",
          limit: 100,
        },
      ),
  });

  // Keep the tendered amount in step with the amount, as the host sheet does.
  useEffect(() => setTendered(amount), [amount]);

  const errors = {
    method: method ? undefined : t("field_required"),
    location: locationRequired && !locationId ? t("field_required") : undefined,
    amount: toCents(amount) > 0 ? undefined : t("field_required"),
    tendered:
      isCash && toCents(tendered) < toCents(amount)
        ? t("tender_amount_cannot_be_less_than_payment_amount")
        : undefined,
    date:
      new Date(paymentDate) > new Date()
        ? t("payment_date_cannot_be_in_future")
        : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors || busy) return;
    setBusy(true);

    try {
      await request(`/api/v1/facility/${facilityId}/payment_reconciliation/`, "POST", {
        reconciliation_type: "payment",
        status: "active",
        kind: "deposit",
        issuer_type: "patient",
        outcome: "complete",
        method,
        payment_datetime: paymentDate,
        amount,
        tendered_amount: isCash ? tendered : amount,
        returned_amount: fromCents(returned),
        target_invoice: invoice.id,
        reference_number: isCash ? "" : reference,
        authorization: "",
        disposition: "",
        note,
        account: invoice.account.id,
        is_credit_note: false,
        location: locationRequired ? locationId || undefined : undefined,
      });
      toast.success(t("fasterappointments__payment_recorded"));

      const location = locations?.results.find((l) => l.id === locationId);
      if (location) {
        localStorage.setItem(locationCacheKey(facilityId), JSON.stringify(location));
      }

      if (toCents(amount) >= due) {
        await request(`/api/v1/facility/${facilityId}/invoice/${invoice.id}/`, "PUT", {
          status: "balanced",
          payment_terms: invoice.payment_terms,
          note: invoice.note,
          account: invoice.account.id,
          charge_items: invoice.charge_items.map((item) => item.id),
          issue_date: invoice.issue_date,
        });
        toast.success(t("fasterappointments__invoice_balanced"));
      }

      for (const key of [
        "invoice",
        "payments",
        "account",
        "accounts",
        "appointment",
        "chargeItems",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      onClose();
    } catch {
      toast.error(t("fasterappointments__payment_failed"));
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed z-50 gap-4 bg-white p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out dark:bg-gray-950 inset-y-0 right-0 h-full w-full border-l border-gray-200 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right max-w-md sm:max-w-lg overflow-y-auto pb-0"
        >
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-gray-950 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-gray-100 dark:ring-offset-gray-950 dark:focus:ring-gray-300 dark:data-[state=open]:bg-gray-800">
            <X className="size-4" />
            <span className="sr-only">{t("close")}</span>
          </Dialog.Close>

          <div className="flex flex-col space-y-2 text-center sm:text-left">
            <Dialog.Title className="text-lg font-semibold text-gray-950 dark:text-gray-50 m-0">
              {t("collect_payment")}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400 text-gray-700">
              {t("recording_payment_for_invoice", { id: invoice.number })}
            </Dialog.Description>
          </div>

          <form onSubmit={submit} className="space-y-6 py-4">
            <div className="space-y-6">
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-3">
                <div className="flex text-sm justify-center text-gray-700">
                  {t("invoice_total")}:
                  <p className="font-bold ml-1">{money(invoice.total_gross)}</p>
                </div>

                <div className="bg-white p-3 text-center">
                  <p className="text-sm text-gray-600 mb-1">{t("amount_due")}</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {money(due / 100)}
                  </p>
                </div>

                <div
                  className="h-4 w-full bg-repeat-x -mt-4"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10.4' height='12' viewBox='2 3 10.4 9' xmlns='http://www.w3.org/2000/svg'%3E%3Cg filter='url(%23filter0_dd_31940_236060)'%3E%3Cpath d='M7.19629 12L12.3924 3H2.00014L7.19629 12Z' fill='white'/%3E%3C/g%3E%3Cdefs%3E%3Cfilter id='filter0_dd_31940_236060' x='-0.803711' y='-1' width='16' height='16' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeFlood flood-opacity='0' result='BackgroundImageFix'/%3E%3CfeColorMatrix in='SourceAlpha' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0' result='hardAlpha'/%3E%3CfeOffset dy='1'/%3E%3CfeGaussianBlur stdDeviation='1'/%3E%3CfeComposite in2='hardAlpha' operator='out'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0'/%3E%3CfeBlend mode='normal' in2='BackgroundImageFix' result='effect1_dropShadow_31940_236060'/%3E%3CfeColorMatrix in='SourceAlpha' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0' result='hardAlpha'/%3E%3CfeOffset dy='1'/%3E%3CfeGaussianBlur stdDeviation='0.5'/%3E%3CfeComposite in2='hardAlpha' operator='out'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.06 0'/%3E%3CfeBlend mode='normal' in2='effect1_dropShadow_31940_236060' result='effect2_dropShadow_31940_236060'/%3E%3CfeBlend mode='normal' in='SourceGraphic' in2='effect2_dropShadow_31940_236060' result='shape'/%3E%3C/filter%3E%3C/defs%3E%3C/svg%3E")`,
                    backgroundSize: "10.4px 12px",
                    backgroundPosition: "center",
                  }}
                />
              </div>

              <div className="grid gap-2">
                <label className={LABEL_CLASS}>{t("payment_method")}</label>
                <RadioGroup.Root
                  value={method}
                  onValueChange={setMethod}
                  className="grid grid-cols-3 gap-3"
                >
                  {methods.map((option) => {
                    const Icon = option.icon;
                    return (
                      <label
                        key={option.value}
                        className="relative flex cursor-pointer flex-col items-center rounded-md border border-gray-400 shadow-sm p-2.5 outline-none has-checked:border-primary-600 has-checked:bg-green-50 gap-2 text-sm leading-none font-medium select-none"
                      >
                        <RadioGroup.Item
                          value={option.value}
                          className={`${RADIO_CLASS} absolute left-2 top-2`}
                          aria-label={`payment-method-${option.value}`}
                        >
                          <RadioGroup.Indicator className="relative flex items-center justify-center">
                            <CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
                          </RadioGroup.Indicator>
                        </RadioGroup.Item>
                        <div className="grid grow justify-items-center gap-1">
                          <Icon className="size-5 text-gray-600" />
                          <span className="text-sm font-medium text-center text-gray-950">
                            {t(option.label)}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup.Root>
                {submitted && errors.method && (
                  <p className="text-red-500 text-sm">{errors.method}</p>
                )}
              </div>

              {locationRequired && (
                <Field
                  label={t("location")}
                  error={submitted ? errors.location : undefined}
                >
                  <select
                    className={`${INPUT_CLASS} w-full border-gray-300`}
                    value={locationId}
                    onChange={(event) => setLocationId(event.target.value)}
                  >
                    <option value="">{t("select_location")}</option>
                    {locations?.results.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field
                label={t("amount_paid")}
                hint={t("amount_to_be_recorded")}
                error={submitted ? errors.amount : undefined}
              >
                <MoneyInput value={amount} onChange={setAmount} />
              </Field>

              {isCash && (
                <div>
                  <Field
                    label={t("amount_received")}
                    hint={t("amount_given_by_customer")}
                    error={submitted ? errors.tendered : undefined}
                  >
                    <MoneyInput value={tendered} onChange={setTendered} />
                  </Field>

                  {returned > 0 && (
                    <div className="rounded-md bg-yellow-50 border border-yellow-500 p-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-yellow-950">
                          {t("change_to_return")}:
                          <span className="font-semibold text-yellow-950 ml-1">
                            {money(returned / 100)}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!isCash && (
                <Field
                  label={
                    <>
                      {t("reference_number")}
                      <span className="text-gray-600 italic">
                        ({t("optional")})
                      </span>
                    </>
                  }
                  hint={t("reference_number_description")}
                >
                  <input
                    className={INPUT_CLASS}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </Field>
              )}

              <Field
                label={t("payment_date")}
                error={submitted ? errors.date : undefined}
              >
                <input
                  type="datetime-local"
                  className={INPUT_CLASS}
                  value={paymentDate}
                  max={nowLocalInput()}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </Field>

              <Field
                label={
                  <>
                    {t("notes")}
                    <span className="text-gray-600 italic">
                      ({t("optional")})
                    </span>
                  </>
                }
              >
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-base shadow-xs transition-colors placeholder:text-gray-500 focus-visible:ring-1 focus-visible:border-primary-500 focus-visible:outline-hidden focus-visible:ring-primary-500 md:text-sm disabled:opacity-50"
                  value={note}
                  placeholder={t("additional_payment_notes")}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 sticky bottom-0 bg-white p-4 border-t border-gray-200 -mx-6">
              <div className="flex justify-between gap-3">
                <button
                  type="button"
                  className={BUTTON_OUTLINE}
                  onClick={onClose}
                  aria-label={t("cancel")}
                >
                  {t("cancel")}
                  <ShortcutBadge actionId="cancel-action" label="ESC" />
                </button>
                <button
                  type="submit"
                  className={BUTTON_PRIMARY}
                  disabled={busy}
                  aria-label={t("record_payment")}
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t("processing_with_dots")}
                    </>
                  ) : (
                    t("record_payment")
                  )}
                  <ShortcutBadge actionId="enter-action" label="ENTER" />
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
