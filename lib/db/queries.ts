import {
  ACTIVITY_TYPES,
  ActivityLog,
  Team,
  TEAM_FIELDS,
  User,
  USER_FIELDS,
  USER_FIELDS_WITH_TEAM,
  WithMembers,
  WithTeam,
} from './schema';
import { getServerClient } from './client';
import { fql, ServiceError } from 'fauna';

export type Page<T>= {
  data: T[];
  after?: string;
}

export const getUser = async (userId: string): Promise<User | null> => {
  const client = getServerClient();
  const response = await client.query<User>(fql`
    User.byId(${userId}) ${USER_FIELDS}
  `);

  return response.data;
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const client = getServerClient();
  const response = await client.query<User>(fql`
    User.by_email(${email}) ${USER_FIELDS}
  `);

  return response.data;
};

export const getUserWithTeam = async (
  userId: string,
): Promise<(User & WithTeam) | null> => {
  const client = getServerClient();
  const response = await client.query<User & WithTeam>(fql`
    User.byId(${userId}) ${USER_FIELDS_WITH_TEAM}
  `);

  return response.data;
};

export const getTeamForUser = async (userId: string): Promise<Team | null> => {
  const client = getServerClient();
  const response = await client.query<Team>(fql`
    let user = User.byId(${userId})!
    TeamMember.by_user(user).first().team ${TEAM_FIELDS}
  `);

  return response.data;
};

export const getTeamForUserWithMembers = async (
  userId: string,
): Promise<(Team & WithMembers) | null> => {
  const client = getServerClient();
  try {
    const response = await client.query<Team & WithMembers>(fql`
      let user = User.byId(${userId})!
      let team = user.team
      team {
        id,
        name,
        createdAt: .createdAt.toString(),
        stripeCustomerId,
        stripeSubscriptionId,
        stripeProductId,
        planName,
        subscriptionStatus,
        members: TeamMember.by_team(team).map(.user!).toArray() ${USER_FIELDS},
      }
    `);

    return response.data;
  } catch (error) {
    if (error instanceof ServiceError) {
      console.error(error.queryInfo?.summary);
    }
    throw error;
  }
};

export const getTeamByStripeCustomerId = async (
  customerId: string,
): Promise<Team | null> => {
  const client = getServerClient();
  const response = await client.query<Team>(fql`
    Team.by_stripeCustomerId(${customerId})
  `);

  return response.data;
};

export type TeamSubscriptionUpdateInput =
  | {
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      stripeProductId: string;
      planName: string;
      subscriptionStatus: string;
    }
  | {
      stripeCustomerId: string;
      stripeSubscriptionId: null;
      stripeProductId: null;
      planName: null;
      subscriptionStatus: string;
    };

export const updateTeamSubscription = async (
  teamId: string,
  subscriptionData: TeamSubscriptionUpdateInput,
): Promise<void> => {
  const client = getServerClient();
  await client.query(fql`Team.byId(${teamId})!.update(${subscriptionData})`);
};

export const getActivityLogs = async (
  userId: string,
  after?: string,
): Promise<Page<ActivityLog>> => {
  const client = getServerClient();

  let query;

  if (after) {
    query = fql`Set.paginate(${after})`;
  } else {
    query = fql`
      let user = User.byId(${userId})!
      ActivityLog.by_user(user)
    `;
  }

  const response = await client.query<Page<ActivityLog>>(query);

  return response.data;
};

export type CreateActivityLogInput = {
  teamId: string;
  userId?: string;
  action: string;
  ipAddress: string;
};

export const createActivityLog = async ({
  teamId,
  userId,
  action,
  ipAddress,
}: CreateActivityLogInput): Promise<ActivityLog> => {
  const client = getServerClient();
  const team = fql`Team.byId(${teamId})`;
  const user = userId ? fql`User.byId(${userId})` : null;
  const input = {
    team,
    user,
    action,
    ipAddress,
  };

  const response = await client.query<ActivityLog>(
    fql`ActivityLog.create(${input})`,
  );

  return response.data;
};

export const signUp = async (
  email: string,
  password: string,
): Promise<(User & WithTeam) | null> => {
  const client = getServerClient();
  const defaultTeamName = `${email}'s Team`;
  const query = fql`
    let email = ${email}

    // abort if the user already exists
    if (User.by_email(email).nonEmpty()) {
      abort("User already exists")
    }

    let team = Team.create({
      name: ${defaultTeamName},
    })
    
    // Create a user
    let user = User.create({
      email: email,
      role: "owner",
    })
    
    // Create credentials for the user.
    // The password will be automatically hashed by Fauna
    Credential.create({
      document: user,
      password: ${password},
    })
    
    // Connect the user and team together
    TeamMember.create({
      team: team,
      user: user,
      role: "owner",
    })

    ActivityLog.create({
      team: team,
      user: user,
      action: ${ACTIVITY_TYPES.CREATE_TEAM}
    })

    ActivityLog.create({
      team: team,
      user: user,
      action: ${ACTIVITY_TYPES.SIGN_UP}
    })

    user ${USER_FIELDS_WITH_TEAM}
  `;

  try {
    const response = await client.query<(User & WithTeam) | null>(query);
    return response.data;
  } catch (_) {
    return null;
  }
};

export const acceptInvitation = async (
  email: string,
  password: string,
  inviteId: string,
): Promise<(User & WithTeam) | null> => {
  const client = getServerClient();
  const query = fql`
      let email = ${email}

      // abort if the user already exists
      if (User.by_email(email).exists()) {
        abort("User already exists")
      }
      
      let invitation = Invitation.byId(${inviteId})!;
      if (invitation.status != "pending" || invitation.email != email) {
        abort("Invalid or expired invitation.")
      }

      invitation.update({ status: "accepted" })

      let team = Team.byId(invitation.teamId)
      
      // Create a user
      let user = User.create({
        email: email,
        role: invitation.role,
      })
      
      // Create credentials for the user.
      // The password will be automatically hashed by Fauna
      Credential.create({
        document: user,
        password: ${password},
      })
      
      // Connect the user and team together
      TeamMember.create({
        team: team,
        user: user,
        role: invitation.role,
      })

      ActivityLog.create({
        team: team,
        user: user,
        action: ${ACTIVITY_TYPES.ACCEPT_INVITATION}
      })

      ActivityLog.create({
        team: team,
        user: user,
        action: ${ACTIVITY_TYPES.SIGN_UP}
      })

      user ${USER_FIELDS_WITH_TEAM}
    `;

  try {
    const response = await client.query<(User & WithTeam) | null>(query);
    return response.data;
  } catch (_) {
    return null;
  }
};

export const signIn = async (
  email: string,
  password: string,
): Promise<(User & WithTeam) | null> => {
  const client = getServerClient();
  const query = fql`
    let user = User.by_email(${email}).first()!

    let verified = Credential.byDocument(user)!.verify(${password})

    if (verified) {
      ActivityLog.create({
        team: user.team,
        user: user,
        action: ${ACTIVITY_TYPES.SIGN_IN}
      })
    }

    user ${USER_FIELDS_WITH_TEAM}
  `;

  try {
    const response = await client.query<(User & WithTeam) | null>(query);
    return response.data;
  } catch (_) {
    return null;
  }
};

export const updatePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> => {
  const client = getServerClient();
  const query = fql`
    let user = User.by_id(${userId})!

    let creds = Credential.byDocument(user)!
    let verified = creds.verify(${currentPassword})

    if (verified) {
      creds.update({
        password: ${newPassword}
      })

      ActivityLog.create({
        team: user.team,
        user: user,
        action: ${ACTIVITY_TYPES.UPDATE_PASSWORD}
      })
    }

    verified
  `;

  try {
    const response = await client.query<boolean>(query);
    return response.data;
  } catch (_) {
    return false;
  }
};

export const updateUser = async (
  userId: string,
  data: Partial<Pick<User, 'name' | 'email'>>,
): Promise<User | null> => {
  const client = getServerClient();
  const query = fql`
    let user = User.by_id(${userId})!.update(${data})

    ActivityLog.create({
      team: user.team,
      user: user,
      action: ${ACTIVITY_TYPES.UPDATE_ACCOUNT}
    })

    user
  `;

  try {
    const response = await client.query<User>(query);
    return response.data;
  } catch (_) {
    return null;
  }
};

export const deleteUser = async (
  userId: string,
  password: string,
): Promise<boolean> => {
  const client = getServerClient();
  const query = fql`
    let user = User.by_id(${userId})!

    let verified = Credential.byDocument(user)!.verify(${password})

    if (verified) {
      // soft delete the user
      // Don't delete the teams either.
      user.update({
        deletedAt: Time.now(),
      })

      // remove the user from all teams
      TeamMember.by_user(user).forEach(.delete())

      ActivityLog.create({
        team: user.team,
        user: user,
        action: ${ACTIVITY_TYPES.DELETE_ACCOUNT}
      })
    }

    verified
  `;

  try {
    const response = await client.query<boolean>(query);
    return response.data;
  } catch (_) {
    return false;
  }
};

export const removeTeamMember = async (
  memberId: number,
  teamId: string,
  removedById: string,
): Promise<boolean> => {
  const client = getServerClient();
  const query = fql`
    let team = Team.byId(${teamId})!
    let removedBy = User.byId(${removedById})!
    let member = TeamMember.byId(${memberId})!
    
    if (member.team.id != team.id) {
      abort("Member not in this team")
    }

    // Delete the team member
    member.delete()

    // Log the activity
    ActivityLog.create({
      team: team,
      user: removedBy,
      action: ${ACTIVITY_TYPES.REMOVE_TEAM_MEMBER}
    })

    true
  `;

  try {
    await client.query<boolean>(query);
    return true;
  } catch (_) {
    return false;
  }
};

export type CreateTeamInvitationInput = {
  teamId: string;
  email: string;
  role: 'member' | 'owner';
  invitedBy: string;
};

export const createTeamInvitation = async (
  input: CreateTeamInvitationInput,
): Promise<boolean> => {
  const client = getServerClient();

  const query = fql`
    let team = Team.byId(${input.teamId})!
    let inviter = User.byId(${input.invitedBy})!
    let email = ${input.email}

    // Check if user is already a member
    let existingUser = User.by_email(email)
    if (existingUser.exists()) {
      if (TeamMember.all().where(.team == team && .user == existingUser).exists()) {
        abort("User is already a member of this team")
      }
    }

    // Check for existing pending invitation
    if (Invitation.all().where(
      .email == email && 
      .team == team && 
      .status == "pending"
    ).exists()) {
      abort("An invitation has already been sent to this email")
    }

    // Create the invitation
    Invitation.create({
      team: team,
      email: email,
      role: ${input.role},
      invitedBy: inviter,
      status: "pending"
    })

    // Log the activity
    ActivityLog.create({
      team: team,
      user: inviter,
      action: ${ACTIVITY_TYPES.INVITE_TEAM_MEMBER}
    })

    true
  `;

  try {
    await client.query<boolean>(query);
    return true;
  } catch (_) {
    return false;
  }
};
