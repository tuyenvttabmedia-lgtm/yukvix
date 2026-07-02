# Rà Soát Kiến Trúc: Phương Án 3 (Premium Image Viewer) cho Yukvix

**Ngày:** 2026-06-01  
**Trạng thái:** ✅ Phù hợp — Cần thêm 2 tính năng, không cần thay đổi cấu trúc lớn

---

## 1. Cấu Trúc Hiện Tại vs Phương Án 3

### 1.1 Storage Layer (Wasabi)

**Hiện tại:**
```
albums/{albumId}/
├── original/{timestamp}_{name}.{ext}     ← Ảnh gốc (5-8MB)
├── webp/{timestamp}_{name}.webp          ← Full WebP (2400px, 2-4MB)
├── medium/{timestamp}_{name}_medium.webp ← Medium (1200px, 400-700KB)
└── thumb/{timestamp}_{name}_thumb.webp   ← Thumbnail (400px, 80KB)
```

**Phương án 3 cần:**
```
albums/{albumId}/
├── original/{timestamp}_{name}.{ext}     ✅ Có rồi
├── webp/{timestamp}_{name}.webp          ⚠️ Dùng làm "medium" (1600px)
├── medium/{timestamp}_{name}_medium.webp ⚠️ Dùng làm "thumbnail" (600px)
└── thumb/{timestamp}_{name}_thumb.webp   ✅ Có rồi (400px)
```

**Đánh giá:** 
- ❌ **Vấn đề:** Hiện tại `webp` là 2400px (quá lớn cho thumbnail grid), `medium` là 1200px (tốt cho lightbox)
- ✅ **Giải pháp:** Không cần thay đổi Wasabi. Chỉ cần:
  - Dùng `thumb` (400px) cho album grid
  - Dùng `medium` (1200px) cho lightbox mặc định
  - Dùng `original` on-demand khi zoom > 200%

### 1.2 Database Schema

**Hiện tại:**
```ts
mediaItems {
  id
  originalKey       ✅
  thumbKey          ✅
  webpKey           ✅
  originalUrl       ✅
  thumbUrl          ✅
  webpUrl           ✅
  mediumKey         ❌ Không có
  mediumUrl         ❌ Không có
  filename
  width
  height
  fileSize
  mimeType
  createdAt
}
```

**Phương án 3 cần:**
```ts
mediaItems {
  id
  originalKey       ✅
  thumbKey          ✅
  webpKey           ⚠️ Dùng làm "mediumKey"
  mediumKey         ❌ Cần thêm (dùng webp hiện tại)
  originalUrl       ✅
  thumbUrl          ✅
  webpUrl           ⚠️ Dùng làm "mediumUrl"
  mediumUrl         ❌ Cần thêm
  filename
  width
  height
  fileSize
  mimeType
  createdAt
}
```

**Đánh giá:**
- ✅ **Không cần thay đổi DB:** Có thể tái sử dụng `webpKey` → `mediumKey` và `webpUrl` → `mediumUrl`
- ⚠️ **Lưu ý:** Đặt tên cột hơi confusing (webp dùng làm medium). Nên rename sau để rõ ràng.

### 1.3 Frontend: Album Grid

**Hiện tại:**
```tsx
<img src={photo.displayUrl || photo.thumbUrl || ""} />
```

**Phương án 3 cần:**
```tsx
<img 
  src={photo.thumbUrl || ""}  // 400px thumbnail
  onClick={() => openLightbox(index)}
/>
```

**Đánh giá:** ✅ Hầu như không thay đổi, chỉ thêm click handler

### 1.4 Frontend: Lightbox Viewer

**Hiện tại:**
```tsx
<img
  src={photo.mediumUrl || photo.webpUrl || ""}
  srcSet={`${photo.mediumUrl} 1200w, ${photo.webpUrl} 2400w`}
  sizes="(max-width: 1280px) 1200px, 2400px"
/>
```

**Phương án 3 cần:**
```tsx
// PhotoSwipe 5 component
<PhotoSwipe
  items={photos.map(p => ({
    src: p.mediumUrl,      // 1200px default
    srcset: p.mediumUrl,   // Hiển thị medium
    width: p.width,
    height: p.height,
    alt: p.altText,
    // Lazy load original khi zoom > 200%
    original: p.originalUrl,
  }))}
  onZoom={(zoom) => {
    if (zoom > 2 && !loadedOriginal[index]) {
      preloadOriginal(index);
    }
  }}
/>
```

**Đánh giá:** 
- ❌ **Cần thêm:** PhotoSwipe 5 library
- ❌ **Cần thêm:** Lazy load original logic
- ❌ **Cần thêm:** Zoom event handler
- ⚠️ **Cần thêm:** Guest/VIP role check

---

## 2. Checklist Triển Khai

### Phase 1: Foundation (Không thay đổi cấu trúc)

- [ ] **Thêm mediumKey, mediumUrl vào DB schema** (optional, rename sau)
  - Hoặc: Dùng webpKey/webpUrl làm mediumKey/mediumUrl (tạm thời)
  - Ưu điểm: Không cần migration
  - Nhược điểm: Tên cột confusing

- [ ] **Cập nhật db.ts: listMediaItems**
  - Return `mediumUrl` (từ `webpUrl`)
  - Return `mediumKey` (từ `webpKey`)

- [ ] **Cập nhật frontend: AlbumDetail.tsx**
  - Sử dụng `thumbUrl` cho album grid
  - Sử dụng `mediumUrl` cho lightbox mặc định

### Phase 2: PhotoSwipe Integration

- [ ] **Cài đặt PhotoSwipe 5**
  ```bash
  pnpm add photoswipe
  ```

- [ ] **Tạo component: PhotoSwipeViewer.tsx**
  - Render PhotoSwipe lightbox
  - Desktop controls: zoom, pan, fullscreen, download, close
  - Mobile: pinch zoom, swipe nav, double-tap zoom
  - Keyboard: ESC close, arrow nav

- [ ] **Thay thế lightbox cũ bằng PhotoSwipeViewer**

### Phase 3: Lazy Load Original

- [ ] **Thêm on-demand original loading**
  - Khi zoom > 200%, gọi API để lấy original URL
  - Preload original ±1 ảnh (background)

- [ ] **Thêm guest/VIP role check**
  - Guest: zoom max 2x, không load original
  - VIP: zoom ∞, load original on-demand

- [ ] **Thêm download button**
  - Guest: download medium (1200px)
  - VIP: download original (4K)

### Phase 4: Optimization

- [ ] **Preload next/prev medium ảnh**
- [ ] **Cache zoom state per image**
- [ ] **Monitor bandwidth usage**
- [ ] **Test album 100+ ảnh**

---

## 3. Ước Tính Công Việc

| Phase | Task | Độ khó | Thời gian |
|---|---|---|---|
| 1 | DB schema + frontend update | 🟢 Dễ | 1-2h |
| 2 | PhotoSwipe integration | 🟡 Trung | 3-4h |
| 3 | Lazy load + role check | 🟡 Trung | 2-3h |
| 4 | Optimization + testing | 🟡 Trung | 2-3h |
| **Tổng** | | | **8-12h** |

---

## 4. Rủi Ro & Giải Pháp

| Rủi ro | Mức độ | Giải pháp |
|---|---|---|
| PhotoSwipe không tương thích React 19 | 🔴 Cao | Test trước, có fallback |
| Zoom event lag trên mobile | 🟡 Trung | Throttle event handler |
| Original load chậm trên 4G | 🟡 Trung | Preload background, show loading |
| Guest user bypass zoom limit | 🟡 Trung | Check role server-side |
| Album 200+ ảnh → DOM nặng | 🟡 Trung | Dùng virtual scroll nếu cần |

---

## 5. Kết Luận

✅ **Phương án 3 hoàn toàn phù hợp với dự án hiện tại**

**Không cần thay đổi cấu trúc lớn:**
- Storage Wasabi: ✅ Đã có 3 tầp ảnh cần thiết
- DB schema: ✅ Có thể dùng cột hiện tại (webp → medium)
- Frontend: ✅ Chỉ cần thêm PhotoSwipe + lazy load logic

**Ưu tiên triển khai:**
1. PhotoSwipe integration (tác động lớn, độ khó trung)
2. Lazy load original (tối ưu bandwidth)
3. Guest/VIP role check (tạo giá trị VIP)
4. Optimization (fine-tuning)

**Khuyến nghị tiếp theo:**
- Bắt đầu Phase 1 + 2 ngay (không có blocker)
- Test PhotoSwipe trên React 19 trước
- Deploy staging trước production
- Monitor bandwidth sau deploy
