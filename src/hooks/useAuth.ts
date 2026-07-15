import { useAuthContext } from "../lib/context/AuthProvider";

export function useAuth() {
  return useAuthContext();
}
