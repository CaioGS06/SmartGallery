import FaceDetection, { Face } from '@react-native-ml-kit/face-detection';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GalleryScreen() {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(true);

  // We use "any" here because ImagePicker and MediaLibrary return slightly different objects,
  // but both will have a 'uri', 'width', and 'height'
  const [selectedImage, setSelectedImage] = useState<any>(null);

  const [faces, setFaces] = useState<Face[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const { width: screenWidth } = useWindowDimensions(); // Gets the exact width of your phone screen

  useEffect(() => {
    async function getPhotos() {
      if (permissionResponse?.status !== 'granted') {
        setLoading(false);
        return;
      }
      try {
        const media = await MediaLibrary.getAssetsAsync({
          first: 60,
          mediaType: 'photo',
          sortBy: ['creationTime'],
        });
        setAssets(media.assets);
      } catch (error) {
        console.error("Error loading photos:", error);
      } finally {
        setLoading(false);
      }
    }
    if (permissionResponse?.status === 'granted') getPhotos();
  }, [permissionResponse]);

  // NEW: Function to open the system picker for any folder
  const pickSystemImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
      setFaces([]); // Clear old faces
    }
  };

  const analyzePhoto = async () => {
    if (!selectedImage) return;
    setAnalyzing(true);

    try {
      const detectedFaces = await FaceDetection.detect(selectedImage.uri, {
        landmarkMode: 'none',
        contourMode: 'none',
        classificationMode: 'none',
      });
      setFaces(detectedFaces);
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  // Calculates the layout for the modal image to perfectly map the boxes
  const renderImageWithBoxes = () => {
    if (!selectedImage) return null;

    // 1. Calculate the aspect ratio so the image displays perfectly without cropping
    const imgWidth = selectedImage.width || screenWidth;
    const imgHeight = selectedImage.height || screenWidth;
    const aspectRatio = imgWidth / imgHeight;

    // 2. Calculate our scale factor
    const scale = screenWidth / imgWidth;

    return (
      <View style={{ width: screenWidth, height: screenWidth / aspectRatio }}>
        <Image
          source={{ uri: selectedImage.uri }}
          style={{ width: '100%', height: '100%' }}
        />

        {/* 3. Draw the boxes using the scale factor */}
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
    <View style={styles.container}>
      {/* NEW: Button to trigger the system picker */}
      <View style={styles.header}>
        <Button title="Browse All Folders" onPress={pickSystemImage} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <Pressable
              style={styles.imageContainer}
              onPress={() => {
                setSelectedImage(item);
                setFaces([]);
              }}
            >
              <Image source={{ uri: item.uri }} style={styles.image} />
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={selectedImage !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSelectedImage(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.imageWrapper}>
            {renderImageWithBoxes()}
          </View>

          <View style={styles.modalControls}>
            {analyzing ? (
              <ActivityIndicator size="large" color="ffffff" />
            ) : (
              <Button title="Analyze with AI" onPress={analyzePhoto} />
            )}

            {faces.length > 0 && (
              <Text style={{ color: 'white', marginTop: 10, textAlign: 'center' }}>
                Faces found: {faces.length}
              </Text>
            )}

            <View style={{ height: 10 }} />
            <Button
              title="Close"
              color="red"
              onPress={() => {
                setSelectedImage(null);
                setFaces([]);
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 15, paddingTop: 60, backgroundColor: '#f0f0f0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  text: { marginBottom: 16, fontSize: 16, textAlign: 'center' },
  imageContainer: { flex: 1 / 3, aspectRatio: 1, margin: 1 },
  image: { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: '#000' },
  imageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalControls: { padding: 20, backgroundColor: '#111', paddingBottom: 40 }
});
