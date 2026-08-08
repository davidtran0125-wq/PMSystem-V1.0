import { Transform } from 'class-transformer';

/**
 * Biến chuỗi rỗng thành `undefined` cho các trường không bắt buộc.
 *
 * Biểu mẫu HTML luôn gửi lên `""` cho ô người dùng bỏ trống, không phải bỏ hẳn
 * trường đó. Với cột thường thì vô hại, nhưng với cột `String? @unique` thì
 * `""` là một giá trị thật: bản ghi đầu tiên lưu được, mọi bản ghi sau va vào
 * ràng buộc duy nhất và hỏng. Lỗi kiểu này chỉ lộ ra ở người dùng thứ hai, nên
 * rất dễ lọt qua khâu kiểm thử.
 */
export const EmptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );
