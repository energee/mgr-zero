import { z } from "zod";

const uuid = z.uuid();

/** True for a canonical UUID string, including the nil and max UUIDs. */
export const isUuid = (value: string | undefined): value is string => value !== undefined && uuid.safeParse(value).success;
