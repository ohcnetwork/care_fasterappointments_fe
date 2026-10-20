import { lazy } from "react";

// Structural mirror of care_fe's `PluginManifest` (src/pluginTypes.ts).
interface Manifest {
  plugin: string;
  extends: string[];
  overrides: {
    component: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replacement: React.LazyExoticComponent<React.ComponentType<any>>;
    condition?: { custom?: (context: { route?: string }) => boolean };
    description?: string;
  }[];
}

// Patient pages that mount the Book Appointment sheet, excluding the appointment detail (reschedule) page.
const BOOKING_ROUTE = /^(\/facility\/[^/]+)?\/patient(s\/home|\/[^/]+)/;
const APPOINTMENT_DETAIL_ROUTE = /\/appointments\/[^/]+/;

const manifest: Manifest = {
  plugin: "care_fasterappointments_fe",
  extends: [],
  overrides: [
    {
      component: "AppointmentDetail",
      replacement: lazy(() => import("./components/AppointmentDetail")),
      description:
        "Generates the token and issues the invoice right after an appointment is booked.",
    },
    {
      component: "ScheduleResourceSelector",
      replacement: lazy(() => import("./components/ScheduleResourceSelector")),
      condition: {
        custom: ({ route }) =>
          typeof route === "string" &&
          BOOKING_ROUTE.test(route) &&
          !APPOINTMENT_DETAIL_ROUTE.test(route),
      },
      description:
        "Remembers the last selected practitioner/location/service in the Book Appointment sheet.",
    },
    {
      component: "PaymentReconciliationSheet",
      replacement: lazy(() => import("./components/PaymentReconciliationSheet")),
      description:
        "Marks an invoice as balanced once a payment recorded through the sheet covers it in full.",
    },
  ],
};

export default manifest;
