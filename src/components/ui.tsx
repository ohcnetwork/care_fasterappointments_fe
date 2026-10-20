// Class strings and markup copied from care_fe so the host's stylesheet styles them.

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 dark:focus-visible:ring-gray-300 aria-invalid:border-red-500 aria-invalid:ring-red-500/20 h-9 px-4 py-2";

export const BUTTON_OUTLINE = `${BUTTON_BASE} border border-gray-400 bg-white shadow-sm hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50`;

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-primary-700 text-white shadow-sm hover:bg-primary-700/90 dark:bg-primary-100 dark:text-primary-900 dark:hover:bg-primary-100/90`;

// The host's global shortcut handler clicks the button containing the badge with the matching id.
export function ShortcutBadge({
  actionId,
  label,
}: {
  actionId: string;
  label: string;
}) {
  return (
    <div
      data-shortcut-id={actionId}
      className="h-5 min-w-5 flex justify-center px-1 rounded border font-medium text-xs bg-linear-to-b from-white to-gray-200 border-gray-200 text-gray-700"
    >
      {label}
    </div>
  );
}
