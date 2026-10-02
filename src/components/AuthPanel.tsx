import type { AuthState } from "../hooks/useAuth";

type AuthPanelProps = Pick<
  AuthState,
  | "loading"
  | "authenticated"
  | "canEdit"
  | "discordConfigured"
  | "roleGateConfigured"
  | "user"
  | "error"
> & {
  onLogout: () => void;
};

/** Legacy Discord panel — unused while public edit mode is on. */
export function AuthPanel(_props: AuthPanelProps) {
  return null;
}
