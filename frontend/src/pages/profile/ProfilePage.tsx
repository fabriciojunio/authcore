import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { User, Lock, Camera } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { apiClient } from '@/services/api.client';
import { Alert, FormField, Avatar } from '@/components/ui';
import { clsx } from 'clsx';

const profileSchema = z.object({
  name: z.string().min(2, 'At least 2 characters').max(100),
  phone: z.string().max(20).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'One uppercase letter')
    .regex(/[0-9]/, 'One number')
    .regex(/[^A-Za-z0-9]/, 'One special character'),
  confirmNewPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmNewPassword, {
  message: 'Passwords do not match',
  path: ['confirmNewPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

type Tab = 'profile' | 'security';

export function ProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const { user } = useAuthStore();

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', phone: '' },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const updateProfile = useMutation({
    mutationFn: (data: ProfileForm) =>
      apiClient.patch('/users/profile', data),
    onSuccess: () => {
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
  });

  const changePassword = useMutation({
    mutationFn: (data: PasswordForm) =>
      apiClient.patch('/users/change-password', data),
    onSuccess: () => {
      setPasswordSuccess(true);
      passwordForm.reset();
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
  });

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'profile', label: 'Personal Info', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your profile and security preferences</p>
      </div>

      {/* Avatar section */}
      <div className="card p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar name={user?.name ?? 'U'} size="lg" />
            <button className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-white shadow-md hover:bg-primary-700">
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="badge-blue mt-1 capitalize">{user?.role}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form
              onSubmit={profileForm.handleSubmit((d) => updateProfile.mutate(d))}
              className="space-y-5"
            >
              {profileSuccess && (
                <Alert type="success" message="Profile updated successfully!" />
              )}
              {updateProfile.error && (
                <Alert type="error" message="Failed to update profile. Please try again." />
              )}

              <FormField
                label="Full name"
                error={profileForm.formState.errors.name?.message}
                required
              >
                <input
                  {...profileForm.register('name')}
                  type="text"
                  className={`input ${profileForm.formState.errors.name ? 'input-error' : ''}`}
                />
              </FormField>

              <FormField label="Email">
                <input
                  type="email"
                  value={user?.email}
                  disabled
                  className="input"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Email cannot be changed. Contact support if needed.
                </p>
              </FormField>

              <FormField
                label="Phone number"
                error={profileForm.formState.errors.phone?.message}
                hint="Optional. Used for account recovery."
              >
                <input
                  {...profileForm.register('phone')}
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  className="input"
                />
              </FormField>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateProfile.isPending}
                  className="btn-primary"
                >
                  {updateProfile.isPending ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-8">
              {/* Change Password */}
              <section>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Change Password</h3>
                <form
                  onSubmit={passwordForm.handleSubmit((d) => changePassword.mutate(d))}
                  className="space-y-4"
                >
                  {passwordSuccess && (
                    <Alert type="success" message="Password changed successfully!" />
                  )}
                  {changePassword.error && (
                    <Alert type="error" message="Failed to change password. Check your current password." />
                  )}

                  <FormField
                    label="Current password"
                    error={passwordForm.formState.errors.currentPassword?.message}
                    required
                  >
                    <input
                      {...passwordForm.register('currentPassword')}
                      type="password"
                      autoComplete="current-password"
                      className={`input ${passwordForm.formState.errors.currentPassword ? 'input-error' : ''}`}
                    />
                  </FormField>

                  <FormField
                    label="New password"
                    error={passwordForm.formState.errors.newPassword?.message}
                    required
                  >
                    <input
                      {...passwordForm.register('newPassword')}
                      type="password"
                      autoComplete="new-password"
                      className={`input ${passwordForm.formState.errors.newPassword ? 'input-error' : ''}`}
                    />
                  </FormField>

                  <FormField
                    label="Confirm new password"
                    error={passwordForm.formState.errors.confirmNewPassword?.message}
                    required
                  >
                    <input
                      {...passwordForm.register('confirmNewPassword')}
                      type="password"
                      autoComplete="new-password"
                      className={`input ${passwordForm.formState.errors.confirmNewPassword ? 'input-error' : ''}`}
                    />
                  </FormField>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={changePassword.isPending}
                      className="btn-primary"
                    >
                      {changePassword.isPending ? 'Changing...' : 'Change password'}
                    </button>
                  </div>
                </form>
              </section>

              {/* 2FA Section */}
              <section className="border-t border-gray-100 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Two-Factor Authentication</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Add an extra layer of security to your account using an authenticator app.
                    </p>
                  </div>
                  <button className="btn-secondary whitespace-nowrap text-xs">
                    Enable 2FA
                  </button>
                </div>
              </section>

              {/* Danger Zone */}
              <section className="rounded-xl border border-red-200 bg-red-50 p-5">
                <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
                <p className="mt-1 text-sm text-red-600">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button className="btn-danger mt-4 text-xs">
                  Delete my account
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
