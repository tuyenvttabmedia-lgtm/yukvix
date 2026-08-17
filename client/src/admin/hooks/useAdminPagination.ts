import { useCallback, useMemo, useState } from "react";

export function useAdminPagination(pageSize = 30) {
  const [page, setPage] = useState(1);

  const resetPage = useCallback(() => setPage(1), []);

  const totalPages = useCallback(
    (total: number) => Math.max(1, Math.ceil(total / pageSize)),
    [pageSize]
  );

  return useMemo(
    () => ({ page, setPage, resetPage, pageSize, totalPages }),
    [page, pageSize, resetPage, totalPages]
  );
}
