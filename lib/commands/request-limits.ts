/** 8 MiB accommodates a realistic 5,000-row CSV import while bounding unbounded string cells. */
export const MAX_COMMAND_BODY_BYTES = 8 * 1024 * 1024;
