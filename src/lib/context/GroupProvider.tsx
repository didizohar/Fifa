import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMyGroups } from "../groups";
import { groupKeys } from "../queryClient";
import type { Group, GroupMembership } from "../types/database";
import { useAuth } from "../../hooks/useAuth";

const LAST_GROUP_KEY = "fc-rival:lastGroupId";

interface GroupContextValue {
  memberships: GroupMembership[];
  groups: Group[];
  currentGroupId: string | null;
  currentGroup: Group | null;
  currentRole: GroupMembership["role"] | null;
  isLoading: boolean;
  setCurrentGroupId: (groupId: string) => void;
  refetch: () => Promise<unknown>;
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentGroupId, setCurrentGroupIdState] = useState<string | null>(null);
  const [hasHydratedStoredGroup, setHasHydratedStoredGroup] = useState(false);

  const {
    data: memberships = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: groupKeys.mine(user?.id),
    queryFn: () => fetchMyGroups(user!.id),
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) {
      setCurrentGroupIdState(null);
      setHasHydratedStoredGroup(false);
      return;
    }
    AsyncStorage.getItem(LAST_GROUP_KEY).then((stored) => {
      if (stored) setCurrentGroupIdState(stored);
      setHasHydratedStoredGroup(true);
    });
  }, [user]);

  useEffect(() => {
    if (!hasHydratedStoredGroup || isLoading) return;
    const stillValid = memberships.some((m) => m.group.id === currentGroupId);
    if (!stillValid) {
      const fallback = memberships[0]?.group.id ?? null;
      setCurrentGroupIdState(fallback);
    }
  }, [hasHydratedStoredGroup, isLoading, memberships, currentGroupId]);

  const setCurrentGroupId = useCallback((groupId: string) => {
    setCurrentGroupIdState(groupId);
    AsyncStorage.setItem(LAST_GROUP_KEY, groupId);
  }, []);

  const value = useMemo<GroupContextValue>(() => {
    const groups = memberships.map((m) => m.group);
    const currentMembership = memberships.find((m) => m.group.id === currentGroupId) ?? null;
    return {
      memberships,
      groups,
      currentGroupId,
      currentGroup: currentMembership?.group ?? null,
      currentRole: currentMembership?.role ?? null,
      isLoading: isLoading || !hasHydratedStoredGroup,
      setCurrentGroupId,
      refetch,
    };
  }, [memberships, currentGroupId, isLoading, hasHydratedStoredGroup, setCurrentGroupId, refetch]);

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroupContext(): GroupContextValue {
  const context = useContext(GroupContext);
  if (!context) throw new Error("useGroupContext must be used within a GroupProvider");
  return context;
}
