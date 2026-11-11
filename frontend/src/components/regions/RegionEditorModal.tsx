import { useEffect, useState } from "react";
import type { Region, RegionMonitoringStatus } from "@/api/types";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

export function RegionEditorModal({
  region,
  open,
  saving,
  onClose,
  onSave,
}: {
  region: Region | null;
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    description: string | null;
    monitoringStatus: RegionMonitoringStatus;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<RegionMonitoringStatus>("active");

  useEffect(() => {
    if (!region) return;
    setName(region.name);
    setDescription(region.description ?? "");
    setStatus(region.monitoringStatus ?? "active");
  }, [region]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit saved region"
      description="Update the label and monitoring state. The stored boundary is unchanged."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                monitoringStatus: status,
              })
            }
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            autoFocus
          />
        </Field>
        <Field label="Description" hint="Optional context shown on the dashboard and watchlist.">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={1000}
          />
        </Field>
        <Field label="Monitoring">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as RegionMonitoringStatus)}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
