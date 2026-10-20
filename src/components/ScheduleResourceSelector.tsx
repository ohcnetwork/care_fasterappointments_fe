import { type ComponentType, useEffect, useRef } from "react";

interface ResourceState {
  resource_type: string;
  resource: unknown | null;
}

interface Props {
  facilityId: string;
  selectedResource: ResourceState;
  setSelectedResource: (resource: ResourceState) => void;
  // Injected by the host's override registry.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __base?: ComponentType<any>;
}

const storageKey = (facilityId: string, type: string) =>
  `care_fasterappointments_last_resource:${facilityId}:${type}`;

function readStored(facilityId: string, type: string): unknown | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey(facilityId, type)) ?? "null");
  } catch {
    return null;
  }
}

export default function ScheduleResourceSelector({
  __base: Base,
  ...props
}: Props) {
  const { facilityId, selectedResource, setSelectedResource } = props;
  const type = selectedResource.resource_type;
  const restoredFor = useRef<string | null>(null);

  // Restore once per resource type so the user can still clear the selection.
  useEffect(() => {
    if (restoredFor.current === type) return;
    restoredFor.current = type;
    if (selectedResource.resource) return;

    const stored = readStored(facilityId, type);
    if (stored) setSelectedResource({ resource: stored, resource_type: type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    if (selectedResource.resource) {
      localStorage.setItem(
        storageKey(facilityId, type),
        JSON.stringify(selectedResource.resource),
      );
    }
  }, [facilityId, type, selectedResource.resource]);

  return Base ? <Base {...props} /> : null;
}
