import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Settings,
  LogOut,
  UserPlus,
  Lock,
  UserCog,
  AlertCircle,
  UserMinus,
  Mail,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react';
import { ACTIVITY_TYPES, ActivityType } from '@/lib/db/schema';
import { getActivityLogs } from '@/lib/db/queries';
import { getSession } from '@/lib/auth/session';

const iconMap: Record<ActivityType, LucideIcon> = {
  [ACTIVITY_TYPES.SIGN_UP]: UserPlus,
  [ACTIVITY_TYPES.SIGN_IN]: UserCog,
  [ACTIVITY_TYPES.SIGN_OUT]: LogOut,
  [ACTIVITY_TYPES.UPDATE_PASSWORD]: Lock,
  [ACTIVITY_TYPES.DELETE_ACCOUNT]: UserMinus,
  [ACTIVITY_TYPES.UPDATE_ACCOUNT]: Settings,
  [ACTIVITY_TYPES.CREATE_TEAM]: UserPlus,
  [ACTIVITY_TYPES.REMOVE_TEAM_MEMBER]: UserMinus,
  [ACTIVITY_TYPES.INVITE_TEAM_MEMBER]: Mail,
  [ACTIVITY_TYPES.ACCEPT_INVITATION]: CheckCircle,
};

function getRelativeTime(date: Date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

function formatAction(action: ActivityType): string {
  switch (action) {
    case ACTIVITY_TYPES.SIGN_UP:
      return 'You signed up';
    case ACTIVITY_TYPES.SIGN_IN:
      return 'You signed in';
    case ACTIVITY_TYPES.SIGN_OUT:
      return 'You signed out';
    case ACTIVITY_TYPES.UPDATE_PASSWORD:
      return 'You changed your password';
    case ACTIVITY_TYPES.DELETE_ACCOUNT:
      return 'You deleted your account';
    case ACTIVITY_TYPES.UPDATE_ACCOUNT:
      return 'You updated your account';
    case ACTIVITY_TYPES.CREATE_TEAM:
      return 'You created a new team';
    case ACTIVITY_TYPES.REMOVE_TEAM_MEMBER:
      return 'You removed a team member';
    case ACTIVITY_TYPES.INVITE_TEAM_MEMBER:
      return 'You invited a team member';
    case ACTIVITY_TYPES.ACCEPT_INVITATION:
      return 'You accepted an invitation';
    default:
      return 'Unknown action occurred';
  }
}

export default async function ActivityPage() {
  const session = await getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }
  const logs = await getActivityLogs(session.user.id);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        Activity Log
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.data.length > 0 ? (
            <ul className="space-y-4">
              {logs.data.map((log) => {
                const Icon = iconMap[log.action as ActivityType] || Settings;
                const formattedAction = formatAction(
                  log.action as ActivityType
                );

                return (
                  <li key={log.id} className="flex items-center space-x-4">
                    <div className="bg-orange-100 rounded-full p-2">
                      <Icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formattedAction}
                        {log.ipAddress && ` from IP ${log.ipAddress}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {getRelativeTime(new Date(log.timestamp))}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12">
              <AlertCircle className="h-12 w-12 text-orange-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No activity yet
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                When you perform actions like signing in or updating your
                account, they&apos;ll appear here.
              </p>
            </div>
          )}
          {!!logs.after
            ? `There's more activity. TODO: add a "load more" button.`
            : null}
        </CardContent>
      </Card>
    </section>
  );
}
