# SEO Requirements Analysis for Yukvix

**Date:** June 2026  
**Project:** Yukvix (Premium Cosplay Gallery)  
**Status:** ⚠️ Phức tạp, cần ưu tiên hợp lý

---

## Executive Summary

Yêu cầu SEO của bạn **rất toàn diện và chuyên nghiệp**, nhưng **quá lớn để triển khai cùng lúc**. Dự án hiện tại đã có:

✅ **Đã có:**
- PhotoSwipe viewer (image-heavy optimization)
- 3-tier image loading (thumb/medium/original)
- Multi-language support (EN, VI, JA, KO, ZH-CN, ZH-TW)
- Database schema tốt (albums, photos, creators, tags)
- Stripe VIP integration

❌ **Chưa có:**
- Tracking pixels (GTM, GA4, Clarity, FB Pixel, etc.)
- Sitemaps (XML)
- robots.txt
- Meta SEO fields (SEO Title, Meta Description, Focus Keyword)
- Schema JSON-LD
- Image SEO (ALT text, auto-rename)
- Redirect manager
- SEO audit dashboard

---

## Phân tích chi tiết từng yêu cầu

### 1. SEO Tracking / Marketing Integration ⚠️ **Medium Priority**

**Yêu cầu:**
- Google Tag Manager ID
- Google Analytics 4 ID
- Google Search Console Verification
- Microsoft Clarity ID
- Facebook Pixel ID
- X Pixel ID
- Reddit Pixel ID
- TikTok Pixel ID
- Pinterest Tag ID

**Đánh giá:**
- ✅ **Phù hợp** — Yukvix là image-heavy app, cần tracking
- ⚠️ **Phức tạp** — 9 pixels cùng lúc sẽ làm chậm page load
- 🎯 **Khuyến nghị:** Triển khai theo giai đoạn:
  - **Phase 1:** GTM + GA4 (bắt buộc)
  - **Phase 2:** Clarity + FB Pixel (3 tháng sau)
  - **Phase 3:** X, Reddit, TikTok, Pinterest (6 tháng sau)

**Công việc:**
- Thêm `<script>` GTM vào `client/index.html`
- Tạo admin panel "Tracking Settings" để config IDs
- Implement event tracking (view album, download, VIP purchase)
- **Thời gian:** 8-12 giờ

---

### 2. Sitemap tự động ✅ **High Priority**

**Yêu cầu:**
- `/sitemap.xml` (index)
- `/sitemap-pages.xml`
- `/sitemap-creators.xml`
- `/sitemap-albums.xml`
- `/sitemap-categories.xml`
- `/sitemap-tags.xml`

**Đánh giá:**
- ✅ **Bắt buộc** — Google cần sitemap để crawl
- ✅ **Phù hợp** — Dự án có cấu trúc rõ ràng
- ✅ **Dễ triển khai** — Tạo API endpoints trả về XML

**Công việc:**
- Tạo 6 API endpoints trả về XML
- Tính `lastmod` từ `updatedAt` trong DB
- Set `priority` theo loại (album 0.9, creator 0.8, tag 0.7)
- Update `robots.txt` với sitemap URL
- **Thời gian:** 4-6 giờ

---

### 3. Robots.txt ✅ **High Priority**

**Yêu cầu:**
```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /dashboard/
Disallow: /account/
Disallow: /login
Disallow: /register
Disallow: /checkout
Disallow: /payment/
Disallow: /api/
Sitemap: https://yukvix.com/sitemap.xml
```

**Đánh giá:**
- ✅ **Bắt buộc** — Cơ bản nhất của SEO
- ✅ **Dễ** — Chỉ là static file

**Công việc:**
- Tạo `client/public/robots.txt`
- **Thời gian:** 0.5 giờ

---

### 4. Meta SEO cho Album ⚠️ **High Priority (nhưng phức tạp)**

**Yêu cầu:**
- SEO Title (khác Album Title)
- Meta Description
- Focus Keyword
- URL Slug
- OG Image
- Canonical URL
- Index / Noindex toggle
- Language

**Đánh giá:**
- ✅ **Rất quan trọng** — Album là core content
- ⚠️ **Phức tạp** — Cần thêm 7 fields vào DB + admin UI
- ⚠️ **Thời gian dài** — Cần migration + form UI

**Công việc:**
- Thêm 7 cột vào bảng `albums`
- Migration: `ALTER TABLE albums ADD ...`
- Admin form: SEO Title, Meta Description, Focus Keyword, Slug, OG Image, Index/Noindex, Language
- Frontend: Render meta tags trong `<head>`
- **Thời gian:** 12-16 giờ

---

### 5. Creator SEO ⚠️ **Medium Priority**

**Yêu cầu:**
- SEO Title
- Meta Description
- Bio
- Avatar ALT
- Banner ALT
- Social links
- Country
- Tags
- Schema: Person

**Đánh giá:**
- ✅ **Quan trọng** — Creator là landing page
- ⚠️ **Phức tạp** — Tương tự Album SEO
- 🎯 **Khuyến nghị:** Làm sau Album SEO

**Công việc:**
- Thêm 8 fields vào bảng `creators`
- Admin form tương tự Album
- Schema Person JSON-LD
- **Thời gian:** 10-14 giờ

---

### 6. Image SEO (CỰC QUAN TRỌNG) ✅ **High Priority**

**Yêu cầu:**
- `alt_text` (mô tả ảnh)
- `title` (tiêu đề ảnh)
- `caption` (chú thích)
- Auto-rename filename (thay vì `IMG_837273.jpg` → `bambi-rem-cosplay-vol01-001.webp`)

**Đánh giá:**
- ✅ **Rất quan trọng** — Yukvix sống bằng ảnh
- ✅ **Phù hợp** — DB đã có `alt_text`, `title`, `caption`
- ⚠️ **Chưa có:** Auto-rename filename

**Công việc:**
- Thêm auto-rename logic trong image processor
- Tạo admin UI để edit ALT text hàng loạt
- Validate ALT text (không để trống)
- **Thời gian:** 6-8 giờ

---

### 7. Image Sitemap ✅ **Medium Priority**

**Yêu cầu:**
- `/sitemap-images.xml` chứa tất cả ảnh
- Mỗi ảnh có `<image:loc>`, `<image:title>`

**Đánh giá:**
- ✅ **Quan trọng** — Giúp lên Google Image
- ✅ **Dễ** — Tương tự sitemap album
- ⚠️ **Lớn** — 4000+ ảnh → file XML ~2MB

**Công việc:**
- Tạo API endpoint `/sitemap-images.xml`
- Pagination (split thành multiple sitemaps nếu > 50K ảnh)
- **Thời gian:** 3-4 giờ

---

### 8. Schema JSON-LD ⚠️ **High Priority (nhưng phức tạp)**

**Yêu cầu:**
- Homepage: WebSite Schema, Organization Schema
- Creator: Person Schema, ProfilePage Schema
- Album: ImageGallery Schema, CreativeWork Schema, Breadcrumb Schema
- VIP: Product Schema, Offer Schema

**Đánh giá:**
- ✅ **Rất quan trọng** — Google hiểu content tốt hơn
- ⚠️ **Phức tạp** — 8 loại schema khác nhau
- 🎯 **Khuyến nghị:** Triển khai theo giai đoạn

**Công việc:**
- Tạo utility function để generate schema JSON
- Render schema trong `<head>` của mỗi page
- Test với Google Rich Results Test
- **Thời gian:** 10-14 giờ

---

### 9. Open Graph / Social Share ✅ **Medium Priority**

**Yêu cầu:**
- `og:title`, `og:description`, `og:image`, `og:url`
- `twitter:card`

**Đánh giá:**
- ✅ **Quan trọng** — Khi user share trên Discord, X, Facebook
- ✅ **Dễ** — Chỉ cần thêm meta tags
- ✅ **Phù hợp** — DB đã có cover image

**Công việc:**
- Render OG meta tags trong `<head>`
- Dùng album cover làm OG image
- **Thời gian:** 2-3 giờ

---

### 10. Multi Language SEO ⚠️ **Medium Priority (phức tạp)**

**Yêu cầu:**
- URL: `/en/`, `/zh-cn/`, `/zh-tw/`, `/ko/`, `/ja/`
- `hreflang` tags
- Không dịch tên album (chỉ dịch UI)

**Đánh giá:**
- ✅ **Quan trọng** — Yukvix target global
- ⚠️ **Phức tạp** — Cần refactor routing
- ⚠️ **Hiện tại:** Dự án dùng i18n nhưng URL không có language prefix
- 🎯 **Khuyến nghị:** Làm sau các feature khác

**Công việc:**
- Refactor routing để thêm language prefix
- Thêm `hreflang` tags
- Update sitemap với language variants
- **Thời gian:** 16-20 giờ

---

### 11. Canonical chống duplicate ✅ **Medium Priority**

**Yêu cầu:**
- Canonical URL cho album (bỏ query params như `?sort=new`, `?page=2`)

**Đánh giá:**
- ✅ **Quan trọng** — Tránh duplicate content penalty
- ✅ **Dễ** — Chỉ cần thêm `<link rel="canonical">`

**Công việc:**
- Render canonical tag trong `<head>`
- **Thời gian:** 1-2 giờ

---

### 12. Pagination SEO ⚠️ **Low Priority**

**Yêu cầu:**
- Canonical + prev/next logic cho album list pagination

**Đánh giá:**
- ⚠️ **Ít quan trọng** — Album list không phải core content
- ⚠️ **Phức tạp** — Cần logic prev/next
- 🎯 **Khuyến nghị:** Làm sau

**Công việc:**
- Thêm `rel="prev"` và `rel="next"` tags
- Unique title cho mỗi page
- **Thời gian:** 2-3 giờ

---

### 13. Tag SEO ⚠️ **Medium Priority**

**Yêu cầu:**
- Mỗi tag có SEO Title, Description, Cover, Schema

**Đánh giá:**
- ✅ **Quan trọng** — Tag là landing page
- ⚠️ **Phức tạp** — Tương tự Album/Creator SEO
- 🎯 **Khuyến nghị:** Làm sau Album SEO

**Công việc:**
- Thêm fields vào bảng `tags`
- Admin form
- Schema TagCollection
- **Thời gian:** 8-10 giờ

---

### 14. Category SEO ⚠️ **Medium Priority**

**Yêu cầu:**
- Mỗi category có SEO Title, Meta Description, Description text

**Đánh giá:**
- ✅ **Quan trọng** — Category là landing page
- ⚠️ **Phức tạp** — Tương tự Tag SEO
- 🎯 **Khuyến nghị:** Làm sau Tag SEO

**Công việc:**
- Thêm fields vào bảng `categories`
- Admin form
- **Thời gian:** 6-8 giờ

---

### 15. Internal Linking ⚠️ **Low Priority (nhưng tốt)**

**Yêu cầu:**
- "More from [Creator]"
- "Related Albums"
- "Same Character"
- "Same Series"
- "Popular Tags"

**Đánh giá:**
- ✅ **Tốt cho SEO** — Giúp Google crawl
- ⚠️ **Phức tạp** — Cần query logic
- 🎯 **Khuyến nghị:** Làm sau core SEO

**Công việc:**
- Query related albums (same creator, character, series, tags)
- Render suggestions trong album detail
- **Thời gian:** 6-8 giờ

---

### 16. Redirect Manager ⚠️ **Low Priority**

**Yêu cầu:**
- Admin UI để manage 301/302 redirects
- Auto-redirect khi đổi album slug

**Đánh giá:**
- ✅ **Quan trọng** — Khi đổi slug cần preserve SEO value
- ⚠️ **Phức tạp** — Cần DB table + admin UI
- 🎯 **Khuyến nghị:** Làm sau core SEO

**Công việc:**
- Tạo bảng `redirects`
- Admin UI
- Middleware để handle redirects
- Auto-create redirect khi album slug đổi
- **Thời gian:** 8-10 giờ

---

### 17. SEO Audit Dashboard ⚠️ **Medium Priority**

**Yêu cầu:**
- Albums missing SEO title
- Albums missing description
- Images missing ALT
- Creators missing bio
- Duplicate slug
- Noindex pages
- Broken links
- Large images
- 404 errors

**Đánh giá:**
- ✅ **Rất hữu ích** — Giúp admin kiểm soát SEO
- ⚠️ **Phức tạp** — Cần nhiều queries
- 🎯 **Khuyến nghị:** Làm sau core SEO fields

**Công việc:**
- Tạo admin page "SEO Audit"
- 8 audit checks
- Report + export CSV
- **Thời gian:** 10-12 giờ

---

### 18. Performance SEO ✅ **Đã có sẵn**

**Yêu cầu:**
- AVIF/WebP
- Lazy loading
- Blur placeholder
- Responsive srcset
- CDN cache

**Đánh giá:**
- ✅ **Đã triển khai** — PhotoSwipe viewer + 3-tier image loading
- ✅ **Wasabi CDN** — Đã setup
- ✅ **WebP** — Image processor tạo webp
- ✅ **Lazy loading** — PhotoSwipe built-in

**Kết luận:** Không cần làm gì thêm.

---

### 19. Structured URL ✅ **Đã có sẵn**

**Yêu cầu:**
- `/album/bambi-rem-vol-001`
- `/creator/bambi`

**Đánh giá:**
- ✅ **Đã triển khai** — URL structure rõ ràng

**Kết luận:** Không cần làm gì thêm.

---

## Phân loại ưu tiên

### 🔴 **Critical (Bắt buộc, làm ngay)**

| # | Tính năng | Thời gian | Lý do |
|---|---|---|---|
| 2 | Sitemap tự động | 4-6h | Google cần crawl |
| 3 | Robots.txt | 0.5h | Cơ bản nhất |
| 4 | Meta SEO Album | 12-16h | Album là core content |
| 6 | Image SEO | 6-8h | Yukvix sống bằng ảnh |
| 9 | Open Graph | 2-3h | Social share |

**Tổng:** 25-36 giờ

---

### 🟡 **High (Nên làm trong 3 tháng)**

| # | Tính năng | Thời gian | Lý do |
|---|---|---|---|
| 1 | Tracking (Phase 1: GTM+GA4) | 8-12h | Analytics quan trọng |
| 5 | Creator SEO | 10-14h | Creator là landing page |
| 7 | Image Sitemap | 3-4h | Google Image ranking |
| 8 | Schema JSON-LD | 10-14h | Rich results |
| 11 | Canonical | 1-2h | Duplicate content |
| 13 | Tag SEO | 8-10h | Tag là landing page |
| 14 | Category SEO | 6-8h | Category là landing page |

**Tổng:** 46-64 giờ

---

### 🟢 **Medium (Nên làm trong 6 tháng)**

| # | Tính năng | Thời gian | Lý do |
|---|---|---|---|
| 12 | Pagination SEO | 2-3h | Ít quan trọng |
| 15 | Internal Linking | 6-8h | Tốt cho UX + SEO |
| 16 | Redirect Manager | 8-10h | Khi đổi slug |
| 17 | SEO Audit Dashboard | 10-12h | Admin tool |

**Tổng:** 26-33 giờ

---

### 🔵 **Low (Làm sau, có thể bỏ qua)**

| # | Tính năng | Thời gian | Lý do |
|---|---|---|---|
| 1 | Tracking (Phase 2+3) | 8-12h | Không bắt buộc ngay |
| 10 | Multi Language SEO | 16-20h | Phức tạp, refactor routing |

**Tổng:** 24-32 giờ

---

## Tổng cộng

| Mức độ | Thời gian | Ghi chú |
|---|---|---|
| **Critical** | 25-36h | Làm ngay (1-2 tuần) |
| **High** | 46-64h | Làm trong 3 tháng |
| **Medium** | 26-33h | Làm trong 6 tháng |
| **Low** | 24-32h | Tùy chọn |
| **TỔNG** | **121-165h** | ~3-4 tuần (full-time) |

---

## Gợi ý triển khai tối ưu

### **Phase 1: Foundation (1-2 tuần) — 25-36 giờ**

Làm trước để website có thể crawl được:

1. ✅ Robots.txt (0.5h)
2. ✅ Sitemap tự động (4-6h)
3. ✅ Meta SEO Album (12-16h)
4. ✅ Image SEO (6-8h)
5. ✅ Open Graph (2-3h)
6. ✅ Canonical (1-2h)

**Kết quả:** Website có thể crawl, album có meta tags, ảnh có ALT text.

---

### **Phase 2: Analytics + Rich Results (3 tháng) — 46-64 giờ**

Sau Phase 1 hoàn thành:

1. ✅ Tracking (GTM + GA4) (8-12h)
2. ✅ Creator SEO (10-14h)
3. ✅ Image Sitemap (3-4h)
4. ✅ Schema JSON-LD (10-14h)
5. ✅ Tag SEO (8-10h)
6. ✅ Category SEO (6-8h)

**Kết quả:** Analytics hoạt động, rich results lên Google, creator/tag/category có SEO.

---

### **Phase 3: Admin Tools + Polish (6 tháng) — 26-33 giờ**

Sau Phase 2 hoàn thành:

1. ✅ Internal Linking (6-8h)
2. ✅ Redirect Manager (8-10h)
3. ✅ SEO Audit Dashboard (10-12h)
4. ✅ Pagination SEO (2-3h)

**Kết quả:** Admin có tools kiểm soát SEO, internal linking tốt.

---

### **Phase 4: Advanced (12 tháng) — 24-32 giờ**

Tùy chọn:

1. ⚠️ Multi Language SEO (16-20h) — Phức tạp, cần refactor routing
2. ⚠️ Tracking Phase 2+3 (8-12h) — Thêm pixels khác

---

## Khuyến nghị cụ thể cho Yukvix

### ✅ **Nên làm ngay (Phase 1)**

1. **Robots.txt** — 30 phút
2. **Sitemap** — 1 tuần
3. **Meta SEO Album** — 2 tuần (DB migration + admin form)
4. **Image SEO** — 1 tuần (auto-rename + ALT validation)
5. **Open Graph** — 3 giờ
6. **Canonical** — 1 giờ

**Timeline:** 1-2 tuần, **Effort:** 1 developer  
**ROI:** 🔥 Cao — Website sẽ crawl được, ảnh lên Google Image

---

### ⚠️ **Nên làm trong 3 tháng (Phase 2)**

1. **Tracking (GTM + GA4)** — 1 tuần
2. **Creator SEO** — 1.5 tuần
3. **Image Sitemap** — 3 giờ
4. **Schema JSON-LD** — 1.5 tuần
5. **Tag + Category SEO** — 1.5 tuần

**Timeline:** 6-8 tuần, **Effort:** 1 developer  
**ROI:** 🔥 Cao — Rich results, analytics, creator landing pages

---

### 🟢 **Có thể làm sau (Phase 3+4)**

- Internal Linking, Redirect Manager, SEO Audit Dashboard
- Multi Language SEO (phức tạp, cần refactor routing)

---

## Câu hỏi cần xác nhận

1. **Bạn có muốn làm Phase 1 ngay không?** (1-2 tuần)
2. **Bạn có muốn làm Phase 2 trong 3 tháng không?** (6-8 tuần)
3. **Bạn có muốn refactor routing cho Multi Language SEO không?** (phức tạp)
4. **Bạn có muốn admin UI cho SEO Audit không?** (tốt nhưng không bắt buộc)

---

## Kết luận

**Yêu cầu SEO của bạn rất toàn diện và chuyên nghiệp.** Nhưng không thể làm tất cả cùng lúc. Khuyến nghị:

1. **Phase 1 (1-2 tuần):** Foundation — Robots.txt, Sitemap, Meta SEO, Image SEO
2. **Phase 2 (3 tháng):** Analytics + Rich Results — Tracking, Creator SEO, Schema
3. **Phase 3 (6 tháng):** Admin Tools — Internal Linking, Redirect Manager, Audit
4. **Phase 4 (12 tháng):** Advanced — Multi Language SEO

Bạn muốn tôi bắt đầu Phase 1 không?
