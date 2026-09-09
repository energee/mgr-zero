// lib/mgr/team-view.ts — view-model for Team (list_team_members).
export type TeamRowView = {
  key: string;
  title: string;
  detail: string;
  you?: boolean;
  src?: string;
};

export type TeamViewModel = {
  backHref?: string;
  rows: TeamRowView[];
};

export function toTeamViewProps(s: TeamViewModel): TeamViewModel {
  return s;
}
