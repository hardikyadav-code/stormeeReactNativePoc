import { View, Text, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';

export default function App(){
  return (
    <SafeAreaProvider>
      <HomeScreen/>
    </SafeAreaProvider>
  )
}