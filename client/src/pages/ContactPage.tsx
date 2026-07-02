/**
 * Contact page — form with validation, submission via tRPC, and success state.
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Mail, MessageSquare, Send, CheckCircle2, ChevronRight,
  Clock, HelpCircle, AlertCircle, Crown
} from "lucide-react";

const schema = z.object({
  name: z.string().min(2).max(128),
  email: z.string().email(),
  subject: z.string().min(3).max(256),
  message: z.string().min(10).max(5000),
});
type FormData = z.infer<typeof schema>;

export default function ContactPage() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);

  const contactReasons = [
    { icon: Crown, label: t("contact.topicVip", "VIP / Thanh toán"), subject: "VIP Membership & Billing" },
    { icon: HelpCircle, label: t("contact.topicHelp", "Hỗ trợ chung"), subject: "General Help Request" },
    { icon: AlertCircle, label: t("contact.topicIssue", "Báo lỗi"), subject: "Bug / Technical Issue" },
    { icon: MessageSquare, label: t("contact.topicFeedback", "Góp ý"), subject: "Feedback & Suggestions" },
  ];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const submitContact = trpc.cms.submitContact.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error(err.message || t("contact.sendError", "Gửi tin nhắn thất bại. Vui lòng thử lại."));
    },
  });

  const onSubmit = (data: FormData) => {
    submitContact.mutate(data);
  };

  const messageLength = watch("message")?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SeoHead
        title={`${t("contact.title", "Liên hệ")} — Yukvix`}
        description={t("contact.subtitle", "Liên hệ với đội ngũ Yukvix để được hỗ trợ, giải đáp thắc mắc về thanh toán hoặc các câu hỏi chung.")}
        canonical="/contact"
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
            <span className="text-foreground">{t("contact.title", "Liên hệ")}</span>
          </nav>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {t("contact.title", "Liên hệ với chúng tôi")}
              </h1>
              <p className="text-muted-foreground text-lg">
                {t("contact.subtitle", "Bạn có câu hỏi hoặc cần hỗ trợ? Chúng tôi rất vui được lắng nghe.")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="grid lg:grid-cols-3 gap-10">
            {/* Sidebar info */}
            <div className="space-y-6">
              <div className="p-5 rounded-xl border border-border/50 bg-card/50">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">
                    {t("contact.responseTime", "Thời gian phản hồi")}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("contact.responseTimeDesc", "Chúng tôi thường phản hồi trong vòng")}{" "}
                  <strong className="text-foreground">24–48 {t("contact.hours", "giờ")}</strong>{" "}
                  {t("contact.businessDays", "vào các ngày làm việc.")}
                </p>
              </div>

              <div className="p-5 rounded-xl border border-border/50 bg-card/50">
                <h3 className="font-semibold text-foreground text-sm mb-3">
                  {t("contact.quickTopics", "Chủ đề nhanh")}
                </h3>
                <div className="space-y-1.5">
                  {contactReasons.map((r) => {
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.label}
                        type="button"
                        onClick={() => setValue("subject", r.subject)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left"
                      >
                        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-5 rounded-xl border border-border/50 bg-card/50">
                <h3 className="font-semibold text-foreground text-sm mb-2">
                  {t("contact.dmcaNotices", "Thông báo DMCA")}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {t("contact.dmcaDesc", "Để yêu cầu gỡ bỏ bản quyền, vui lòng sử dụng biểu mẫu DMCA chuyên dụng.")}
                </p>
                <Link href="/dmca">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    {t("contact.submitDmca", "Gửi thông báo DMCA")} <ChevronRight className="w-3.5 h-3.5" />
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
                    {t("contact.successTitle", "Tin nhắn đã được gửi!")}
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-sm">
                    {t("contact.successMessage", "Cảm ơn bạn đã liên hệ. Chúng tôi sẽ phản hồi trong vòng 24–48 giờ.")}
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setSubmitted(false)}>
                      {t("contact.sendAnother", "Gửi tin nhắn khác")}
                    </Button>
                    <Link href="/">
                      <Button>{t("notFound.goHome", "Về trang chủ")}</Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">
                        {t("contact.name", "Họ và tên")} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        placeholder="Nguyễn Văn A"
                        {...register("name")}
                        className={errors.name ? "border-destructive" : ""}
                      />
                      {errors.name && (
                        <p className="text-xs text-destructive">
                          {t("contact.nameError", "Tên phải có ít nhất 2 ký tự")}
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
                        placeholder="example@email.com"
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
                    <Label htmlFor="subject">
                      {t("contact.subject", "Tiêu đề")} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="subject"
                      placeholder={t("contact.subjectPlaceholder", "Chúng tôi có thể giúp gì cho bạn?")}
                      {...register("subject")}
                      className={errors.subject ? "border-destructive" : ""}
                    />
                    {errors.subject && (
                      <p className="text-xs text-destructive">
                        {t("contact.subjectError", "Tiêu đề phải có ít nhất 3 ký tự")}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="message">
                        {t("contact.message", "Nội dung")} <span className="text-destructive">*</span>
                      </Label>
                      <span className={`text-xs ${messageLength > 4500 ? "text-destructive" : "text-muted-foreground"}`}>
                        {messageLength}/5000
                      </span>
                    </div>
                    <Textarea
                      id="message"
                      placeholder={t("contact.messagePlaceholder", "Mô tả chi tiết câu hỏi hoặc vấn đề của bạn...")}
                      rows={7}
                      {...register("message")}
                      className={errors.message ? "border-destructive resize-none" : "resize-none"}
                    />
                    {errors.message && (
                      <p className="text-xs text-destructive">
                        {t("contact.messageError", "Nội dung phải có ít nhất 10 ký tự")}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting || submitContact.isPending}
                    className="w-full gap-2"
                  >
                    {submitContact.isPending ? (
                      <>{t("contact.sending", "Đang gửi...")}</>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {t("contact.send", "Gửi tin nhắn")}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    {t("contact.privacyNote", "Khi gửi biểu mẫu này, bạn đồng ý với")}{" "}
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
