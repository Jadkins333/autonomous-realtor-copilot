import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { getApiBaseUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("agent@demo.local");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/(app)/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Realtor Copilot Mobile</Text>
      <Text style={styles.subtitle}>Demo API: {getApiBaseUrl()}</Text>

      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#64748b"
        style={styles.input}
        value={email}
      />
      <TextInput
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#64748b"
        secureTextEntry
        style={styles.input}
        value={password}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={onSubmit} style={styles.button}>
        <Text style={styles.buttonText}>{loading ? "Signing in..." : "Sign In"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    padding: 20,
    justifyContent: "center",
    gap: 12
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "800"
  },
  subtitle: {
    color: "#94a3b8",
    marginBottom: 10
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#111827"
  },
  error: {
    color: "#fca5a5"
  },
  button: {
    marginTop: 6,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16
  }
});
