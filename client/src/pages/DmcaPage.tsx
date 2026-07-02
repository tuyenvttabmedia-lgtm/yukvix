/**
 * DMCA Takedown Notice page — formal form with declaration checkbox.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";
import { Shield, CheckCircle2, ChevronRight, AlertTriangle, FileText, ExternalLink } from "lucide-react";

const schema = z.object({
  name: z.string().min(2).max(128),
  email: z.string().email(),
  reporterUrl: z.string().url().max(512).optional().or(z.literal("")),
  infringingUrl: z.string().min(5).max(5000),
  originalWorkUrl: z.string().url().max(512).optional().or(z.literal("")),
  description: z.string().min(20).max(5000),
  declaration: z.boolean().refine((v) => v === true),
});
type FormData = z.infer<typeof schema>;

export default function DmcaPage() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [declarationChecked, setDeclarationChecked] = useState(false);

  const steps = [
    { number: "01", title: t("dmca.step1Title", "Xác định nội dung"), desc: t("dmca.step1Desc", "Cung cấp URL nơi nội dung vi phạm xuất hiện trên Yukvix.") },
    { number: "02", title: t("dmca.step2Title", "Chứng minh quyền sở hữu"), desc: t("dmca.step2Desc", "Liên kết đến tác phẩm gốc và mô tả cách nó bị vi phạm.") },
    { number: "03", title: t("dmca.step3Title", "Gửi thông báo"), desc: t("dmca.step3Desc", "Điền đầy đủ biểu mẫu với thông tin liên hệ và ký tuyên bố.") },
    { number: "04", title: t("dmca.step4Title", "Chúng tôi xem xét & xử lý"), desc: t("dmca.step4Desc", "Chúng tôi xem xét tất cả thông báo DMCA hợp lệ trong vòng 3–5 ngày làm việc.") },
  ];

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { declaration: false },
  });

  const submitDmca = trpc.cms.submitDmca.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error(err.message || t("dmca.submitError", "Gửi thông báo DMCA thất bại. Vui lòng thử lại."));
    },
  });

  const onSubmit = (data: FormData) => {
    submitDmca.mutate({
      ...data,
      reporterUrl: data.reporterUrl || undefined,
      originalWorkUrl: data.originalWorkUrl || undefined,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SeoHead
        title={`${t("dmca.pageTitle", "Thông báo DMCA")} — Yukvix`}
        description={t("dmca.pageDesc", "Gửi thông báo gỡ bỏ bản quyền DMCA tới Yukvix. Chúng tôi tôn trọng quyền sở hữu trí tuệ và phản hồi kịp thời với các thông báo hợp lệ.")}
        canonical="/dmca"
      />
      <Navbar />

      {/* Header */}
      <div className="border-b border-border/50 bg-card/20">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
            <Link href="/" className="hover:text-foreground transition-colors">
              {t("common.home", "Trang chủ")}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground">DMCA</span>
          </nav>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {t("dmca.title", "Thông báo gỡ bỏ DMCA")}
              </h1>
              <p className="text-muted-foreground text-lg">
                {t("dmca.subtitle", "Yukvix tôn trọng quyền sở hữu trí tuệ. Sử dụng biểu mẫu này để báo cáo vi phạm bản quyền.")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-12">

          {/* Warning banner */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-400/20 bg-amber-400/5 mb-10">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-amber-300 font-medium mb-1">{t("dmca.warningTitle", "Lưu ý quan trọng")}</p>
              <p className="text-muted-foreground">
                {t("dmca.warningDesc", "Nộp thông báo DMCA sai có thể dẫn đến trách nhiệm pháp lý. Chỉ gửi biểu mẫu này nếu bạn là chủ sở hữu bản quyền hoặc được ủy quyền thay mặt họ.")}
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-10">
            {/* Sidebar */}
            <div className="space-y-6">
              {/* Process steps */}
              <div className="p-5 rounded-xl border border-border/50 bg-card/50">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">
                    {t("dmca.howItWorks", "Quy trình xử lý")}
                  </h3>
                </div>
                <div className="space-y-4">
                  {steps.map((step) => (
                    <div key={step.number} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                        {step.number}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{step.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legal reference */}
              <div className="p-5 rounded-xl border border-border/50 bg-card/50">
                <h3 className="font-semibold text-foreground text-sm mb-2">
                  {t("dmca.legalRef", "Tham chiếu pháp lý")}
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("dmca.legalRefDesc", "Quy trình này tuân thủ Đạo luật Bản quyền Thiên niên kỷ Kỹ thuật số (DMCA), 17 U.S.C. § 512.")}
                </p>
                <a
                  href="https://www.copyright.gov/dmca/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  {t("dmca.learnMore", "Tìm hiểu về DMCA")} <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="p-5 rounded-xl border border-border/50 bg-card/50">
                <h3 className="font-semibold text-foreground text-sm mb-2">
                  {t("dmca.needHelp", "Cần hỗ trợ?")}
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("dmca.needHelpDesc", "Nếu bạn có câu hỏi về quy trình DMCA, hãy liên hệ với chúng tôi trước khi gửi.")}
                </p>
                <Link href="/contact">
                  <Button variant="outline" size="sm" className="w-full">
                    {t("dmca.contactSupport", "Liên hệ hỗ trợ")}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-2">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center mb-5">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {t("dmca.successTitle", "Thông báo đã được gửi")}
                  </h2>
                  <p className="text-muted-foreground mb-2 max-w-sm">
                    {t("dmca.successMessage", "Thông báo gỡ bỏ DMCA của bạn đã được nhận. Chúng tôi sẽ xem xét trong vòng 3–5 ngày làm việc.")}
                  </p>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                    {t("dmca.successNote", "Xác nhận đã được gửi đến đội ngũ của chúng tôi. Bạn có thể được liên hệ nếu cần thêm thông tin.")}
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setSubmitted(false)}>
                      {t("dmca.submitAnother", "Gửi thông báo khác")}
                    </Button>
                    <Link href="/">
                      <Button>{t("notFound.goHome", "Về trang chủ")}</Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="text-sm font-semibold text-foreground pb-2 border-b border-border/50">
                    1. {t("dmca.sectionContact", "Thông tin liên hệ của bạn")}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">
                        {t("dmca.fullName", "Họ và tên đầy đủ")} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        placeholder={t("dmca.fullNamePlaceholder", "Nguyễn Văn A")}
                        {...register("name")}
                        className={errors.name ? "border-destructive" : ""}
                      />
                      {errors.name && (
                        <p className="text-xs text-destructive">
                          {t("dmca.nameError", "Họ tên là bắt buộc (ít nhất 2 ký tự)")}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">
                        {t("contact.email", "Địa chỉ email")} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        {...register("email")}
                        className={errors.email ? "border-destructive" : ""}
                      />
                      {errors.email && (
                        <p className="text-xs text-destructive">
                          {t("contact.emailError", "Vui lòng nhập địa chỉ email hợp lệ")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reporterUrl">
                      {t("dmca.yourWebsite", "Website / URL hồ sơ của bạn")}{" "}
                      <span className="text-muted-foreground text-xs">({t("common.optional", "tùy chọn")})</span>
                    </Label>
                    <Input
                      id="reporterUrl"
                      type="url"
                      placeholder="https://your-website.com"
                      {...register("reporterUrl")}
                      className={errors.reporterUrl ? "border-destructive" : ""}
                    />
                    {errors.reporterUrl && (
                      <p className="text-xs text-destructive">
                        {t("dmca.urlError", "Phải là URL hợp lệ")}
                      </p>
                    )}
                  </div>

                  <div className="text-sm font-semibold text-foreground pb-2 border-b border-border/50 pt-2">
                    2. {t("dmca.sectionInfringing", "Nội dung vi phạm")}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="infringingUrl">
                      {t("dmca.infringingUrls", "URL nội dung vi phạm")} <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="infringingUrl"
                      placeholder={`https://yukvix.com/albums/123\nhttps://yukvix.com/albums/456\n(${t("dmca.onePerLine", "mỗi URL một dòng")})`}
                      rows={4}
                      {...register("infringingUrl")}
                      className={errors.infringingUrl ? "border-destructive resize-none" : "resize-none"}
                    />
                    {errors.infringingUrl && (
                      <p className="text-xs text-destructive">
                        {t("dmca.infringingUrlError", "Vui lòng cung cấp URL nội dung vi phạm")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("dmca.onePerLineHint", "Liệt kê mỗi URL vi phạm trên một dòng riêng.")}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="originalWorkUrl">
                      {t("dmca.originalWorkUrl", "URL tác phẩm gốc")}{" "}
                      <span className="text-muted-foreground text-xs">({t("dmca.recommended", "tùy chọn, khuyến nghị")})</span>
                    </Label>
                    <Input
                      id="originalWorkUrl"
                      type="url"
                      placeholder="https://link-to-your-original-work.com"
                      {...register("originalWorkUrl")}
                      className={errors.originalWorkUrl ? "border-destructive" : ""}
                    />
                    {errors.originalWorkUrl && (
                      <p className="text-xs text-destructive">
                        {t("dmca.urlError", "Phải là URL hợp lệ")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="description">
                      {t("dmca.description", "Mô tả vi phạm")} <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="description"
                      placeholder={t("dmca.descriptionPlaceholder", "Mô tả cách nội dung vi phạm bản quyền của bạn. Bao gồm thông tin về tác phẩm gốc, thời điểm tạo ra và cách nó bị sử dụng mà không có sự cho phép...")}
                      rows={5}
                      {...register("description")}
                      className={errors.description ? "border-destructive resize-none" : "resize-none"}
                    />
                    {errors.description && (
                      <p className="text-xs text-destructive">
                        {t("dmca.descriptionError", "Vui lòng cung cấp mô tả chi tiết (ít nhất 20 ký tự)")}
                      </p>
                    )}
                  </div>

                  <div className="text-sm font-semibold text-foreground pb-2 border-b border-border/50 pt-2">
                    3. {t("dmca.sectionDeclaration", "Tuyên bố")}
                  </div>

                  <div className={`p-4 rounded-xl border ${errors.declaration ? "border-destructive bg-destructive/5" : "border-border/50 bg-card/50"}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="declaration"
                        checked={declarationChecked}
                        onCheckedChange={(checked) => {
                          setDeclarationChecked(!!checked);
                          setValue("declaration", !!checked, { shouldValidate: true });
                        }}
                        className="mt-0.5"
                      />
                      <Label htmlFor="declaration" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                        {t("dmca.declarationText", "Tôi tin tưởng có cơ sở rằng việc sử dụng tài liệu có bản quyền được mô tả ở trên là không được phép bởi chủ sở hữu bản quyền, đại lý của họ, hoặc pháp luật. Tôi thề, dưới hình phạt khai man, rằng thông tin trong thông báo này là chính xác và tôi là chủ sở hữu bản quyền hoặc được ủy quyền thay mặt chủ sở hữu quyền độc quyền bị vi phạm.")}
                      </Label>
                    </div>
                    {errors.declaration && (
                      <p className="text-xs text-destructive mt-2 ml-7">
                        {t("dmca.declarationError", "Bạn phải xác nhận tuyên bố để gửi thông báo này")}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting || submitDmca.isPending || !declarationChecked}
                    className="w-full gap-2"
                  >
                    {submitDmca.isPending ? (
                      t("dmca.submitting", "Đang gửi...")
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        {t("dmca.submit", "Gửi thông báo DMCA")}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    {t("dmca.agreeNote", "Khi gửi, bạn đồng ý với")}{" "}
                    <Link href="/terms" className="text-primary hover:underline">
                      {t("footer.terms", "Điều khoản dịch vụ")}
                    </Link>{" "}
                    {t("common.and", "và")}{" "}
                    <Link href="/privacy" className="text-primary hover:underline">
                      {t("footer.privacyPolicy", "Chính sách bảo mật")}
                    </Link>.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
