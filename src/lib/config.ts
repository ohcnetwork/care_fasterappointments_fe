const SLUG = "care_fasterappointments_fe";

interface FlowConfig {
  auto_create_invoice?: boolean;
  redirect_to_invoice?: boolean;
  mark_balanced_on_full_payment?: boolean;
  collect_payment_on_appointment_page?: boolean;
  print_invoice_on_appointment_page?: boolean;
  payment_methods?: string[];
}

/** Plugin settings from the `plug_config` meta (`meta.config`), read lazily as the host sets them after load. */
export function getFlowConfig(): FlowConfig {
  const meta = window.__CARE_PLUGIN_RUNTIME__?.meta?.[SLUG];
  return (meta?.config ?? {}) as FlowConfig;
}
