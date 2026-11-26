/** Row / RPC result types – mirror docs/SOCIAL_SCHEMA.md */

export interface SocialProfile {
  id: string;
  username: string;
  display_name: string;
  color: string;
  share_workouts: boolean;
  created_at?: string;
}

export interface FriendRow {
  friendship_id: string;
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing' | 'friend';
  created_at: string;
}

export interface FeedItem {
  workout_id: string;
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  name: string;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  total_volume: number;
  total_sets: number;
  pr_count: number;
  top_exercises: { name: string; top_weight: number | null; top_weight_reps: number | null; volume: number }[] | null;
  reactions: Record<string, number> | null;
  my_reaction: string | null;
  is_me: boolean;
}

export interface LeaderRow {
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  value: number;
  reps: number | null;
  achieved_at: string;
  is_me: boolean;
}

export interface VolumeRow {
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  volume: number;
  workouts: number;
  sets: number;
  is_me: boolean;
}

export type ChallengeMetric = 'volume' | 'e1rm' | 'max_weight' | 'workouts' | 'sets';

export interface ChallengeSummary {
  id: string;
  title: string;
  metric: ChallengeMetric;
  exercise_key: string | null;
  exercise_name: string | null;
  starts_at: string;
  ends_at: string;
  creator: string;
  my_status: 'invited' | 'joined' | 'declined';
  members: number;
  leader_username: string | null;
  leader_score: number | null;
  my_score: number | null;
  my_rank: number | null;
}

export interface ChallengeScore {
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  status: 'invited' | 'joined' | 'declined';
  score: number | null;
  rank: number | null;
  is_me: boolean;
}

export type DuelStatus = 'pending' | 'active' | 'finished' | 'declined' | 'cancelled';

export interface DuelSummary {
  id: string;
  challenger: string;
  opponent: string;
  opponent_username: string;
  opponent_display_name: string;
  opponent_color: string;
  exercise_key: string | null;
  exercise_name: string | null;
  metric: 'volume' | 'reps';
  duration_min: number;
  status: DuelStatus;
  started_at: string | null;
  ends_at: string | null;
  created_at: string;
  i_am_challenger: boolean;
  my_score: number | null;
  opponent_score: number | null;
}

export interface DuelScore {
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  score: number;
  sets: number;
  last_set_at: string | null;
  is_me: boolean;
}

export const REACTIONS = ['💪', '🔥', '👏', '🏆'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const METRIC_LABELS: Record<ChallengeMetric, string> = {
  volume: 'Meistes Volumen',
  e1rm: 'Höchstes 1RM (geschätzt)',
  max_weight: 'Höchstes Gewicht',
  workouts: 'Meiste Workouts',
  sets: 'Meiste Sätze',
};
