# care_fasterappointments_fe

A [care_fe](https://github.com/ohcnetwork/care_fe) plugin that streamlines the front-desk flow after an
appointment is booked: it generates the token, issues the invoice, collects the payment and marks the invoice as
balanced, all from the appointment page. It loads at runtime through Vite Module Federation and works purely by
overriding registered `care_fe` components, so it needs no change to `care_fe` itself.

## Features

| Feature                              | What it does                                                                                                                                                  | Enabled by                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Auto token                           | Right after booking (`?showSuccess=true`), generates a token with the facility's default token category (or the only category if none is default).            | Always on                                   |
| Auto invoice                         | Issues an invoice for the appointment's billable charge items on the patient's open account. Skipped if there are no charge items or no open account.         | Always on                                   |
| Redirect to invoice                  | After the invoice is issued, opens the invoice's record-payment page (`/pay`), with `sourceUrl` pointing back to the appointment.                             | `redirect_to_invoice`                       |
| Collect payment on appointment page  | Opens a payment sheet (same look as the host's Collect Payment sheet) on the appointment page. A payment that covers the invoice also marks it as balanced.   | `collect_payment_on_appointment_page`       |
| Payment pending bar                  | If the sheet is closed without paying, a "Payment Pending" bar with a Collect Payment button stays at the bottom of the appointment page until it is paid.    | `collect_payment_on_appointment_page`       |
| Print invoice                        | Adds a "Print Invoice" button to the bottom bar when the invoice is paid (or issued and not being collected in the page). Opens the host's invoice print page. | `print_invoice_on_appointment_page`         |
| Auto-balance on invoice page         | On the host's own record-payment sheet, marks the invoice as balanced once a payment covers it in full.                                                       | `mark_balanced_on_full_payment`             |
| Restrict payment methods             | Limits which payment methods the appointment-page sheet offers.                                                                                               | `payment_methods`                           |
| Remember last practitioner/location  | In the Book Appointment sheet, preselects the last chosen practitioner, location or healthcare service, per facility and resource type.                       | Always on (patient pages only)              |

Each step is independent: if one fails (for example the token), the others still run. Re-running is safe because
only `billable` charge items are invoiced.

### Appointment-page payment sheet

- Fields: payment method (card grid), amount paid (prefilled with the amount due), amount received and
  change to return (cash), reference number (non-cash), payment date, notes, and location.
- The location field is shown only when the host's `REACT_PAYMENT_LOCATION_REQUIRED` is true (the default). It
  lists the locations you can access and preselects the last one used in the host's payment sheet.
- A payment is always recorded as a patient payment. If the amount is at least the amount due, the invoice is
  marked as balanced; a smaller amount only records the payment and the invoice stays issued.
- The host's `REACT_DEFAULT_PAYMENT_METHOD` is preselected when it is among the offered methods; a single offered
  method is always preselected.
- Redirecting to the invoice page takes precedence: if `redirect_to_invoice` is on, the in-page sheet and the
  pending bar are not shown.

### Keyboard shortcuts

The plugin uses the host's shortcut system (badges with `data-shortcut-id`; the host's handler clicks the
matching button).

| Key     | Where                                  | Action                              |
| ------- | -------------------------------------- | ----------------------------------- |
| `Enter` | Appointment page (nothing open)        | Opens the payment sheet, or prints the invoice when paid |
| `Enter` | Payment sheet (not while typing)       | Records the payment                 |
| `Esc`   | Payment sheet                          | Cancels                             |

## Configuration

### Plugin config (`plug_config`)

Settings live in the plugin's `plug_config` meta under `config`, read at runtime (no rebuild needed). The slug is
`care_fasterappointments_fe`. Edit it on the host's PlugConfig admin page, or through `POST` / `PUT /api/v1/plug_config/`.
Build-time plugins from `REACT_ENABLED_APPS` are read-only, but `config` from the API entry is merged in.

```json
{
  "slug": "care_fasterappointments_fe",
  "meta": {
    "url": "http://localhost:10126/assets/remoteEntry.js",
    "name": "care_fasterappointments_fe",
    "config": {
      "redirect_to_invoice": false,
      "collect_payment_on_appointment_page": true,
      "mark_balanced_on_full_payment": true,
      "print_invoice_on_appointment_page": true,
      "payment_methods": ["cash", "debc"]
    }
  }
}
```

| Key                                   | Type       | Default | Description                                                                                                       |
| ------------------------------------- | ---------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `redirect_to_invoice`                 | boolean    | `false` | Open the invoice's `/pay` page after the invoice is issued. Takes precedence over the in-page payment sheet.      |
| `collect_payment_on_appointment_page` | boolean    | `false` | Open the payment sheet on the appointment page after booking, and show the pending bar until the invoice is paid. |
| `print_invoice_on_appointment_page`   | boolean    | `false` | Show the Print Invoice button in the bottom bar.                                                                  |
| `mark_balanced_on_full_payment`       | boolean    | `false` | Auto-mark an invoice as balanced when a payment recorded in the host's own payment sheet covers it in full.       |
| `payment_methods`                     | string[]   | all     | Payment methods offered in the appointment-page sheet. Codes: `cash`, `ddpo` (direct deposit), `ccca` (credit card), `debc` (debit card), `chck` (check), `cdac` (credit account). |

All flags default to off, so enabling the plugin alone only generates the token and issues the invoice.

### Host settings that affect the plugin

| `care_fe` env                      | Effect on the plugin                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `REACT_PAYMENT_LOCATION_REQUIRED`  | When `false`, the location field is hidden and no location is sent.           |
| `REACT_DEFAULT_PAYMENT_METHOD`     | Preselected payment method (if it is among the offered methods).              |
| `REACT_MFE_REGISTERED_COMPONENTS`  | Must include `AppointmentDetail` and `ScheduleResourceSelector` (see below).  |
| `REACT_ENABLED_APPS`               | Loads the plugin (see below).                                                 |

`care_fe` has no setting to restrict payment methods, so `payment_methods` only affects this plugin's sheet; the
host's own sheet still shows all six.

## How it works

The plugin exposes one module, `./manifest`, with three overrides. Each override renders the original host
component through the injected `__base` prop.

| Overridden component         | Scope                                                           | Purpose                                                                          |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `AppointmentDetail`          | Appointment page                                                | Token and invoice flow, payment sheet, pending bar and the print button.         |
| `PaymentReconciliationSheet` | Everywhere the host's sheet is used (already registered by core) | Auto-balance on full payment (`mark_balanced_on_full_payment`).                  |
| `ScheduleResourceSelector`   | Patient pages that open the Book Appointment sheet, not the appointment detail page | Remember the last selected practitioner, location or service.            |

Backend calls (all through the host's `/api/v1/facility/{facility}/...`): `appointments/{id}/` and
`generate_token/`, `token/category/`, `charge_item/`, `account/`, `invoice/` (draft, then issued, then balanced),
`payment_reconciliation/` and `location/`. The plugin sends the staff access token from `localStorage` and uses
`window.CARE_API_URL`, falling back to the page origin when the backend is served from the same origin.

The payment sheet reuses the host's Tailwind class names, so the host stylesheet styles it and the plugin ships no CSS.
Translations come from the host's keys, plus a few `fasterappointments__` keys in `public/locale/en.json`.

## Develop

```bash
npm install
npm start          # vite build --watch + vite preview on :10126
npm run build      # type-check and build dist/assets/remoteEntry.js
```

In `care_fe/.env.local`:

```
REACT_ENABLED_APPS=ohcnetwork/care_fasterappointments_fe@localhost:10126/assets/remoteEntry.js
REACT_MFE_REGISTERED_COMPONENTS=...,AppointmentDetail,ScheduleResourceSelector
```

- `.env.local` is not hot-reloaded: restart the host dev server after editing it, and hard-reload after each plugin
  rebuild (there is no HMR across the federation boundary).
- A component must be in the `REACT_MFE_REGISTERED_COMPONENTS` allowlist for an override to attach to it.
- `modulePreload` is disabled in `vite.config.ts`: Vite's preload helper resolves chunk URLs against the host
  origin, which 404s for a remote and stops the lazy chunks from loading.
- The preview port (`10126`) must be free, otherwise the host silently skips the plugin. Check the browser console
  for "There was an error enabling the app".

## Limits

- The payment sheet is a re-implementation of the host's, not the host's component: there is no receipt screen,
  credit-note or insurer option, extension fields, and the location is a flat list, not the host's location tree.
- The location choice, the practitioner memory and the host's last-used location are kept in `localStorage`.
