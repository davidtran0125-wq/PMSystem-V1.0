/**
 * Đếm bản ghi theo trạng thái cho các màn hình danh sách.
 *
 * Mọi trạng thái của enum đều xuất hiện trong kết quả, kể cả trạng thái không
 * có bản ghi nào — giao diện nhờ vậy vẽ được đủ dải nút mà không phải đoán.
 * Điều kiện lọc truyền vào phải là điều kiện của danh sách **trừ chính bộ lọc
 * trạng thái**, để các con số không đổi khi người dùng bấm qua lại.
 */
export interface StatusCounts<S extends string> {
  total: number;
  counts: Record<S, number>;
}

/**
 * Phần chung của mọi Prisma delegate có cột `status`. Kiểu sinh tự động của
 * Prisma quá cụ thể để viết một hàm dùng chung, nên ở đây mô tả đúng phần chữ
 * ký thực sự được gọi.
 */
interface StatusGroupable {
  groupBy(args: {
    by: ['status'];
    where: unknown;
    _count: { _all: true };
  }): Promise<{ status: string; _count: { _all: number } }[]>;
}

export async function countByStatus<S extends string>(
  delegate: unknown,
  where: unknown,
  statuses: Record<string, S>,
): Promise<StatusCounts<S>> {
  const grouped = await (delegate as StatusGroupable).groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });

  const counts = Object.fromEntries(
    Object.values(statuses).map((s) => [s, 0]),
  ) as Record<S, number>;
  let total = 0;
  for (const row of grouped) {
    counts[row.status as S] = row._count._all;
    total += row._count._all;
  }

  return { total, counts };
}
