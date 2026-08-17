import { Button } from "@/components/ui/button";
import { AdminPageShell, type AdminShellMode } from "../shell/AdminPageShell";
import { AdminPageHeader, type AdminPageHeaderProps } from "../shell/AdminPageHeader";

export interface SettingsSection {
  id: string;
  title: string;
  description?: string;
  content: React.ReactNode;
}

export interface SettingsPageProps {
  header: AdminPageHeaderProps;
  sections: SettingsSection[];
  shell?: AdminShellMode;
  onSave?: () => void;
  saveLabel?: string;
  isSaving?: boolean;
  dangerZone?: React.ReactNode;
}

export function SettingsPage({
  header,
  sections,
  shell = "full",
  onSave,
  saveLabel = "Lưu cấu hình",
  isSaving,
  dangerZone,
}: SettingsPageProps) {
  return (
    <AdminPageShell mode={shell}>
      <AdminPageHeader {...header} />
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.id} className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-section-title">{section.title}</h2>
              {section.description && (
                <p className="admin-caption mt-1">{section.description}</p>
              )}
            </div>
            <div className="admin-card-body space-y-4">{section.content}</div>
          </section>
        ))}
        {dangerZone && (
          <section className="admin-card border-destructive/30">{dangerZone}</section>
        )}
      </div>
      {onSave && (
        <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-border bg-background/95 py-4 backdrop-blur-sm">
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Đang lưu..." : saveLabel}
          </Button>
        </div>
      )}
    </AdminPageShell>
  );
}
