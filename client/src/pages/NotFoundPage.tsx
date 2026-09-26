import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-brand-700">404</p>
      <p className="text-lg font-semibold">ไม่พบหน้าที่ต้องการ</p>
      <Link to="/" className="font-medium text-brand-700 underline">
        กลับหน้าร้าน
      </Link>
    </div>
  );
}
