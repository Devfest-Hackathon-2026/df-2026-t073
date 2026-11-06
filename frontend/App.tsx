import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {HomeScreen} from './src/screens/HomeScreen';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <SafeAreaView style={{flex: 1, backgroundColor: '#0f172a'}}>
        <HomeScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;
