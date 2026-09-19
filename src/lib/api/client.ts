import { apiPart1a } from "./client-api-1a";
import { apiPart1b } from "./client-api-1b";
import { apiPart2 } from "./client-api-2";
import { placeholderUser } from "./client-list";
import type { LoginResult } from "./client-list";
import type { Session, User } from "./types";

export { asArray, API_BASE, USE_MOCK } from "./client-http";
export type { ListFilter, PagedList, LoginResult } from "./client-list";

export const api = { ...apiPart1a, ...apiPart1b, ...apiPart2 };

export function normalizeLogin(result: LoginResult | string): Session {
  if (typeof result === "string") {
    return {
      token: result,
      user: placeholderUser(""),
      kind: "staff",
    };
  }
  return { token: result.token, user: result.user, kind: "staff" };
}
