import { useGroupContext } from "../lib/context/GroupProvider";

export function useGroup() {
  return useGroupContext();
}
