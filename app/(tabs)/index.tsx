import FaceDetection, { Face } from '@react-native-ml-kit/face-detection';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const db = SQLite.openDatabaseSync('smartgallery.db');

export default function GalleryScreen() {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<MediaLibrary.Album | null>(null);

  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<MediaLibrary.Asset | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const { width: screenWidth } = useWindowDimensions();

  const initDatabase = () => {
    try {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_id TEXT UNIQUE, 
          uri TEXT,
          face_count INTEGER,
          faces_data TEXT, 
          analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (error) {
      console.error("Error initializing database:", error);
    }
  };

  // NEW: Fetch all albums on the device
  const fetchAlbums = async () => {
    try {
      const fetchedAlbums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });
      setAlbums(fetchedAlbums);
    } catch (error) {
      console.error("Error fetching albums:", error);
    }
  };

  // UPDATED: Now accepts an optional album to filter the photos
  const fetchPhotos = async (album: MediaLibrary.Album | null = null) => {
    setLoading(true);
    try {
      const options: MediaLibrary.AssetsOptions = {
        first: 60,
        mediaType: 'photo',
        sortBy: ['creationTime'],
      };

      if (album) {
        options.album = album;
      }

      const media = await MediaLibrary.getAssetsAsync(options);
      setAssets(media.assets);
    } catch (error) {
      console.error("Error loading photos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initDatabase();
    if (permissionResponse?.status === 'granted') {
      fetchAlbums();
      fetchPhotos(); // Initially load "All Photos"
    }
  }, [permissionResponse]);

  // NEW: Handle tapping an album
  const handleAlbumSelect = (album: MediaLibrary.Album | null) => {
    setSelectedAlbum(album);
    fetchPhotos(album);
  };

  const handleSelectImage = (imageAsset: MediaLibrary.Asset) => {
    setSelectedImage(imageAsset);
    setFaces([]);
    setIsAnalyzed(false);

    // We only rely on the permanent ID now
    const uniqueId = imageAsset.id;
    if (!uniqueId) return;

    try {
      const record: any = db.getFirstSync('SELECT faces_data FROM photos WHERE asset_id = ?', [uniqueId]);

      if (record) {
        setIsAnalyzed(true);
        if (record.faces_data) {
          setFaces(JSON.parse(record.faces_data));
        }
      }
    } catch (error) {
      console.error("Failed to check database:", error);
    }
  };

  const analyzePhoto = async () => {
    if (!selectedImage) return;
    setAnalyzing(true);

    const uniqueId = selectedImage.id;

    try {
      const detectedFaces = await FaceDetection.detect(selectedImage.uri, {
        landmarkMode: 'none',
        contourMode: 'none',
        classificationMode: 'none',
      });

      setFaces(detectedFaces);
      const facesJson = JSON.stringify(detectedFaces);

      if (uniqueId) {
        db.runSync(
          `INSERT OR REPLACE INTO photos (asset_id, uri, face_count, faces_data) VALUES (?, ?, ?, ?);`,
          [uniqueId, selectedImage.uri, detectedFaces.length, facesJson]
        );
        setIsAnalyzed(true);
      }
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const renderImageWithBoxes = () => {
    if (!selectedImage) return null;
    const imgWidth = selectedImage.width || screenWidth;
    const imgHeight = selectedImage.height || screenWidth;
    const aspectRatio = imgWidth / imgHeight;
    const scale = screenWidth / imgWidth;

    return (
      <View style={{ width: screenWidth, height: screenWidth / aspectRatio }}>
        <Image source={{ uri: selectedImage.uri }} style={{ width: '100%', height: '100%' }} />
        {faces.map((face, index) => (
          <View
            key={index}
            style={{
              position: 'absolute',
              borderWidth: 2,
              borderColor: 'red',
              left: face.frame.left * scale,
              top: face.frame.top * scale,
              width: face.frame.width * scale,
              height: face.frame.height * scale,
            }}
          />
        ))}
      </View>
    );
  };

  if (!permissionResponse || permissionResponse.status !== 'granted') {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>We need permission to access your gallery.</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* NEW: Horizontal Album Selector */}
      <View style={styles.albumSelectorContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumScroll}>
          <TouchableOpacity
            style={[styles.albumPill, selectedAlbum === null && styles.albumPillActive]}
            onPress={() => handleAlbumSelect(null)}
          >
            <Text style={[styles.albumText, selectedAlbum === null && styles.albumTextActive]}>
              All Photos
            </Text>
          </TouchableOpacity>

          {albums.map((album) => (
            <TouchableOpacity
              key={album.id}
              style={[styles.albumPill, selectedAlbum?.id === album.id && styles.albumPillActive]}
              onPress={() => handleAlbumSelect(album)}
            >
              <Text style={[styles.albumText, selectedAlbum?.id === album.id && styles.albumTextActive]}>
                {album.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <Pressable style={styles.imageContainer} onPress={() => handleSelectImage(item)}>
              <Image source={{ uri: item.uri }} style={styles.image} />
            </Pressable>
          )}
        />
      )}

      <Modal visible={selectedImage !== null} animationType="slide" onRequestClose={() => setSelectedImage(null)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.imageWrapper}>
            {renderImageWithBoxes()}
          </View>

          <View style={styles.modalControls}>
            {analyzing ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : (
              <Button title="Analyze with AI" onPress={analyzePhoto} />
            )}

            {isAnalyzed && (
              <Text style={{ color: 'white', marginTop: 15, textAlign: 'center', fontSize: 16, fontWeight: 'bold' }}>
                {faces.length > 0 ? `Faces found: ${faces.length}` : 'No faces found'}
              </Text>
            )}

            <View style={{ height: 10 }} />
            <Button color="red" title="Close" onPress={() => setSelectedImage(null)} />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  text: { marginBottom: 16, fontSize: 16, textAlign: 'center' },

  // New Styles for the Album List
  albumSelectorContainer: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  albumScroll: {
    paddingHorizontal: 10,
  },
  albumPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    marginRight: 10,
  },
  albumPillActive: {
    backgroundColor: '#007AFF',
  },
  albumText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  albumTextActive: {
    color: '#fff',
  },

  imageContainer: { flex: 1 / 3, aspectRatio: 1, margin: 1 },
  image: { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: '#000' },
  imageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalControls: { padding: 20, backgroundColor: '#111', paddingBottom: 40 }
});
