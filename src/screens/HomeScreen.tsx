import { useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import StormeeModal from './StormeeModal';
import RattModel from './RattModel';

const HomeScreen = () => {
  // 1. Fixed the typo (setIsRattModel -> setIsRattMode)
  const [isModal, setIsModal] = useState(false);
  const [isRattMode, setIsRattMode] = useState(false);

  return (
    <View style={styles.container}>

      {/* Center Section */}
      <View style={styles.centerSection}>
        <Text style={styles.title}>Stormee</Text>
      </View>

      {/* Bottom Buttons */}
      <View style={styles.buttonRow}>
        
        {/* Button 1: General Assistant (Maybe text-based?) */}
        <Pressable
          style={styles.button}
          onPress={() => setIsModal(true)}
        >
          <Text style={styles.buttonText}>
            Open Assistant
          </Text>
        </Pressable>

        {/* Button 2: RATT Voice Mode */}
        <Pressable
          style={styles.button}
          onPress={() => setIsRattMode(true)} // 2. Trigger the RATT state here
        >
          <Text style={styles.buttonText}>
            Record Audio
          </Text>
        </Pressable>
      </View>

      {/* 3. Connect your RATT Modal to the isRattMode state */}
      <StormeeModal
        visible={isModal}
        onClose={() => setIsRattMode(false)}
      />

      {/* If you have a separate modal for the "Open Assistant" text mode, 
          you would render it here using `visible={isModal}` */}
      <RattModel
      visible={isRattMode}
      onClose={()=>setIsRattMode(false)}

      />

    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0f",
  },
  centerSection: {
    flex: 1,                    
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 40,
  },
  button: {
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});