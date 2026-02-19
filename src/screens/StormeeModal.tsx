import React from "react";
import {
  Modal,
  View,
  SafeAreaView,
  Image,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";

type StormeeModalProps = {
  visible: boolean;
  onClose: () => void;
};

const StormeeModal = ({ visible, onClose }: StormeeModalProps) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* NOTE: use png/jpg here only */}
            <Image
              source={{
                uri: "https://cdn-icons-png.flaticon.com/512/4712/4712109.png",
              }}
              style={styles.logo}
            />
            <Text style={styles.headerTitle}>Stormee</Text>
          </View>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* BODY */}
        <View style={styles.body}>
          <Text style={styles.placeholderText}>Chat UI will come here...</Text>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Mic + Input will be here</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0b0f",
  },

  header: {
    height: 60,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  logo: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111827",
  },

  closeBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  body: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
  },

  placeholderText: {
    color: "#9ca3af",
    fontSize: 16,
  },

  footer: {
    height: 72,
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingHorizontal: 16,
    justifyContent: "center",
  },

  footerText: {
    color: "#9ca3af",
    fontSize: 14,
  },
});

export default StormeeModal;
