import { View, Text, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AudioTest } from './src/components/AudioTest';
import HomeScreen from './src/screens/HomeScreen';

export default function App(){
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <HomeScreen/>
    </SafeAreaView>
  )
}