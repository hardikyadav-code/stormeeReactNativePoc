import { View, Text, StyleSheet, TextInput } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.heading}>
          <Text style={styles.title}>Stormee</Text>
        </View>
        {/* CHAT VIEW  */}

        <View style={styles.chatView} >
          <Text>Conversation will come here ...</Text>
        </View>
        {/* FOOTER */}
        <View style={styles.footer}>
          <View style={styles.audiobox}>
          <View style={styles.speakerComponent}>
          <Text style={styles.speaker} >Speaker</Text>

          </View>

                    <View style={styles.audioComponents}>

          </View>
          </View>

          <TextInput
          placeholder='your message to stormee'
          style={styles.TextInput}
          >
            
          </TextInput>
        </View>


      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  title: {
    fontWeight: 'bold',
    fontSize: 24,
  },

  heading: {
    padding: 12,
    borderBottomColor: 'gray',
    borderBottomWidth: 1,
  },

  chatView: {
    flex: 1,
    padding: 12,
    backgroundColor: "#fdf2f8"
  },

  footer: {
    borderTopColor: 'gray',
    borderTopWidth: 1,
    padding: 12,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },

  TextInput: {
    width: '100%',
    margin: 2,
    height: 40,
    borderWidth: 1,
    borderBlockColor: 'gray',
    borderRadius: 5,
  },
  audiobox: {
    flexDirection: "row",
    justifyContent: "space-between"



  },
  audioComponents: {
    height: 30,
    width: "60%",
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderBlockColor: "gray"
  },
  speakerComponent:{
    flex: 1,
    backgroundColor: "gray",
    justifyContent: "center"
  },
  speaker:{
    
  }

});

export default App;






