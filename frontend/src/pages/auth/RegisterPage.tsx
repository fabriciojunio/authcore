import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, UserPlus, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Alert, FormField } from '@/components/ui';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'One uppercase letter')
    .regex(/[0-9]/, 'One number')
    .regex(/[^A-Za-z0-9]/, 'One special character'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

const passwordRules = [
  { id: 'length', label: 'At least 8 characters', check: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', check: (v: string) => /[A-Z]/.test(v) },
  { id: 'number', label: 'One number', check: (v: string) => /[0-9]/.test(v) },
  { id: 'special', label: 'One special character', check: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const passwordValue = watch('password', '');

  const onSubmit = async (data: RegisterForm) => {
    clearError();
    try {
      await registerUser(data.name, data.email, data.password, data.confirmPassword);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      // Error handled in store
    }
  };

  if (success) {
    return (
      <div className="animate-slide-up text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Account created!</h2>
        <p className="mt-2 text-sm text-gray-500">
          Please check your email to verify your account. Redirecting to login...
        </p>
      </div>
    );
  }

  return (
    <div className="animate-slide-up">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Create an account</h2>
        <p className="mt-1 text-sm text-gray-500">Get started for free today</p>
      </div>

      {error && <Alert type="error" message={error} className="mb-6" />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField label="Full name" error={errors.name?.message} required>
          <input
            {...register('name')}
            type="text"
            autoComplete="name"
            placeholder="John Doe"
            className={`input ${errors.name ? 'input-error' : ''}`}
          />
        </FormField>

        <FormField label="Work email" error={errors.email?.message} required>
          <input
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className={`input ${errors.email ? 'input-error' : ''}`}
          />
        </FormField>

        <FormField label="Password" error={errors.password?.message} required>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a strong password"
              className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* Password strength indicators */}
          {passwordValue && (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {passwordRules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-1.5">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      rule.check(passwordValue) ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      rule.check(passwordValue) ? 'text-green-700' : 'text-gray-400'
                    }`}
                  >
                    {rule.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </FormField>

        <FormField label="Confirm password" error={errors.confirmPassword?.message} required>
          <input
            {...register('confirmPassword')}
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            className={`input ${errors.confirmPassword ? 'input-error' : ''}`}
          />
        </FormField>

        <p className="text-xs text-gray-500">
          By creating an account, you agree to our{' '}
          <a href="#" className="text-primary-600 hover:underline">Terms of Service</a>{' '}
          and{' '}
          <a href="#" className="text-primary-600 hover:underline">Privacy Policy</a>.
        </p>

        <button type="submit" disabled={isLoading} className="btn-primary w-full">
          {isLoading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
