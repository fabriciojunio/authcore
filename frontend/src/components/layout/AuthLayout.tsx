import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden flex-col justify-between bg-gray-900 p-12 lg:flex lg:w-1/2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Enterprise</span>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold leading-tight text-white">
              Built for teams that move fast
            </h1>
            <p className="text-lg text-gray-400">
              Enterprise-grade infrastructure with the developer experience you deserve.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Uptime SLA', value: '99.9%' },
              { label: 'API Latency', value: '<50ms' },
              { label: 'Security Score', value: 'A+' },
              { label: 'Data encrypted', value: '100%' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-gray-800 p-4">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-gray-500">
          © {new Date().getFullYear()} Enterprise Inc. All rights reserved.
        </p>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 lg:px-16">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">Enterprise</span>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
