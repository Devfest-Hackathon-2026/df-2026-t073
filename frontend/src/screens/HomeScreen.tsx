import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {API_BASE_URL, checkBackendHealth} from '../services/api';

export function HomeScreen(): React.JSX.Element {
  const [status, setStatus] = useState<string>('Not checked yet');
  const [loading, setLoading] = useState<boolean>(false);

  const handlePingBackend = async () => {
    setLoading(true);
    try {
      const res = await checkBackendHealth();
      setStatus(`Online (${res.status})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setStatus(`Unreachable (${message})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.badge}>GDG DevFest Tokyo 2026 • Team t073</Text>
      <Text style={styles.title}>DevFest Mobile App</Text>
      <Text style={styles.subtitle}>
        Barebones React Native (Android) + Firebase App Distribution
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Backend Endpoint</Text>
        <Text style={styles.mono}>{API_BASE_URL}/healthz</Text>
        <Text style={styles.statusText}>Status: {status}</Text>

        <Pressable
          style={styles.button}
          onPress={handlePingBackend}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Check Backend Health</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0f172a',
  },
  badge: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  mono: {
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  statusText: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});

