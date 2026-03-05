import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { useAuth } from "../../lib/auth-context";

export default function AppTabsLayout() {
  const { signOut } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#f8fafc",
        tabBarStyle: { backgroundColor: "#0f172a", borderTopColor: "#1e293b" },
        tabBarActiveTintColor: "#f97316",
        tabBarInactiveTintColor: "#94a3b8"
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="speedometer-outline" size={size} />,
          headerRight: () => (
            <Ionicons
              color="#f8fafc"
              name="log-out-outline"
              onPress={() => void signOut()}
              size={22}
              style={{ marginRight: 16 }}
            />
          )
        }}
      />
      <Tabs.Screen
        name="opportunities"
        options={{
          title: "Opportunities",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="flash-outline" size={size} />
        }}
      />
      <Tabs.Screen
        name="properties"
        options={{
          title: "Properties",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="home-outline" size={size} />
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Contacts",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="people-outline" size={size} />
        }}
      />
      <Tabs.Screen
        name="outreach"
        options={{
          title: "Outreach",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="paper-plane-outline" size={size} />
        }}
      />
      <Tabs.Screen
        name="copilot"
        options={{
          title: "Copilot",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="chatbox-ellipses-outline" size={size} />
        }}
      />
    </Tabs>
  );
}
