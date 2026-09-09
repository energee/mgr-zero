export type SchedulePackagingRunViewModel = {
  plannedOn: string;
  source: string;
  sourceDetail: string;
  outputs: { key: string; title: string; detail: string; qty: number; listed: boolean }[];
  leftInSource: string;
  leftLabel: string;
  materials: (string | number)[][];
  warning?: string;
};

export function toSchedulePackagingRunViewProps(model: SchedulePackagingRunViewModel): SchedulePackagingRunViewModel {
  return model;
}
