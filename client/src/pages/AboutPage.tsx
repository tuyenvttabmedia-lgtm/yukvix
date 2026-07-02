/**
 * About page — rich visual design with mission, values, and team sections.
 * Fully translated via react-i18next.
 */
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Crown, Shield, Users, Sparkles, Heart, Star, ChevronRight } from "lucide-react";

export default function AboutPage() {
  const { t } = useTranslation();

  const values = [
    {
      icon: Star,
      title: t("about.value1Title", "Chất lượng hàng đầu"),
      description: t("about.value1Desc", "Chúng tôi chỉ tuyển chọn những bức ảnh cosplay chất lượng cao nhất, đảm bảo mỗi hình ảnh đáp ứng tiêu chuẩn nghiêm ngặt của chúng tôi."),
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
    },
    {
      icon: Heart,
      title: t("about.value2Title", "Tôn trọng nhà sáng tạo"),
      description: t("about.value2Desc", "Tất cả nhà sáng tạo đều được ghi nhận và đền bù xứng đáng. Chúng tôi tin vào quan hệ đối tác công bằng với các nghệ sĩ mà chúng tôi giới thiệu."),
      color: "text-rose-400",
      bg: "bg-rose-400/10",
    },
    {
      icon: Users,
      title: t("about.value3Title", "Cộng đồng"),
      description: t("about.value3Desc", "Chúng tôi xây dựng một cộng đồng tôn trọng, hòa nhập của những người đam mê cosplay từ mọi nền tảng và fandom."),
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
    {
      icon: Shield,
      title: t("about.value4Title", "Quyền riêng tư & An toàn"),
      description: t("about.value4Desc", "Chúng tôi bảo vệ quyền riêng tư của người dùng và nhà sáng tạo bằng các biện pháp bảo mật theo tiêu chuẩn ngành."),
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
  ];

  const stats = [
    { value: "10K+", label: t("about.statPhotos", "Ảnh") },
    { value: "500+", label: t("about.statCreators", "Nhà sáng tạo") },
    { value: "50K+", label: t("about.statMembers", "Thành viên") },
    { value: "100+", label: t("about.statFandoms", "Fandom") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SeoHead
        title={`${t("about.pageTitle", "Về chúng tôi")} — Yukvix`}
        description={t("about.pageDesc", "Tìm hiểu về Yukvix, sứ mệnh tôn vinh cosplay như một nghệ thuật và những giá trị định hướng mọi quyết định của chúng tôi.")}
        canonical="/about"
      />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="max-w-5xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            {t("about.ourStory", "Câu chuyện của chúng tôi")}
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            {t("about.heroTitle1", "Nơi Cosplay Trở Thành")}{" "}
            <span className="text-primary">{t("about.heroTitle2", "Nghệ Thuật")}</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("about.heroDesc", "Yukvix được thành lập với một sứ mệnh đơn giản: tạo ra điểm đến đẹp nhất và được tuyển chọn kỹ lưỡng nhất cho ảnh cosplay trên internet.")}
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border/50 bg-card/30">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-primary mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              {t("about.missionTitle", "Sứ mệnh của chúng tôi")}
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("about.missionP1", "Chúng tôi tin rằng cosplay là một hình thức nghệ thuật chính đáng xứng đáng có một nền tảng chất lượng cao và chuyên biệt. Sứ mệnh của chúng tôi là kết nối các nghệ sĩ cosplay tài năng với những người hâm mộ trân trọng tác phẩm của họ.")}
            </p>
            <p className="text-muted-foreground leading-relaxed mb-6">
              {t("about.missionP2", "Yukvix cung cấp nền tảng gallery cao cấp nơi các nhiếp ảnh gia và nghệ sĩ cosplay có thể trưng bày tác phẩm. Chúng tôi cung cấp cả gói miễn phí và VIP, cho phép người hâm mộ truy cập nội dung độc quyền độ phân giải cao.")}
            </p>
            <Link href="/contact">
              <Button variant="default" className="gap-2">
                {t("about.getInTouch", "Liên hệ chúng tôi")} <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="relative">
            <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/20 border border-border/50 flex items-center justify-center">
              <Crown className="w-24 h-24 text-primary opacity-60" />
            </div>
            <div className="absolute -top-4 -right-4 w-20 h-20 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
              <Star className="w-8 h-8 text-yellow-400" />
            </div>
            <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-xl bg-rose-400/10 border border-rose-400/20 flex items-center justify-center">
              <Heart className="w-6 h-6 text-rose-400" />
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="border-t border-border/50 bg-card/20">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              {t("about.valuesTitle", "Giá trị cốt lõi")}
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {t("about.valuesSubtitle", "Những nguyên tắc này định hướng mọi quyết định của chúng tôi, từ tuyển chọn nội dung đến quản lý cộng đồng.")}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {values.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.title}
                  className="flex gap-4 p-6 rounded-xl border border-border/50 bg-card/50 hover:border-border transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg ${v.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${v.color}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{v.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{v.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
          {t("about.ctaTitle", "Sẵn sàng khám phá?")}
        </h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          {t("about.ctaDesc", "Duyệt hàng nghìn ảnh cosplay tuyệt đẹp từ các nhà sáng tạo tài năng trên toàn thế giới.")}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/gallery">
            <Button size="lg" className="gap-2">
              <Crown className="w-4 h-4" /> {t("about.browseGallery", "Duyệt Gallery")}
            </Button>
          </Link>
          <Link href="/contact">
            <Button size="lg" variant="outline">
              {t("footer.contact", "Liên hệ")}
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
