import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, Button } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const db = SQLite.openDatabaseSync('smartgallery.db');

export default function PersonScreen() {
  const { person_id } = useLocalSearchParams();
  const router = useRouter();
  const [person, setPerson] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);

  useEffect(() => {
    if (person_id) {
      fetchPerson();
      fetchPhotos();
    }
  }, [person_id]);

  const fetchPerson = async () => {
    try {
      const personRecord: any = await db.getFirstAsync('SELECT * FROM people WHERE id = ?', [person_id]);
      setPerson(personRecord);
    } catch (error) {
      console.error("Failed to fetch person:", error);
    }
  };

  const fetchPhotos = async () => {
    try {
      const photoRecords = await db.getAllAsync(`
        SELECT p.* FROM photos p
        JOIN faceprints f ON p.asset_id = f.photo_asset_id
        WHERE f.person_id = ?
        GROUP BY p.asset_id
        ORDER BY p.analyzed_at DESC
      `, [person_id]);
      setPhotos(photoRecords as any[]);
    } catch (error) {
      console.error("Failed to fetch photos for person:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Button title="Back" onPress={() => router.back()} />
      {person && <Text style={styles.headerTitle}>{person.name}'s Photos</Text>}
      <FlatList
        data={photos}
        keyExtractor={(item) => item.asset_id}
        numColumns={3}
        renderItem={({ item }) => (
          <View style={styles.imageContainer}>
            <Image source={{ uri: item.uri }} style={styles.image} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', padding: 20 },
  imageContainer: { flex: 1 / 3, aspectRatio: 1, margin: 1 },
  image: { flex: 1 },
});
