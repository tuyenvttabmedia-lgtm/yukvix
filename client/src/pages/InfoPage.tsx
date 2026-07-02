/**
 * Info page — platform feature highlights, technical info, and content standards.
 * Fully translated via react-i18next.
 */
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Crown, Image, Search, Lock, CreditCard, Download,
  Zap, Shield, Globe, ChevronRight, Info
} from "lucide-react";

export default function InfoPage() {
  const { t } = useTranslation();

  const features = [
    {
      icon: Image,
      title: t("info.feat1Title", "Gallery Độ Phân Giải Cao"),
      description: t("info.feat1Desc", "Duyệt hàng nghìn ảnh cosplay tuyệt đẹp ở độ phân giải đầy đủ, được tổ chức theo nhà sáng tạo, fandom và nhân vật."),
    },
    {
      icon: Crown,
      title: t("info.feat2Title", "Thành Viên VIP"),
      description: t("info.feat2Desc", "Mở khóa nội dung premium độc quyền, tải xuống độ phân giải cao và truy cập sớm vào các gallery mới với gói đăng ký VIP."),
    },
    {
      icon: Search,
      title: t("info.feat3Title", "Tìm Kiếm & Lọc Nâng Cao"),
      description: t("info.feat3Desc", "Tìm chính xác những gì bạn muốn với bộ lọc mạnh mẽ theo nhân vật, series, nhà sáng tạo và loại nội dung."),
    },
    {
      icon: Download,
      title: t("info.feat4Title", "Tải Xuống ZIP"),
      description: t("info.feat4Desc", "Thành viên VIP có thể tải toàn bộ album dưới dạng file ZIP để xem offline và lưu trữ cá nhân."),
    },
    {
      icon: Lock,
      title: t("info.feat5Title", "Bảo Mật & Riêng Tư"),
      description: t("info.feat5Desc", "Dữ liệu của bạn được bảo vệ bằng mã hóa theo tiêu chuẩn ngành. Chúng tôi không bao giờ chia sẻ thông tin cá nhân của bạn."),
    },
    {
      icon: CreditCard,
      title: t("info.feat6Title", "Thanh Toán Linh Hoạt"),
      description: t("info.feat6Desc", "Đăng ký bằng thẻ tín dụng qua Stripe. Hủy bất cứ lúc nào, không có phí ẩn hay ràng buộc."),
    },
  ];

  const techStack = [
    { label: t("info.techFrontend", "Frontend"), value: "React 19 + TypeScript" },
    { label: t("info.techBackend", "Backend"), value: "Node.js + tRPC" },
    { label: t("info.techDatabase", "Cơ sở dữ liệu"), value: "MySQL (TiDB)" },
    { label: t("info.techStorage", "Lưu trữ"), value: "S3-compatible (Wasabi)" },
    { label: t("info.techPayments", "Thanh toán"), value: "Stripe" },
    { label: t("info.techEmail", "Email"), value: "SMTP (configurable)" },
  ];

  const contentStandards = [
    t("info.standard1", "Tất cả nhà sáng tạo đều được xác minh và ghi nhận"),
    t("info.standard2", "Nội dung được xem xét trước khi đăng"),
    t("info.standard3", "Yêu cầu gỡ bỏ DMCA được xử lý kịp thời"),
    t("info.standard4", "Không phân phối lại nội dung trái phép"),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SeoHead
        title={`${t("info.pageTitle", "Thông tin trang web")} — Yukvix`}
        description={t("info.pageDesc", "Tìm hiểu về tính năng nền tảng Yukvix, tiêu chuẩn nội dung và thông tin kỹ thuật.")}
        canonical="/info"
      />
      <Navbar />

      {/* Hero */}
      <section className="border-b border-border/50 bg-card/20">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
            <Link href="/" className="hover:text-foreground transition-colors">
              {t("common.home", "Trang chủ")}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground">{t("info.pageTitle", "Thông tin trang web")}</span>
          </nav>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Info className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                {t("info.pageTitle", "Thông tin trang web")}
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
                {t("info.heroDesc", "Yukvix là nền tảng gallery ảnh cosplay cao cấp dành riêng để giới thiệu nghệ thuật cosplay chất lượng cao từ các nhà sáng tạo tài năng trên toàn thế giới.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {t("info.featuresTitle", "Tính năng nền tảng")}
        </h2>
        <p className="text-muted-foreground mb-8">
          {t("info.featuresSubtitle", "Tất cả những gì bạn cần để thưởng thức và khám phá ảnh cosplay.")}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="p-5 rounded-xl border border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Content Standards + Tech */}
      <section className="border-t border-border/50 bg-card/20">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">
                  {t("info.contentStandardsTitle", "Tiêu chuẩn nội dung")}
                </h2>
              </div>
              <p className="text-muted-foreground leading-relaxed mb-4">
                {t("info.contentStandardsDesc", "Tất cả nội dung trên Yukvix được tuyển chọn cẩn thận để duy trì tiêu chuẩn chất lượng cao nhất. Chúng tôi làm việc trực tiếp với các nhà sáng tạo để đảm bảo cấp phép và ghi nhận đúng đắn.")}
              </p>
              <ul className="space-y-2">
                {contentStandards.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">
                  {t("info.techInfoTitle", "Thông tin kỹ thuật")}
                </h2>
              </div>
              <p className="text-muted-foreground leading-relaxed mb-4">
                {t("info.techInfoDesc", "Yukvix được xây dựng với các công nghệ web hiện đại để mang lại trải nghiệm nhanh, an toàn và đáng tin cậy trên mọi thiết bị.")}
              </p>
              <div className="rounded-xl border border-border/50 overflow-hidden">
                {techStack.map((item, i) => (
                  <div
                    key={item.label}
                    className={`flex items-center justify-between px-4 py-3 text-sm ${
                      i < techStack.length - 1 ? "border-b border-border/50" : ""
                    }`}
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Availability */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="rounded-xl border border-border/50 bg-card/50 p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="w-12 h-12 rounded-xl bg-green-400/10 border border-green-400/20 flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6 text-green-400" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <h3 className="font-semibold text-foreground mb-1">
              {t("info.availableTitle", "Có mặt trên toàn thế giới")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("info.availableDesc", "Yukvix có thể truy cập từ bất kỳ quốc gia nào. Nội dung được phân phối qua CDN để tải nhanh bất kể vị trí của bạn.")}
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link href="/about">
              <Button variant="outline" size="sm">{t("about.pageTitle", "Về chúng tôi")}</Button>
            </Link>
            <Link href="/contact">
              <Button size="sm" className="gap-1.5">
                {t("footer.contact", "Liên hệ")} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
