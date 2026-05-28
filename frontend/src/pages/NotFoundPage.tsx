import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h1 className="text-6xl font-bold text-gray-900">404</h1>
      <p className="mt-3 text-xl font-semibold text-gray-700">Page not found</p>
      <p className="mt-2 text-sm text-gray-500">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="btn-primary mt-8">
        <Home className="h-4 w-4" />
        Back to home
      </Link>
    </div>
  );
}
