import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View, Text, Image, FlatList, Button, StyleSheet, TouchableOpacity, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';

const db = SQLite.openDatabaseSync('smartgallery.db');

export default function TagFacesScreen() {
  const { asset_id } = useLocalSearchParams();
  const router = useRouter();
  const [photo, setPhoto] = useState<any>(null);
  const [faces, setFaces] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [selectedFace, setSelectedFace] = useState<any>(null);
  const [peopleModalVisible, setPeopleModalVisible] = useState(false);
  const [newPersonModalVisible, setNewPersonModalVisible] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  useEffect(() => {
    if (asset_id) {
      fetchPhotoAndFaces();
      fetchPeople();
    }
  }, [asset_id]);

  const fetchPhotoAndFaces = async () => {
    try {
      const photoRecord: any = await db.getFirstAsync('SELECT * FROM photos WHERE asset_id = ?', [asset_id]);
      setPhoto(photoRecord);
      if (photoRecord && photoRecord.faces_data) {
        setFaces(JSON.parse(photoRecord.faces_data));
      }
    } catch (error) {
      console.error("Failed to fetch photo and faces:", error);
    }
  };

  const fetchPeople = async () => {
    try {
      const records = await db.getAllAsync('SELECT * FROM people ORDER BY name');
      setPeople(records as any[]);
    } catch (error) {
      console.error("Failed to fetch people:", error);
    }
  };

  const handleSelectFace = (face: any) => {
    setSelectedFace(face);
    setPeopleModalVisible(true);
  };

  const handleAssignPerson = async (personId: number) => {
    try {
      await db.runAsync('UPDATE faceprints SET person_id = ? WHERE photo_asset_id = ? AND face_frame = ?',
        [personId, asset_id, JSON.stringify(selectedFace.frame)]
      );
      setPeopleModalVisible(false);
      // Optionally, refresh the data
    } catch (error) {
      console.error("Failed to assign person:", error);
    }
  };

  const handleAddNewPerson = () => {
    setPeopleModalVisible(false);
    setNewPersonModalVisible(true);
  };

  const handleCreatePerson = async () => {
    if (newPersonName.trim() === '') return;
    try {
      const result = await db.runAsync('INSERT INTO people (name) VALUES (?)', [newPersonName]);
      const newPersonId = result.lastInsertRowId;
      await handleAssignPerson(newPersonId);
      setNewPersonName('');
      setNewPersonModalVisible(false);
      fetchPeople();
    } catch (error) {
      console.error("Failed to create person:", error);
    }
  };

  const renderFace = ({ item }: { item: any }) => {
    // This is a simplified rendering. For a better UX, we would crop the face from the image.
    return (
      <View style={styles.faceContainer}>
        <TouchableOpacity onPress={() => handleSelectFace(item)}>
          <Text>Face</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Button title="Back" onPress={() => router.back()} />
      {photo && <Image source={{ uri: photo.uri }} style={styles.image} />}
      <FlatList
        data={faces}
        renderItem={renderFace}
        keyExtractor={(item, index) => index.toString()}
        horizontal
      />

      <Modal
        visible={peopleModalVisible}
        onRequestClose={() => setPeopleModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <FlatList
            data={people}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <Button title={item.name} onPress={() => handleAssignPerson(item.id)} />
            )}
          />
          <Button title="Add New Person" onPress={handleAddNewPerson} />
          <Button title="Cancel" color="red" onPress={() => setPeopleModalVisible(false)} />
        </View>
      </Modal>

      <Modal
        visible={newPersonModalVisible}
        onRequestClose={() => setNewPersonModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TextInput
            placeholder="Person's Name"
            value={newPersonName}
            onChangeText={setNewPersonName}
            style={styles.input}
          />
          <Button title="Create" onPress={handleCreatePerson} />
          <Button title="Cancel" color="red" onPress={() => setNewPersonModalVisible(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  image: { width: '100%', height: 300 },
  faceContainer: { padding: 10, borderWidth: 1, margin: 5 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  input: { height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 10, width: 200 },
});
