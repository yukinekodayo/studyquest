import { Tabs, useRouter } from 'expo-router';
import { BottomNav, type NavKey } from '@/ui/BottomNav';
import { useIncomingRequests, useMyGroups, usePrefetchTabs } from '@/features/hooks';

/** タブ名 → 下部ナビでハイライトする項目 */
const NAV_OF: Record<string, NavKey> = {
  home: 'home',
  quest: 'quest',
  friends: 'friends',
  'study-party': 'friends',
  groups: 'groups',
  'groups/[id]': 'groups',
  profile: 'profile',
  stamps: 'profile',
  settings: 'profile',
};

const HREF_OF: Record<NavKey, string> = {
  home: '/home',
  quest: '/quest',
  friends: '/friends',
  groups: '/groups',
  profile: '/profile',
};

export default function TabsLayout() {
  const router = useRouter();
  usePrefetchTabs();
  const requests = useIncomingRequests();
  const groups = useMyGroups();
  const badge = {
    friends: (requests.data?.length ?? 0) > 0,
    groups: (groups.data?.invites.length ?? 0) > 0,
  };
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => {
        const current = props.state.routes[props.state.index]?.name ?? 'home';
        return <BottomNav active={NAV_OF[current] ?? 'home'} badge={badge} onSelect={(k) => router.navigate(HREF_OF[k] as never)} />;
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="quest" />
      <Tabs.Screen name="friends" />
      <Tabs.Screen name="groups" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="study-party" options={{ href: null }} />
      <Tabs.Screen name="stamps" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="groups/[id]" options={{ href: null }} />
    </Tabs>
  );
}
