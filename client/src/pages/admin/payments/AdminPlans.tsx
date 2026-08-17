import { useState } from "react";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import { trpc } from "@/lib/trpc";
import AdminLayout from "../AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreditCard, Package, Pencil, Plus, Tag, Trash2, X } from "lucide-react";

type PlanForm = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  price: string;
  currency: string;
  intervalDays: string;
  badge: string;
  sortOrder: string;
  isActive: boolean;
  features: string[];
};

const emptyForm = (): PlanForm => ({
  name: "",
  slug: "",
  description: "",
  price: "",
  currency: "usd",
  intervalDays: "30",
  badge: "",
  sortOrder: "0",
  isActive: true,
  features: [],
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminPlans() {
  const utils = trpc.useUtils();
  const { data: plans = [], isLoading } = trpc.payments.adminListPlans.useQuery();

  const savePlan = trpc.payments.adminSavePlan.useMutation({
    onSuccess: () => {
      utils.payments.adminListPlans.invalidate();
      toast.success(form.id ? "Cập nhật gói thành công" : "Tạo gói thành công");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePlan = trpc.payments.adminTogglePlan.useMutation({
    onSuccess: () => utils.payments.adminListPlans.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [featureInput, setFeatureInput] = useState("");

  function openCreate() {
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(plan: (typeof plans)[0]) {
    setForm({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? "",
      price: String(plan.price),
      currency: plan.currency,
      intervalDays: String(plan.intervalDays),
      badge: plan.badge ?? "",
      sortOrder: String(plan.sortOrder),
      isActive: plan.isActive,
      features: Array.isArray(plan.features) ? plan.features : [],
    });
    setOpen(true);
  }

  function addFeature() {
    const f = featureInput.trim();
    if (f && !form.features.includes(f)) {
      setForm((p) => ({ ...p, features: [...p.features, f] }));
    }
    setFeatureInput("");
  }

  function removeFeature(f: string) {
    setForm((p) => ({ ...p, features: p.features.filter((x) => x !== f) }));
  }

  function handleSave() {
    savePlan.mutate({
      id: form.id,
      name: form.name,
      slug: form.slug || slugify(form.name),
      description: form.description || undefined,
      price: parseFloat(form.price) || 0,
      currency: form.currency,
      intervalDays: parseInt(form.intervalDays) || 30,
      badge: form.badge || undefined,
      sortOrder: parseInt(form.sortOrder) || 0,
      isActive: form.isActive,
      features: form.features,
    });
  }

  const CURRENCIES = ["usd", "eur", "gbp", "jpy", "vnd", "sgd", "aud", "cad"];

  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        <AdminPageHeader icon={CreditCard} title="Gói dịch vụ" />
        <div className="flex justify-end mb-4"><Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Plan
          </Button></div>

        {/* Plans Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 skeleton rounded-xl" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/50 p-12 text-center">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Chưa có gói nào. Create your first subscription plan.</p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              Tạo gói mới
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-xl border bg-card p-5 flex flex-col gap-3 transition-opacity ${
                  plan.isActive ? "border-border/50" : "border-border/20 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{plan.name}</h3>
                      {plan.badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">/{plan.slug}</p>
                  </div>
                  <Switch
                    checked={plan.isActive}
                    onCheckedChange={(v) =>
                      togglePlan.mutate({ id: plan.id, isActive: v })
                    }
                  />
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-foreground">
                    {Number(plan.price).toFixed(2)}
                  </span>
                  <span className="text-sm text-muted-foreground uppercase">{plan.currency}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    / {plan.intervalDays === 30 ? "month" : plan.intervalDays === 365 ? "year" : `${plan.intervalDays}d`}
                  </span>
                </div>

                {plan.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
                )}

                {Array.isArray(plan.features) && plan.features.length > 0 && (
                  <ul className="space-y-1">
                    {(plan.features as string[]).slice(0, 3).map((f) => (
                      <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                    {(plan.features as string[]).length > 3 && (
                      <li className="text-xs text-muted-foreground">
                        +{(plan.features as string[]).length - 3} more
                      </li>
                    )}
                  </ul>
                )}

                <div className="flex gap-2 mt-auto pt-2 border-t border-border/30">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(plan)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit Plan" : "New Plan"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Tên gói *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((p) => ({
                        ...p,
                        name,
                        slug: p.slug || slugify(name),
                      }));
                    }}
                    placeholder="e.g. Monthly VIP"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Slug *</label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="monthly-vip"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Badge Label</label>
                  <Input
                    value={form.badge}
                    onChange={(e) => setForm((p) => ({ ...p, badge: e.target.value }))}
                    placeholder="Popular"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mô tả</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Short plan description"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Price *</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                    placeholder="9.99"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Currency</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.currency}
                    onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Duration (days)</label>
                  <Input
                    type="number"
                    min="1"
                    value={form.intervalDays}
                    onChange={(e) => setForm((p) => ({ ...p, intervalDays: e.target.value }))}
                    placeholder="30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Sort Order</label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Features */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Features</label>
                <div className="flex gap-2">
                  <Input
                    value={featureInput}
                    onChange={(e) => setFeatureInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addFeature();
                      }
                    }}
                    placeholder="Add a feature and press Enter"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addFeature}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {form.features.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.features.map((f) => (
                      <span
                        key={f}
                        className="flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded-full"
                      >
                        {f}
                        <button
                          type="button"
                          onClick={() => removeFeature(f)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                />
                <span className="text-sm text-foreground">Active (visible to users)</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={savePlan.isPending}>
                {savePlan.isPending ? "Saving…" : form.id ? "Lưu thay đổi" : "Tạo gói mới"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminPageShell>
    </AdminLayout>
  );
}
