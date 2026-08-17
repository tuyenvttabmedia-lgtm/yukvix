/**
 * Admin CMS — Menu Management
 * Manage main, footer, and mobile navigation menus.
 * Items can be added, reordered (drag-and-drop via @dnd-kit), and deleted.
 */
import { trpc } from "@/lib/trpc";
import { SettingsPage } from "@/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { ExternalLink, GripVertical, Loader2, Menu, Plus, Save, Trash2 } from "lucide-react";
import AdminLayout from "../AdminLayout";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type MenuLocation = "main" | "footer" | "mobile";

interface MenuItemDraft {
  id: string; // local draft id
  label: string;
  url: string;
  target: "_self" | "_blank";
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// -- Sortable row --------------------------------------------------------------
function SortableItem({
  item,
  onChange,
  onXóa,
}: {
  item: MenuItemDraft;
  onChange: (field: keyof MenuItemDraft, value: string) => void;
  onXóa: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-secondary/50 border border-border rounded-lg p-2">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground">
        <GripVertical className="w-4 h-4" />
      </button>
      <Input
        value={item.label}
        onChange={(e) => onChange("label", e.target.value)}
        placeholder="Label"
        className="w-32 h-8 text-sm"
      />
      <Input
        value={item.url}
        onChange={(e) => onChange("url", e.target.value)}
        placeholder="URL (e.g. /gallery)"
        className="flex-1 h-8 text-sm"
      />
      <button
        type="button"
        title="Toggle new tab"
        onClick={() => onChange("target", item.target === "_blank" ? "_self" : "_blank")}
        className={`p-1.5 rounded transition-colors ${item.target === "_blank" ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onXóa}>
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}

// -- Menu panel ----------------------------------------------------------------
function MenuPanel({
  location,
  label,
  initialItems,
}: {
  location: MenuLocation;
  label: string;
  initialItems: MenuItemDraft[];
}) {
  const [items, setItems] = useState<MenuItemDraft[]>(initialItems);
  const saveMenu = trpc.cms.saveMenu.useMutation({
    onSuccess: () => toast.success(`${label} saved`),
    onError: () => toast.error(`Thất bại to save ${label}`),
  });

  useEffect(() => { setItems(initialItems); }, [initialItems.length]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addItem = () =>
    setItems((prev) => [...prev, { id: uid(), label: "", url: "", target: "_self" }]);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const updateItem = (id: string, field: keyof MenuItemDraft, value: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const handleSave = () => {
    saveMenu.mutate({
      location,
      items: items
        .filter((i) => i.label && i.url)
        .map((i, idx) => ({ label: i.label, url: i.url, target: i.target, sortOrder: idx })),
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="w-4 h-4 mr-1" /> Add Item
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMenu.isPending}>
            {saveMenu.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No items yet. Add one above.</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                onChange={(field, value) => updateItem(item.id, field, value)}
                onXóa={() => removeItem(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {items.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          Drag rows to reorder. Click <ExternalLink className="inline w-3 h-3" /> to toggle opening in new tab.
        </p>
      )}
    </div>
  );
}

// -- Main Component ------------------------------------------------------------
export default function AdminMenus() {
  const { data: menusData, isLoading } = trpc.cms.getMenus.useQuery();

  const getItems = (location: MenuLocation): MenuItemDraft[] => {
    const menu = menusData?.find((m) => m.location === location);
    return (menu?.items ?? []).map((i) => ({
      id: String(i.id),
      label: i.label,
      url: i.url,
      target: i.target as "_self" | "_blank",
    }));
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SettingsPage
        header={{ icon: Menu, title: "Menu", subtitle: "Cấu hình menu điều hướng" }}
        sections={[{ id: "main", title: "Menu điều hướng", content: (
      <div className="space-y-5">
          <MenuPanel location="main" label="Main Navigation" initialItems={getItems("main")} />
          <MenuPanel location="footer" label="Footer Navigation" initialItems={getItems("footer")} />
          <MenuPanel location="mobile" label="Mobile Navigation" initialItems={getItems("mobile")} />
      </div>
        )}]}
      />
    </AdminLayout>
  );
}
