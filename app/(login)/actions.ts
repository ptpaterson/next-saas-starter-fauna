'use server';

import { z } from 'zod';
import { ActivityType, ACTIVITY_TYPES } from '@/lib/db/schema';
import { getSession, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createCheckoutSession } from '@/lib/payments/stripe';
import * as client from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser,
} from '@/lib/auth/middleware';

async function logActivity(
  teamId: string | null | undefined,
  userId: string,
  type: ActivityType,
  ipAddress?: string,
) {
  if (teamId === null || teamId === undefined) {
    return;
  }

  await client.createActivityLog({
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || '',
  });
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  const user = await client.signIn(email, password);

  if (!user) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password,
    };
  }

  await setSession(user);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: user.team, priceId });
  }

  redirect('/dashboard');
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional(),
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId } = data;

  const user = inviteId
    ? await client.acceptInvitation(email, password, inviteId)
    : await client.signUp(email, password);

  if (!user) {
    return {
      error: 'Registration failed. Please try again.',
      email,
      password,
    };
  }

  await setSession(user);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: user.team, priceId });
  }

  redirect('/dashboard');
});

export async function signOut() {
  const session = await getSession();
  if (!session) {
    return { error: 'User not authenticated' };
  }

  const user = await client.getUserWithTeam(session.user.id);
  if (!user) {
    return { error: 'User not authenticated' };
  }

  await logActivity(user.team.id, user.id, ACTIVITY_TYPES.SIGN_OUT);
  (await cookies()).delete('session');
}

const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(100),
    newPassword: z.string().min(8).max(100),
    confirmPassword: z.string().min(8).max(100),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword } = data;

    const success = await client.updatePassword(
      user.id,
      currentPassword,
      newPassword,
    );

    if (!success) {
      return { error: 'Update password failed.' };
    }

    return { success: 'Password updated successfully.' };
  },
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const success = await client.deleteUser(user.id, password);
    if (!success) {
      return { error: 'Account deletion failed.' };
    }

    (await cookies()).delete('session');
    redirect('/sign-in');
  },
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;

    const success = await client.updateUser(user.id, { name, email });
    if (!success) {
      return { error: 'Account update failed.' };
    }

    return { success: 'Account updated successfully.' };
  },
);

const removeTeamMemberSchema = z.object({
  memberId: z.number(),
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await client.getUserWithTeam(user.id);

    if (!userWithTeam?.team.id) {
      return { error: 'User is not part of a team' };
    }

    const success = await client.removeTeamMember(
      memberId,
      userWithTeam.team.id,
      user.id,
    );

    if (!success) {
      return { error: 'Failed to remove team member' };
    }

    return { success: 'Team member removed successfully' };
  },
);

const inviteTeamMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['member', 'owner']),
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithTeam = await client.getUserWithTeam(user.id);

    if (!userWithTeam?.team.id) {
      return { error: 'User is not part of a team' };
    }

    const result = await client.createTeamInvitation({
      teamId: userWithTeam.team.id,
      email,
      role,
      invitedBy: user.id,
    });

    if (!result) {
      return { error: 'Failed to create invitation' };
    }

    // TODO: Send invitation email and include ?inviteId={id} to sign-up URL
    // await sendInvitationEmail(email, userWithTeam.team.name, role)

    return { success: 'Invitation sent successfully' };
  },
);
