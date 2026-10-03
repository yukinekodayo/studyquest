import { rpc } from './rpc';
import { groupNameSchema, firstIssue } from '@/domain/validation';
import { ValidationError } from './auth';

export const fetchMyGroups = () => rpc('my_groups');
export const fetchGroupDetail = (id: string) => rpc('get_group_detail', { p_group: id });

export async function createGroup(name: string): Promise<string> {
  const parsed = groupNameSchema.safeParse(name);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  return rpc('create_group', { p_name: parsed.data });
}
export const inviteToGroup = (groupId: string, userId: string): Promise<void> =>
  rpc('invite_to_group', { p_group: groupId, p_user: userId }).then(() => undefined);
export const respondGroupInvite = (groupId: string, accept: boolean): Promise<void> =>
  rpc('respond_group_invite', { p_group: groupId, p_accept: accept }).then(() => undefined);
export const leaveGroup = (groupId: string): Promise<void> =>
  rpc('leave_group', { p_group: groupId }).then(() => undefined);
export const deleteGroup = (groupId: string): Promise<void> =>
  rpc('delete_group', { p_group: groupId }).then(() => undefined);
