import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { changePasswordSchema } from '@order-desk/shared';
import { api } from '../../lib/axios';
import { apiError } from '../../lib/errors';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../app/toast';

const schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: changePasswordSchema.shape.newPassword,
  confirm: z.string(),
}).refine((v) => v.newPassword === v.confirm, { message: 'The new passwords do not match.', path: ['confirm'] });
type Values = z.infer<typeof schema>;

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [serverErr, setServerErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const first = errors.currentPassword?.message ?? errors.newPassword?.message ?? errors.confirm?.message ?? serverErr;
  const submit = handleSubmit(async (v) => {
    setServerErr('');
    try {
      await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast('Password changed');
      onClose();
    } catch (e) {
      const a = apiError(e);
      setServerErr(a.status === 401 || a.status === 403 ? 'Current password is incorrect.' : a.message);
    }
  });
  return (
    <Dialog onClose={onClose} label="Change password" testId="pw-dialog">
      <form onSubmit={submit} noValidate data-testid="pw-form" style={{ textAlign: 'left' }}>
        <h3 className="ok" style={{ textAlign: 'center' }}>Change password</h3>
        <label htmlFor="pwCur">Current password</label>
        <input id="pwCur" data-testid="pw-current" type="password" autoComplete="current-password" {...register('currentPassword')} />
        <label htmlFor="pwNew">New password</label>
        <input id="pwNew" data-testid="pw-new" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...register('newPassword')} />
        <label htmlFor="pwNew2">Confirm new password</label>
        <input id="pwNew2" data-testid="pw-confirm" type="password" autoComplete="new-password" {...register('confirm')} />
        <div role="alert" data-testid="pw-error" className={`err${first ? ' show' : ''}`}>{first}</div>
        <button type="submit" className="btn" disabled={isSubmitting} data-testid="pw-save">Save password</button>
        <button type="button" className="btn ghost" onClick={onClose} data-testid="pw-cancel">Cancel</button>
      </form>
    </Dialog>
  );
}
