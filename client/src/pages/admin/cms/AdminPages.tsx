/**
 * Admin CMS — Static Pages
 * List + multilingual editor for About, Privacy, Terms, Contact, DMCA pages.
 * Each page has language tabs (EN/VI/JA/KO/ZH-TW/ZH-CN) with TipTap rich text editor.
 * AI auto-translate: translate current language or all languages at once.
 */
import { trpc } from "@/lib/trpc";
import { AdminPageShell, AdminPageHeader } from "@/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Save,
  Globe,
  CheckCircle2,
  Sparkles,
  Languages,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import AdminLayout from "../AdminLayout";
import RichTextEditor from "@/components/RichTextEditor";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SYSTEM_PAGES = [
  { slug: "about", label: "Giới thiệu (About Us)" },
  { slug: "privacy", label: "Chính sách bảo mật (Privacy Policy)" },
  { slug: "terms", label: "Điều khoản dịch vụ (Terms of Service)" },
  { slug: "contact", label: "Liên hệ (Contact)" },
  { slug: "dmca", label: "Chính sách DMCA" },
];

const LANGUAGES = [
  { code: "en", label: "🇬🇧 English", flag: "EN", name: "English" },
  { code: "vi", label: "🇻🇳 Tiếng Việt", flag: "VI", name: "Tiếng Việt" },
  { code: "ja", label: "🇯🇵 日本語", flag: "JA", name: "日本語" },
  { code: "ko", label: "🇰🇷 한국어", flag: "KO", name: "한국어" },
  { code: "zh-TW", label: "🇹🇼 繁體中文", flag: "TW", name: "繁體中文" },
  { code: "zh-CN", label: "🇨🇳 简体中文", flag: "CN", name: "简体中文" },
];

const TRANSLATABLE_LANGS = LANGUAGES.filter((l) => l.code !== "en");

type LangContent = {
  title: string;
  content: string;
};

// -- Page Editor ---------------------------------------------------------------
function PageEditor({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data: page, isLoading } = trpc.cms.getPage.useQuery({ slug });
  const savePage = trpc.cms.savePage.useMutation({
    onSuccess: () => toast.success("Đã lưu trang thành công"),
    onError: () => toast.error("Lưu trang thất bại"),
  });
  const translatePage = trpc.cms.translatePage.useMutation();

  const [activeLang, setActiveLang] = useState("en");
  const [preview, setPreview] = useState(false);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("published");

  // Per-language content state
  const [langData, setLangData] = useState<Record<string, LangContent>>(() =>
    Object.fromEntries(LANGUAGES.map((l) => [l.code, { title: "", content: "" }]))
  );

  const [loaded, setLoaded] = useState(false);

  // Translation state
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const [translateAllOpen, setTranslateAllOpen] = useState(false);
  const [translateAllOverwrite, setTranslateAllOverwrite] = useState(false);

  useEffect(() => {
    if (page && !loaded) {
      setSeoTitle(page.seoTitle ?? "");
      setSeoDescription(page.seoDescription ?? "");
      setStatus(page.status as "draft" | "published");
      setLangData({
        en: { title: page.title ?? "", content: page.content ?? "" },
        vi: { title: page.titleVi ?? "", content: page.contentVi ?? "" },
        ja: { title: page.titleJa ?? "", content: page.contentJa ?? "" },
        ko: { title: page.titleKo ?? "", content: page.contentKo ?? "" },
        "zh-TW": { title: page.titleZhTw ?? "", content: page.contentZhTw ?? "" },
        "zh-CN": { title: page.titleZhCn ?? "", content: page.contentZhCn ?? "" },
      });
      setLoaded(true);
    }
  }, [page, loaded]);

  const updateLangField = (lang: string, field: "title" | "content", value: string) => {
    setLangData((prev) => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value },
    }));
  };

  const hasContent = (lang: string) => {
    const d = langData[lang];
    return d && (d.title.trim() !== "" || d.content.trim() !== "");
  };

  const enContent = langData.en;
  const hasEnContent = enContent.title.trim() !== "" || enContent.content.trim() !== "";

  // Translate a single language
  const handleTranslateSingle = async (targetLang: string) => {
    if (!hasEnContent) {
      toast.error("Vui lòng nhập nội dung tiếng Anh (EN) trước khi dịch");
      return;
    }
    setTranslatingLang(targetLang);
    const toastId = toast.loading(
      `Đang dịch sang ${LANGUAGES.find((l) => l.code === targetLang)?.name}...`
    );
    try {
      const result = await translatePage.mutateAsync({
        title: enContent.title,
        content: enContent.content,
        targetLanguages: [targetLang as "vi" | "ja" | "ko" | "zh-TW" | "zh-CN"],
      });
      const translated = result[targetLang];
      if (translated && (translated.title || translated.content)) {
        setLangData((prev) => ({
          ...prev,
          [targetLang]: {
            title: translated.title || prev[targetLang].title,
            content: translated.content || prev[targetLang].content,
          },
        }));
        toast.success(
          `Đã dịch sang ${LANGUAGES.find((l) => l.code === targetLang)?.name} thành công`,
          { id: toastId }
        );
      } else {
        toast.error("AI không thể dịch ngôn ngữ này, vui lòng thử lại", { id: toastId });
      }
    } catch {
      toast.error("Lỗi khi dịch, vui lòng thử lại", { id: toastId });
    } finally {
      setTranslatingLang(null);
    }
  };

  // Translate all languages at once
  const handleTranslateAll = async (overwrite: boolean) => {
    if (!hasEnContent) {
      toast.error("Vui lòng nhập nội dung tiếng Anh (EN) trước khi dịch");
      setTranslateAllOpen(false);
      return;
    }

    const targets = overwrite
      ? TRANSLATABLE_LANGS.map((l) => l.code)
      : TRANSLATABLE_LANGS.filter((l) => !hasContent(l.code)).map((l) => l.code);

    if (targets.length === 0) {
      toast.info("Tất cả ngôn ngữ đã có nội dung. Chọn 'Ghi đè' để dịch lại.");
      setTranslateAllOpen(false);
      return;
    }

    setTranslateAllOpen(false);
    const toastId = toast.loading(
      `Đang dịch ${targets.length} ngôn ngữ... (có thể mất 30-60 giây)`
    );

    try {
      const result = await translatePage.mutateAsync({
        title: enContent.title,
        content: enContent.content,
        targetLanguages: targets as Array<"vi" | "ja" | "ko" | "zh-TW" | "zh-CN">,
      });

      let successCount = 0;
      let failCount = 0;

      setLangData((prev) => {
        const next = { ...prev };
        for (const lang of targets) {
          const translated = result[lang];
          if (translated && (translated.title || translated.content)) {
            next[lang] = {
              title: translated.title || prev[lang].title,
              content: translated.content || prev[lang].content,
            };
            successCount++;
          } else {
            failCount++;
          }
        }
        return next;
      });

      if (failCount === 0) {
        toast.success(`Đã dịch thành công ${successCount} ngôn ngữ`, { id: toastId });
      } else {
        toast.warning(
          `Dịch xong: ${successCount} thành công, ${failCount} thất bại`,
          { id: toastId }
        );
      }
    } catch {
      toast.error("Lỗi khi dịch tất cả ngôn ngữ, vui lòng thử lại", { id: toastId });
    }
  };

  const handleSave = () => {
    savePage.mutate({
      slug,
      title: langData.en.title || slug,
      content: langData.en.content,
      contentVi: langData.vi.content || null,
      contentJa: langData.ja.content || null,
      contentKo: langData.ko.content || null,
      contentZhTw: langData["zh-TW"].content || null,
      contentZhCn: langData["zh-CN"].content || null,
      titleVi: langData.vi.title || null,
      titleJa: langData.ja.title || null,
      titleKo: langData.ko.title || null,
      titleZhTw: langData["zh-TW"].title || null,
      titleZhCn: langData["zh-CN"].title || null,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
      status,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const currentContent = langData[activeLang]?.content ?? "";
  const currentTitle = langData[activeLang]?.title ?? "";
  const isTranslatingAny = translatePage.isPending;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Danh sách trang
        </Button>
        <div className="flex-1" />

        {/* AI Translate All button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTranslateAllOpen(true)}
          disabled={isTranslatingAny || !hasEnContent}
          className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
        >
          {isTranslatingAny && translatingLang === null ? (
            <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
          ) : (
            <Languages className="w-4 h-4 mr-1.5" />
          )}
          Dịch tất cả ngôn ngữ
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? (
            <EyeOff className="w-4 h-4 mr-1" />
          ) : (
            <Eye className="w-4 h-4 mr-1" />
          )}
          {preview ? "Soạn thảo" : "Xem trước"}
        </Button>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "draft" | "published")}
          className="h-9 rounded-md border border-border bg-background text-sm px-2 text-foreground"
        >
          <option value="published">Đã xuất bản</option>
          <option value="draft">Bản nháp</option>
        </select>
        <Button onClick={handleSave} disabled={savePage.isPending}>
          {savePage.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Lưu trang
        </Button>
      </div>

      {/* EN required warning */}
      {!hasEnContent && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Nhập nội dung tiếng Anh (EN) trước — AI sẽ dịch từ EN sang các ngôn ngữ khác.</span>
        </div>
      )}

      {/* Language tabs */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-1 p-1 border-b border-border bg-muted/30 flex-wrap">
          <Globe className="w-4 h-4 text-muted-foreground ml-2 mr-1 shrink-0" />
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setActiveLang(lang.code)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeLang === lang.code
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <span className="text-xs font-bold">{lang.flag}</span>
              <span className="hidden sm:inline">{lang.label.split(" ").slice(1).join(" ")}</span>
              {translatingLang === lang.code && (
                <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
              )}
              {hasContent(lang.code) && lang.code !== "en" && translatingLang !== lang.code && (
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              )}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* Language hint + AI translate button for non-EN */}
          {activeLang !== "en" && (
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Globe className="w-4 h-4 shrink-0 text-blue-400" />
              <span className="text-xs text-blue-400 flex-1">
                Nếu để trống, trang sẽ hiển thị nội dung tiếng Anh (EN) làm mặc định.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleTranslateSingle(activeLang)}
                disabled={isTranslatingAny || !hasEnContent}
                className="shrink-0 h-7 text-xs border-purple-500/40 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
              >
                {translatingLang === activeLang ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Sparkles className="w-3 h-3 mr-1" />
                )}
                {translatingLang === activeLang
                  ? "Đang dịch..."
                  : hasContent(activeLang)
                  ? "Dịch lại bằng AI"
                  : "Dịch bằng AI"}
              </Button>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor={`title-${activeLang}`}>
              Tiêu đề trang{" "}
              <span className="text-xs text-muted-foreground">
                ({LANGUAGES.find((l) => l.code === activeLang)?.label})
              </span>
              {activeLang === "en" && <span className="text-red-400 ml-1">*</span>}
            </Label>
            <Input
              id={`title-${activeLang}`}
              value={currentTitle}
              onChange={(e) => updateLangField(activeLang, "title", e.target.value)}
              placeholder={
                activeLang === "en"
                  ? "About Us"
                  : `Tiêu đề bằng ${LANGUAGES.find((l) => l.code === activeLang)?.label ?? activeLang}...`
              }
            />
          </div>

          {/* Content editor */}
          <div className="space-y-1.5">
            <Label>
              Nội dung{" "}
              <span className="text-xs text-muted-foreground">
                ({LANGUAGES.find((l) => l.code === activeLang)?.label})
              </span>
            </Label>
            {preview ? (
              <div
                className="cms-prose min-h-[400px] bg-background border border-border rounded-lg px-6 py-8 max-w-none"
                dangerouslySetInnerHTML={{ __html: currentContent }}
              />
            ) : (
              <RichTextEditor
                key={activeLang}
                value={currentContent}
                onChange={(html) => updateLangField(activeLang, "content", html)}
                placeholder={
                  activeLang === "en"
                    ? "Nhập nội dung trang bằng tiếng Anh..."
                    : `Nhập nội dung bằng ${LANGUAGES.find((l) => l.code === activeLang)?.label ?? activeLang}...`
                }
                minHeight="400px"
              />
            )}
          </div>
        </div>
      </div>

      {/* SEO section */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          SEO
          <Badge variant="outline" className="text-xs font-normal">
            Áp dụng cho tất cả ngôn ngữ
          </Badge>
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="seo-title">Tiêu đề SEO</Label>
          <Input
            id="seo-title"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder="About Yukvix — Premium Cosplay Gallery"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seo-desc">Mô tả SEO</Label>
          <Textarea
            id="seo-desc"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            rows={2}
            placeholder="Tìm hiểu về Yukvix, thư viện cosplay cao cấp..."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          URL công khai:{" "}
          <code className="bg-secondary px-1 rounded">/{slug}</code>
        </p>
      </div>

      {/* Translation status overview */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Tình trạng dịch thuật
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTranslateAllOpen(true)}
            disabled={isTranslatingAny || !hasEnContent}
            className="h-7 text-xs border-purple-500/40 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
          >
            <Languages className="w-3 h-3 mr-1" />
            Dịch tất cả
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LANGUAGES.map((lang) => {
            const filled = hasContent(lang.code);
            const isTranslating = translatingLang === lang.code || (isTranslatingAny && translatingLang === null && lang.code !== "en");
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => setActiveLang(lang.code)}
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors",
                  activeLang === lang.code
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-border/80 hover:bg-muted/30",
                  filled ? "opacity-100" : "opacity-60"
                )}
              >
                <span className="text-base">{lang.label.split(" ")[0]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {lang.flag}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang.code === "en"
                      ? "Bắt buộc"
                      : isTranslating
                      ? "Đang dịch..."
                      : filled
                      ? "Đã dịch"
                      : "Chưa dịch"}
                  </p>
                </div>
                {isTranslating ? (
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
                ) : filled ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Translate All Dialog */}
      <Dialog open={translateAllOpen} onOpenChange={setTranslateAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Languages className="w-5 h-5 text-purple-400" />
              Dịch tất cả ngôn ngữ bằng AI
            </DialogTitle>
            <DialogDescription>
              AI sẽ dịch nội dung từ tiếng Anh (EN) sang 5 ngôn ngữ còn lại: VI, JA, KO, ZH-TW, ZH-CN.
              Quá trình có thể mất 30–60 giây.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Status of each language */}
            <div className="grid grid-cols-2 gap-2">
              {TRANSLATABLE_LANGS.map((lang) => {
                const filled = hasContent(lang.code);
                return (
                  <div
                    key={lang.code}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border text-xs",
                      filled
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-border bg-muted/20"
                    )}
                  >
                    <span>{lang.label.split(" ")[0]}</span>
                    <span className="font-medium text-foreground">{lang.flag}</span>
                    <span className="text-muted-foreground flex-1">
                      {filled ? "Đã có nội dung" : "Chưa có"}
                    </span>
                    {filled ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Overwrite option */}
            <label className="flex items-start gap-2.5 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/20 transition-colors">
              <input
                type="checkbox"
                checked={translateAllOverwrite}
                onChange={(e) => setTranslateAllOverwrite(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Ghi đè nội dung đã có</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nếu bỏ chọn, chỉ dịch các ngôn ngữ chưa có nội dung.
                </p>
              </div>
            </label>

            <div className="flex items-start gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                AI dịch từ nội dung EN hiện tại. Kết quả có thể cần chỉnh sửa thêm.
                Nhớ nhấn <strong>Lưu trang</strong> sau khi dịch xong.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTranslateAllOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => handleTranslateAll(translateAllOverwrite)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Languages className="w-4 h-4 mr-2" />
              {translateAllOverwrite
                ? "Dịch lại tất cả 5 ngôn ngữ"
                : `Dịch ${TRANSLATABLE_LANGS.filter((l) => !hasContent(l.code)).length} ngôn ngữ chưa có nội dung`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -- Main Component ------------------------------------------------------------
export default function AdminPages() {
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  return (
    <AdminLayout>
      <AdminPageShell mode="full">
        {editingSlug ? (
          <PageEditor slug={editingSlug} onBack={() => setEditingSlug(null)} />
        ) : (
          <>
            <AdminPageHeader
              icon={FileText}
              title="Trang tĩnh"
              subtitle="Chỉnh sửa nội dung các trang thông tin của website. Hỗ trợ đa ngôn ngữ với AI dịch tự động."
            />

            {/* AI translate info banner */}
            <div className="flex items-center gap-2 p-3 mb-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                <strong>AI Auto-Translate:</strong> Nhập nội dung tiếng Anh, sau đó dùng nút{" "}
                <strong>Dịch tất cả ngôn ngữ</strong> để AI tự động dịch sang VI/JA/KO/ZH-TW/ZH-CN.
              </span>
            </div>

            <div className="admin-card divide-y divide-border/50">
              {SYSTEM_PAGES.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setEditingSlug(p.slug)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-secondary/20 group first:rounded-t-xl last:rounded-b-xl"
                >
                  <FileText className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{p.label}</p>
                    <p className="text-xs text-muted-foreground">/{p.slug}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {LANGUAGES.map((l) => (
                      <span
                        key={l.code}
                        className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                      >
                        {l.flag}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors ml-2">
                    Chỉnh sửa →
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </AdminPageShell>
    </AdminLayout>
  );
}
