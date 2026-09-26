// Errors that are safe to show to the client. Anything else becomes a generic 500.
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly fields?: Record<string, string>
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) => new AppError(400, message, 'bad_request', fields);
export const unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new AppError(401, message, 'unauthorized');
export const forbidden = (message = 'ไม่มีสิทธิ์ใช้งานส่วนนี้') => new AppError(403, message, 'forbidden');
export const notFound = (message = 'ไม่พบข้อมูล') => new AppError(404, message, 'not_found');
export const conflict = (message: string, code = 'conflict') => new AppError(409, message, code);
