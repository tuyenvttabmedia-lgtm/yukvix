/** Vietnamese UI strings for admin — single source of truth */

export const adminGlossary = {
  action: {
    create: "Tạo mới",
    createAlbum: "Tạo album",
    createCreator: "Tạo cosplayer",
    createTag: "Tạo thẻ tag",
    save: "Lưu",
    cancel: "Hủy",
    delete: "Xóa",
    edit: "Chỉnh sửa",
    merge: "Gộp",
    refresh: "Làm mới",
  },
  pagination: {
    prev: "Trang trước",
    next: "Trang sau",
    summary: (page: number, totalPages: number, total: number, itemLabel: string) =>
      `Trang ${page}/${totalPages} · ${total} ${itemLabel}`,
  },
  empty: {
    default: "Chưa có dữ liệu",
    search: "Không tìm thấy kết quả phù hợp",
  },
  loading: {
    page: "Đang tải...",
  },
} as const;
