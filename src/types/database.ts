/**
 * Supabase の型定義(supabase/migrations と対応。手書き)。
 * クライアントが直接書けるのは tasks の insert/update と profiles の update だけ。
 * それ以外はすべて RPC(サーバー側のゲームロジック)経由。
 */
import type { AvatarKey } from '@/domain/validation';
import type { SessionState } from '@/domain/timer';
import type { StampType } from '@/domain/stamps';

export type TaskKind = 'must' | 'bonus';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type ReactionKind = 'clap' | 'fire' | 'party' | 'book';

export type ProfileRow = {
  id: string;
  nickname: string;
  avatar: AvatarKey;
  friend_code: string;
  timezone: string;
  share_subject: boolean;
  created_at: string;
};

export type TaskRow = {
  id: string;
  user_id: string;
  task_date: string;
  title: string;
  planned_minutes: number;
  kind: TaskKind;
  status: TaskStatus;
  sort_order: number;
  xp_awarded: number;
  completed_at: string | null;
  created_at: string;
};

export type StampRow = {
  id: string;
  user_id: string;
  stamp_type: StampType;
  earned_date: string;
  streak_count: number;
};

export type DailyCompletionRow = {
  id: string;
  user_id: string;
  completed_date: string;
  must_total: number;
  streak_count: number;
};

export type FriendRequestRow = {
  id: string;
  from_user: string;
  to_user: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

export type ReactionRow = {
  id: string;
  from_user: string;
  to_user: string;
  kind: ReactionKind;
  reaction_date: string;
  created_at: string;
};

export interface DayResult {
  cleared: boolean;
  newly_cleared: boolean;
  must_total?: number;
  must_done?: number;
  streak?: number;
  /** 押すことになるハンコの種類(まだ押していない) */
  stamp_type?: StampType | null;
  stamp_claimed?: boolean;
  xp_bonus?: number;
}

export interface CompleteTaskResult {
  task_id: string;
  xp_gained: number;
  day?: DayResult;
  already_finished?: boolean;
}

export interface ClaimStampResult {
  stamp_type: StampType;
  streak: number;
  earned_date: string;
  newly_claimed: boolean;
}

export interface MyStats {
  xp: number;
  level: number;
  xp_in_level: number;
  xp_per_level: number;
  current_streak: number;
  longest_streak: number;
  total_days: number;
  month_days: number;
  cleared_today: boolean;
  today_streak: number | null;
  today_stamp_type: StampType | null;
  today_stamp_claimed: boolean;
  /** 達成したのにまだ押していない日 */
  unclaimed_dates: string[];
  stamp_counts: Partial<Record<StampType, number>>;
  today: string;
  server_now: string;
}

export interface FriendOverviewRow {
  user_id: string;
  nickname: string;
  avatar: AvatarKey;
  is_me: boolean;
  must_total: number;
  must_done: number;
  cleared: boolean;
  current_streak: number;
  studying: boolean;
  studying_subject: string | null;
  studying_seconds: number | null;
  my_reactions: ReactionKind[];
}

export interface PartyMember {
  user_id: string;
  nickname: string;
  avatar: AvatarKey;
  is_me: boolean;
  elapsed_seconds: number;
}
export interface PartyRoom {
  subject: string;
  count: number;
  members: PartyMember[];
}

export interface GroupWeek {
  target: number;
  progress: number;
  starts_on: string;
  ends_on: string;
  days_left: number;
}
export interface GroupSummary {
  id: string;
  name: string;
  member_count: number;
  week: GroupWeek;
}
export interface GroupInvite {
  group_id: string;
  name: string;
  invited_by: string | null;
}
export interface MyGroups {
  groups: GroupSummary[];
  invites: GroupInvite[];
}
export interface GroupMember {
  user_id: string;
  nickname: string;
  avatar: AvatarKey;
  is_me: boolean;
  must_total: number;
  must_done: number;
  cleared: boolean;
  studying: boolean;
}
export interface GroupDetail {
  id: string;
  name: string;
  is_owner: boolean;
  week: GroupWeek;
  members: GroupMember[];
  pending_invites: Array<{ user_id: string; nickname: string; avatar: AvatarKey }>;
}

type Empty = Record<string, never>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Empty;
        Update: Partial<Pick<ProfileRow, 'nickname' | 'avatar' | 'share_subject'>>;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: { title: string; planned_minutes: number; kind?: TaskKind; task_date?: string };
        Update: Partial<Pick<TaskRow, 'title' | 'planned_minutes' | 'kind'>>;
        Relationships: [];
      };
      stamps: { Row: StampRow; Insert: Empty; Update: Empty; Relationships: [] };
      daily_completions: { Row: DailyCompletionRow; Insert: Empty; Update: Empty; Relationships: [] };
      friend_requests: { Row: FriendRequestRow; Insert: Empty; Update: Empty; Relationships: [] };
      reactions: { Row: ReactionRow; Insert: Empty; Update: Empty; Relationships: [] };
    };
    Views: Empty;
    Functions: {
      today_tasks: { Args: Empty; Returns: TaskRow[] };
      complete_task: { Args: { p_task_id: string }; Returns: CompleteTaskResult };
      uncomplete_task: { Args: { p_task_id: string }; Returns: undefined };
      reorder_tasks: { Args: { p_ids: string[] }; Returns: undefined };
      start_session: { Args: { p_task_id: string }; Returns: SessionState };
      pause_session: { Args: { p_session_id: string }; Returns: SessionState };
      resume_session: { Args: { p_session_id: string }; Returns: SessionState };
      finish_session: { Args: { p_session_id: string; p_complete: boolean }; Returns: CompleteTaskResult };
      get_session_state: { Args: { p_task_id: string }; Returns: SessionState | null };
      get_active_session: { Args: Empty; Returns: SessionState | null };
      get_my_stats: { Args: Empty; Returns: MyStats };
      claim_stamp: { Args: { p_date?: string | null }; Returns: ClaimStampResult };
      send_friend_request: { Args: { p_code: string }; Returns: { result: 'requested' | 'friends' } };
      respond_friend_request: { Args: { p_request_id: string; p_accept: boolean }; Returns: undefined };
      remove_friend: { Args: { p_friend_id: string }; Returns: undefined };
      send_reaction: { Args: { p_to: string; p_kind: ReactionKind }; Returns: undefined };
      friends_overview: { Args: Empty; Returns: FriendOverviewRow[] };
      study_party_rooms: { Args: Empty; Returns: PartyRoom[] };
      join_study_party: { Args: { p_subject: string }; Returns: { task_id: string; session: SessionState } };
      create_group: { Args: { p_name: string }; Returns: string };
      invite_to_group: { Args: { p_group: string; p_user: string }; Returns: undefined };
      respond_group_invite: { Args: { p_group: string; p_accept: boolean }; Returns: undefined };
      leave_group: { Args: { p_group: string }; Returns: undefined };
      my_groups: { Args: Empty; Returns: MyGroups };
      get_group_detail: { Args: { p_group: string }; Returns: GroupDetail };
      delete_my_account: { Args: Empty; Returns: undefined };
    };
    Enums: Empty;
    CompositeTypes: Empty;
  };
};
