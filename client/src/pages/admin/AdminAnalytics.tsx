import { useState } from "react";
import { DashboardPage } from "@/admin";
import { trpc } from "@/lib/trpc";
import AdminLayout from "./AdminLayout";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, Crown, DollarSign,
  BarChart3, ImageIcon, Eye, AlertCircle, ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const COLORS = ["#f97316", "#a855f7", "#3b82f6", "#10b981", "#f59e0b"];

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtShort(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonth(m: string) {
  const [year, month] = m.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon, color, growth,
}: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  color: string; growth?: number | null;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
      {growth !== undefined && growth !== null && (
        <div className={`flex items-center gap-1 text-xs font-medium ${growth >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {growth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {growth >= 0 ? "+" : ""}{growth}% so kỳ trước
        </div>
      )}
    </div>
  );
}

// ─── Period Selector ──────────────────────────────────────────────────────────
function PeriodSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const opts = [{ label: "7D", value: 7 }, { label: "30D", value: 30 }, { label: "90D", value: 90 }, { label: "1Y", value: 365 }];
  return (
    <div className="flex gap-1 bg-muted rounded-lg p-1">
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-xs">
      <div className="text-muted-foreground mb-1">{label}</div>
      <div className="text-foreground font-semibold">{fmt$(payload[0]?.value ?? 0)}</div>
              {payload[1] && <div className="text-muted-foreground">{payload[1].value} giao dịch</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [expiryDays, setExpiryDays] = useState(30);

  const { data: metrics, isLoading: metricsLoading } = trpc.analytics.revenueMetrics.useQuery({ days });
  const { data: revenueByDay } = trpc.analytics.revenueByDay.useQuery({ days });
  const { data: revenueByPlan } = trpc.analytics.revenueByPlan.useQuery({ days });
  const { data: userMetrics } = trpc.analytics.userFunnelMetrics.useQuery();
  const { data: signupsByDay } = trpc.analytics.signupsByDay.useQuery({ days });
  const { data: expiringVips } = trpc.analytics.expiringVips.useQuery({ days: expiryDays });
  const { data: topAlbums } = trpc.analytics.topAlbums.useQuery({ limit: 10 });
  const { data: topCreators } = trpc.analytics.topCreators.useQuery({ limit: 10 });
  const { data: contentGrowth } = trpc.analytics.contentGrowth.useQuery();

  return (
    <AdminLayout>
      <DashboardPage
        header={{
          icon: BarChart3,
          title: "Thống kê",
          subtitle: "Doanh thu, tăng trưởng người dùng và hiệu suất nội dung",
          actions: <PeriodSelector value={days} onChange={setDays} />,
        }}
        metrics={[
          {
            label: "Tổng doanh thu",
            value: metricsLoading ? "—" : fmt$(metrics?.total ?? 0),
            icon: DollarSign,
            variant: "default",
          },
          {
            label: "Doanh thu tháng",
            value: metricsLoading ? "—" : fmt$(metrics?.mrr ?? 0),
            icon: TrendingUp,
            variant: "success",
          },
          {
            label: "Giao dịch",
            value: metricsLoading ? "—" : (metrics?.totalTransactions ?? 0).toLocaleString(),
            icon: BarChart3,
            variant: "default",
          },
          {
            label: "Giao dịch TB",
            value: metricsLoading ? "—" : fmt$(metrics?.avgTransaction ?? 0),
            icon: ArrowUpRight,
            variant: "default",
          },
        ]}
      >
        <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" /> Doanh thu
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Area Chart */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-medium text-foreground mb-4">Doanh thu theo thời gian</div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueByDay?.map((d) => ({ ...d, date: formatDate(d.date) })) ?? []}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${fmtShort(v)}`} />
                  <Tooltip content={<RevenueTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Pie Chart - Doanh thu by Plan */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-medium text-foreground mb-4">Doanh thu theo gói</div>
              {revenueByPlan && revenueByPlan.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={revenueByPlan} dataKey="revenue" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                        {revenueByPlan.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt$(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {revenueByPlan.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-muted-foreground truncate max-w-[100px]">{p.planName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{fmt$(p.revenue)}</span>
                          <Badge variant="secondary" className="text-[10px] px-1">{p.percentage}%</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Không có dữ liệu cho kỳ này</div>
              )}
            </div>
          </div>
        </section>

        {/* ── GROUP 2: USER FUNNEL ────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" /> Phễu người dùng
          </h2>

          {/* User Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="Tổng người dùng" icon={<Users className="w-4 h-4" />}
              value={(userMetrics?.total ?? 0).toLocaleString()}
              sub="Tất cả đã đăng ký" color="bg-blue-400/10 text-blue-400"
            />
            <MetricCard
              label="Người dùng Free" icon={<Users className="w-4 h-4" />}
              value={(userMetrics?.free ?? 0).toLocaleString()}
              sub="Chưa đăng ký" color="bg-slate-400/10 text-slate-400"
            />
            <MetricCard
              label="Thành viên VIP" icon={<Crown className="w-4 h-4" />}
              value={(userMetrics?.vip ?? 0).toLocaleString()}
              sub={`Tỷ lệ chuyển đổi ${userMetrics?.conversionRate ?? 0}%`} color="bg-primary/10 text-primary"
            />
            <MetricCard
              label="Mới trong tháng" icon={<TrendingUp className="w-4 h-4" />}
              value={(userMetrics?.newThisMonth ?? 0).toLocaleString()}
              sub="30 ngày qua" color="bg-emerald-400/10 text-emerald-400"
            />
          </div>

          {/* Signup Chart + Expiring VIPs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Signup Bar Chart */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-medium text-foreground mb-4">Đăng ký mới theo thời gian</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={signupsByDay?.map((d) => ({ ...d, date: formatDate(d.date) })) ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="signups" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Phễu chuyển đổi */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-medium text-foreground mb-4">Phễu chuyển đổi</div>
              <div className="space-y-3">
                {[
                  { label: "Đã đăng ký", value: userMetrics?.total ?? 0, color: "bg-slate-500", pct: 100 },
                  { label: "Người dùng Free", value: userMetrics?.free ?? 0, color: "bg-blue-500", pct: userMetrics?.total ? Math.round(((userMetrics.free) / userMetrics.total) * 100) : 0 },
                  { label: "Thành viên VIP", value: userMetrics?.vip ?? 0, color: "bg-primary", pct: userMetrics?.conversionRate ?? 0 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="text-foreground font-medium">{item.value.toLocaleString()} ({item.pct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Expiring VIPs Table */}
          <div className="bg-card border border-border rounded-xl p-5 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-foreground">VIP sắp hết hạn</span>
              </div>
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setExpiryDays(d)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${expiryDays === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            {expiringVips && expiringVips.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Người dùng</th>
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Gói</th>
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Hết hạn</th>
                      <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Ngày còn lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringVips.map((v) => (
                      <tr key={v.subscriptionId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3">
                          <div className="font-medium text-foreground">{v.userName}</div>
                          <div className="text-xs text-muted-foreground">{v.userEmail}</div>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">{v.planName}</td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">{new Date(v.expiresAt).toLocaleDateString()}</td>
                        <td className="py-2 px-3">
                          <Badge variant={v.daysLeft <= 7 ? "destructive" : "secondary"} className="text-xs">
                            {v.daysLeft} ngày
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Không có VIP nào hết hạn trong {expiryDays} ngày tới
              </div>
            )}
          </div>
        </section>

        {/* ── GROUP 3: TOP CONTENT ────────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-purple-400" /> Nội dung nổi bật
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Top Albums */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-medium text-foreground mb-4">Album xem nhiều nhất</div>
              <div className="space-y-2">
                {topAlbums?.slice(0, 8).map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                    {a.coverUrl ? (
                      <img src={a.coverUrl} alt={a.title} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{a.title}</div>
                      <div className="text-[10px] text-muted-foreground">{a.cosplayer ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Eye className="w-3 h-3" />
                      {fmtShort(a.viewCount)}
                    </div>
                    {a.isVip && <Badge variant="outline" className="text-[10px] px-1 border-primary/50 text-primary">VIP</Badge>}
                  </div>
                ))}
              </div>
            </div>

            {/* Top Creators */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="text-sm font-medium text-foreground mb-4">Cosplayer có nhiều album nhất</div>
              <div className="space-y-2">
                {topCreators?.slice(0, 8).map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt={c.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <Users className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.albumCount} album</div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Eye className="w-3 h-3" />
                      {fmtShort(c.totalViews)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tăng trưởng nội dung Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="text-sm font-medium text-foreground mb-4">Tăng trưởng nội dung (6 tháng qua)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={contentGrowth?.map((d) => ({ ...d, month: formatMonth(d.month) })) ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="albumAdded" name="Album mới" fill="#a855f7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="photosAdded" name="Ảnh mới" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        </div>
      </DashboardPage>
    </AdminLayout>
  );
}
