import React, { useEffect, useState } from 'react';
import { View, Text, Button, ScrollView, StyleSheet } from 'react-native';
import StormeeServiceRN from '../services/stormee/StormeeServiceRN';
import { StormeeClientRN } from '../services/stormee/ StormeeClient';

export function AudioTest() {
  const [status, setStatus] = useState('Initializing...');
  const [logs, setLogs] = useState<string[]>([]);
  const client = new StormeeClientRN({
    sessionId: 'test-session-' + Date.now(),
    onConnect: () => {
      addLog('✅ Connected to server');
      setStatus('Connected');
    },
    onDisconnect: () => {
      addLog('❌ Disconnected');
      setStatus('Disconnected');
    },
    onTranscription: (text) => {
      addLog('📝 Transcription: ' + text);
    },
    onAudioChunk: () => {
      addLog('🔊 Audio chunk received');
    },
    onError: (err) => {
      addLog('🚨 Error: ' + JSON.stringify(err));
      setStatus('Error');
    },
    onStateChange: (state) => {
      addLog('📊 State: ' + state);
    },
  });

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  useEffect(() => {
    const runTest = async () => {
      try {
        addLog('🎵 Starting initialization...');
        
        // Initialize
        await StormeeServiceRN.initialize();
        addLog('✅ Service initialized');

        setStatus('Ready');
      } catch (error) {
        addLog('❌ Init failed: ' + JSON.stringify(error));
        setStatus('Error');
      }
    };

    runTest();
  }, []);

  const handleTest = async () => {
    try {
      addLog('🔌 Connecting...');
      setStatus('Connecting');
      
      await client.connect();
      addLog('✅ Connected');
      
      // Wait 2 seconds then start streaming
      setTimeout(() => {
        addLog('🎤 Requesting audio stream...');
        client.startStreaming('Hello, please generate some audio');
      }, 2000);
      
    } catch (error) {
      addLog('❌ Error: ' + JSON.stringify(error));
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AVAudioEngine Test</Text>
        <Text style={styles.status}>Status: {status}</Text>
      </View>

      <View style={styles.buttons}>
        <Button 
          title="🎵 Start Audio Test" 
          onPress={handleTest}
          color="#007AFF"
        />
        <Button 
          title="Stop" 
          onPress={() => {
            client.stopStreaming();
            addLog('⏹️ Stopped');
          }}
          color="#FF3B30"
        />
      </View>

      <View style={styles.logs}>
        <Text style={styles.logsTitle}>Logs:</Text>
        {logs.map((log, i) => (
          <Text key={i} style={styles.logItem}>{log}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  status: {
    fontSize: 16,
    color: '#666',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  logs: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
  },
  logsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  logItem: {
    fontSize: 12,
    fontFamily: 'Courier New',
    marginBottom: 4,
    color: '#333',
  },
});