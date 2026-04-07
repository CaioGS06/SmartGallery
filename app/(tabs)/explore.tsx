import { useFocusEffect } from 'expo-router';
import * as SQLite from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Button, FlatList, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const db = SQLite.openDatabaseSync('smartgallery.db');

export default function ExploreScreen() {
  const [analyzedPhotos, setAnalyzedPhotos] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [faces, setFaces] = useState<any[]>([]);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  useFocusEffect(
    useCallback(() => {
      fetchFaces();
    }, [])
  );

  const fetchFaces = async () => {
    try {
      const records = await db.getAllAsync('SELECT * FROM photos WHERE face_count > 0 ORDER BY analyzed_at DESC');
      setAnalyzedPhotos(records as any[]);
    } catch (error) {
      console.error("Failed to fetch from DB:", error);
    }
  };

  const handleSelectImage = (item: any) => {
    setSelectedImage(item);

    if (item.faces_data) {
      setFaces(JSON.parse(item.faces_data));
    } else {
      setFaces([]);
    }
  };

  const renderImageWithBoxes = () => {
    if (!selectedImage || !selectedImage.image_width) return null;

    // Read the exact dimensions we saved in SQLite during the scan
    const imgWidth = selectedImage.image_width || screenWidth;
    const imgHeight = selectedImage.image_height || screenWidth;

    const maxAvailableHeight = screenHeight - 200;

    const scaleWidth = screenWidth / imgWidth;
    const scaleHeight = maxAvailableHeight / imgHeight;
    const finalScale = Math.min(scaleWidth, scaleHeight);

    const finalWidth = imgWidth * finalScale;
    const finalHeight = imgHeight * finalScale;

    return (
      <View style={{ width: finalWidth, height: finalHeight }}>
        <Image source={{ uri: selectedImage.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        {faces.map((face: any, index: number) => (
          <View
            key={index}
            style={{
              position: 'absolute',
              borderWidth: 2,
              borderColor: 'red',
              left: face.frame.left * finalScale,
              top: face.frame.top * finalScale,
              width: face.frame.width * finalScale,
              height: face.frame.height * finalScale,
            }}
          />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Faces Album</Text>
        <Text style={styles.headerSubtitle}>
          {analyzedPhotos.length} {analyzedPhotos.length === 1 ? 'photo' : 'photos'} found
        </Text>
      </View>

      {analyzedPhotos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No faces found yet!</Text>
        </View>
      ) : (
        <FlatList
          data={analyzedPhotos}
          keyExtractor={(item) => item.asset_id}
          numColumns={3}
          renderItem={({ item }) => (
            <Pressable style={styles.imageContainer} onPress={() => handleSelectImage(item)}>
              <Image source={{ uri: item.uri }} style={styles.image} />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.face_count}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* The Detail Modal */}
      <Modal visible={selectedImage !== null} animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.imageWrapper}>
            {renderImageWithBoxes()}
          </View>
          <View style={styles.modalControls}>
            <Text style={{ color: 'white', marginBottom: 15, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>
              Stored Data: {faces.length} {faces.length === 1 ? 'Face' : 'Faces'}
            </Text>
            <Button color="red" title="Close" onPress={() => setSelectedImage(null)} />
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, backgroundColor: '#f0f0f0', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  imageContainer: { flex: 1 / 3, aspectRatio: 1, margin: 1, position: 'relative' },
  image: { flex: 1 },
  badge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  modalContainer: { flex: 1, backgroundColor: '#000' },
  imageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalControls: { padding: 20, backgroundColor: '#111', paddingBottom: 40 }
});