import { useFocusEffect, useRouter } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { View, Text, FlatList, Button, TextInput, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const db = SQLite.openDatabaseSync('smartgallery.db');

export default function PeopleScreen() {
  const [people, setPeople] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchPeople();
    }, [])
  );

  const fetchPeople = async () => {
    try {
      const records = await db.getAllAsync('SELECT * FROM people ORDER BY name');
      setPeople(records as any[]);
    } catch (error) {
      console.error("Failed to fetch people from DB:", error);
    }
  };

  const handleAddPerson = async () => {
    if (newPersonName.trim() === '') return;

    try {
      await db.runAsync('INSERT INTO people (name) VALUES (?)', [newPersonName]);
      setNewPersonName('');
      setModalVisible(false);
      fetchPeople();
    } catch (error) {
      console.error("Failed to add person:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>People</Text>
        <Button title="Add New" onPress={() => setModalVisible(true)} />
      </View>

      <FlatList
        data={people}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/person?person_id=${item.id}`)}>
            <View style={styles.personItem}>
              <Text style={styles.personName}>{item.name}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(!modalVisible);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalText}>Add New Person</Text>
            <TextInput
              style={styles.input}
              placeholder="Person's Name"
              value={newPersonName}
              onChangeText={setNewPersonName}
            />
            <Button title="Add" onPress={handleAddPerson} />
            <Button title="Cancel" color="red" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  personItem: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  personName: { fontSize: 18 },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22
  },
  modalView: {
    margin: 20,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
    width: 200,
  },
  modalText: {
    marginBottom: 15,
    textAlign: "center"
  }
});