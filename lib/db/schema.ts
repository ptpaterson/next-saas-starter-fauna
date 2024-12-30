import { DocumentT, fql } from 'fauna';

export type UserData = {
  name?: string;
  email: string;
  role: string;
  createdAt: string; // Fauna Time, needs to be cast to string
  deletedAt?: string; // Fauna Time, needs to be cast to string
};

export type TeamData = {
  name: string;
  createdAt: string; // Fauna Time, needs to be cast to string
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeProductId?: string;
  planName?: string;
  subscriptionStatus?: string;
};

export type TeamMemberData = {
  user: User;
  team: Team;
  role: string;
  joinedAt: string; // Fauna Time, needs to be cast to string
};

export type ActivityLogData = {
  team: Team;
  user?: User;
  action: string;
  timestamp: string; // Fauna Time, needs to be cast to string
  ipAddress?: string;
};

export type InvitationData = {
  team: Team;
  email: string;
  role: string;
  invitedBy: User;
  invitedAt: string; // Fauna Time, needs to be cast to string
  status: string;
};

export type User = DocumentT<UserData>;
export type WithTeam = { team: Team };
export type Team = DocumentT<TeamData>;
export type WithMembers = { members: User[] };
export type TeamMember = DocumentT<TeamMemberData>;
export type ActivityLog = DocumentT<ActivityLogData>;
export type Invitation = DocumentT<InvitationData>;

export const ACTIVITY_TYPES = {
  SIGN_UP: 'SIGN_UP',
  SIGN_IN: 'SIGN_IN',
  SIGN_OUT: 'SIGN_OUT',
  UPDATE_PASSWORD: 'UPDATE_PASSWORD',
  DELETE_ACCOUNT: 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT: 'UPDATE_ACCOUNT',
  CREATE_TEAM: 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER: 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER: 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION: 'ACCEPT_INVITATION',
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

// Common FQL projections

export const USER_FIELDS = fql`{
  id,
  name,
  email,
  role,
  createdAt: .createdAt.toString(),
  deletedAt: .deletedAt.toString(),
}`;

export const TEAM_FIELDS = fql`{
  id,
  name,
  createdAt: .createdAt.toString(),
  stripeCustomerId,
  stripeSubscriptionId,
  stripeProductId,
  planName,
  subscriptionStatus,
}`;

export const USER_FIELDS_WITH_TEAM = fql`{
  id,
  name,
  email,
  role,
  createdAt: .createdAt.toString(),
  deletedAt: .deletedAt.toString(),
  team ${TEAM_FIELDS},
}`;

export const ACTIVITY_LOG_FIELDS = fql`{
  id,
  team ${TEAM_FIELDS},
  user ${USER_FIELDS},
  action,
  timestamp: .timestamp.toString(),
  ipAddress,
}`;
