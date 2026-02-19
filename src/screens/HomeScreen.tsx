import { useState } from "react";
import { Pressable, Text , View , StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StormeeModal from "./StormeeModal";

const HomeScreen = () => {
    const [isModal , setIsModal] = useState(false);
    return (
     
        <View style={styles.container}>
            <Text>Stormee</Text>
            <Pressable 
                style={styles.button}
                onPress={() => setIsModal(true)}
            >
                <Text style={styles.buttonText}>Open Stormee Assistant</Text>
            </Pressable>
            <StormeeModal
                visible={isModal}
                onClose={() => setIsModal(false)}
            />
        </View>
       
    )
}
export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
    justifyContent: "flex-end" ,
    alignItems: "center",
    backgroundColor: "#0b0b0f",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 18,
    color: "#fff",
    textAlign: "center",
  },
  button: {
    width:224,
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom:84,
    backgroundColor: "#3b82f6",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});