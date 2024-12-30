import { redirect } from 'next/navigation';
import { Settings } from './settings';
import { getTeamForUserWithMembers } from '@/lib/db/queries';
import { getUserFromSession } from '@/lib/auth/session';

export default async function SettingsPage() {
  const user = await getUserFromSession();

  if (!user) {
    redirect('/sign-in');
  }

  const teamData = await getTeamForUserWithMembers(user.id);

  if (!teamData) {
    throw new Error('Team not found');
  }

  return <Settings teamData={teamData} />;
}
