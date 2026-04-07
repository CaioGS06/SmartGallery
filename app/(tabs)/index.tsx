import { useRouter } from 'expo-router';
import { TFLiteImageRecognition } from 'react-native-fast-tflite';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import FaceDetection, { Face } from '@react-native-ml-kit/face-detection';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as SQLite from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const db = SQLite.openDatabaseSync('smartgallery.db');

const MONTHNAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function GalleryScreen() {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<MediaLibrary.Album | null>(null);

  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<MediaLibrary.Asset | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [isAnalyzed, setIsAnalyzed] = useState(false);

  // NEW: State for the batch scanner
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);

  // NEW: State for Selection Mode
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();
  const [tflite, setTflite] = useState<TFLiteImageRecognition | null>(null);

  useEffect(() => {
    async function loadModel() {
      try {
        const modelAsset = Asset.fromModule(require('../../assets/models/facenet.tflite'));
        await modelAsset.downloadAsync();
        const modelPath = `${FileSystem.documentDirectory}${modelAsset.name}`;
        await FileSystem.copyAsync({
          from: modelAsset.uri,
          to: modelPath,
        });
        const model = new TFLiteImageRecognition({
          model: modelPath,
        });
        setTflite(model);
        console.log("Model loaded successfully");
      } catch (err) {
        console.log("Failed to load model", err);
      }
    }
    loadModel();
  }, []);

  const { listData, yearsNavigation } = useMemo(() => {
    const items: any[] = [];
    const nav: any[] = [];
    let currentYear = -1;
    let currentMonth = -1;
    let currentDay = -1;

    let currentYearIndex = -1;
    let currentMonthIndex = -1;
    let currentDayIndex = -1;

    let currentRow: MediaLibrary.Asset[] = [];
    let currentOffset = 0;

    const pushRow = () => {
      if (currentRow.length > 0) {
        const rowHeight = screenWidth / 3;
        items.push({ type: 'photoRow', id: `row-${currentRow[0].id}`, assets: currentRow, length: rowHeight, offset: currentOffset });
        currentOffset += rowHeight;
        currentRow = [];
      }
    };

    // Sort assets by our normalized timestamp (descending: newest first)
    const sortedAssets = [...assets].sort((a, b) => {
      const timeA = (a.creationTime && a.creationTime > 100000000000) ? a.creationTime : a.modificationTime;
      const timeB = (b.creationTime && b.creationTime > 100000000000) ? b.creationTime : b.modificationTime;
      return timeB - timeA;
    });

    sortedAssets.forEach(asset => {
      // Some transferred photos on Android mistakenly report a creationTime of 0 (which results in Dec 31 1969 or Jan 1 1970).
      // If the time is suspiciously small (before ~1973), we fallback to modificationTime.
      const timestamp = (asset.creationTime && asset.creationTime > 100000000000)
        ? asset.creationTime
        : asset.modificationTime;

      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();

      if (year !== currentYear) {
        pushRow();
        currentYear = year;
        currentMonth = -1;
        currentDay = -1;

        const headerHeight = 60;
        items.push({ type: 'yearHeader', id: `year-${year}`, title: `${year}`, assetIds: [], length: headerHeight, offset: currentOffset });
        nav.push({ title: `${year}`, index: items.length - 1 });
        currentYearIndex = items.length - 1;
        currentOffset += headerHeight;
      }

      if (month !== currentMonth) {
        pushRow();
        currentMonth = month;
        currentDay = -1;

        const headerHeight = 50;
        items.push({ type: 'monthHeader', id: `month-${year}-${month}`, title: MONTHNAMES[month], assetIds: [], length: headerHeight, offset: currentOffset });
        currentMonthIndex = items.length - 1;
        currentOffset += headerHeight;
      }

      if (day !== currentDay) {
        pushRow();
        currentDay = day;

        const headerHeight = 50;
        const dateString = `${DAYNAMES[date.getDay()]}, ${MONTHNAMES[month]} ${day}`;
        items.push({ type: 'dayHeader', id: `day-${year}-${month}-${day}`, title: dateString, assetIds: [], length: headerHeight, offset: currentOffset });
        currentDayIndex = items.length - 1;
        currentOffset += headerHeight;
      }

      currentRow.push(asset);

      if (currentYearIndex !== -1) items[currentYearIndex].assetIds.push(asset.id);
      if (currentMonthIndex !== -1) items[currentMonthIndex].assetIds.push(asset.id);
      if (currentDayIndex !== -1) items[currentDayIndex].assetIds.push(asset.id);

      if (currentRow.length === 3) {
        pushRow();
      }
    });

    pushRow();
    return { listData: items, yearsNavigation: nav };
  }, [assets, screenWidth]);

  const initDatabase = () => {
    try {
      // Temporarily drop the table to clear out the bad EXIF data and update the schema
      // db.runSync(`DROP TABLE IF EXISTS photos;`);

      db.runSync(`
        CREATE TABLE IF NOT EXISTS photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_id TEXT UNIQUE,
          uri TEXT,
          face_count INTEGER,
          faces_data TEXT,
          image_width INTEGER,
          image_height INTEGER,
          analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.runSync(`
        CREATE TABLE IF NOT EXISTS people (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          cover_photo_uri TEXT
        );
      `);
      db.runSync(`
        CREATE TABLE IF NOT EXISTS faceprints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          person_id INTEGER,
          photo_asset_id TEXT,
          embedding TEXT,
          face_frame TEXT,
          FOREIGN KEY (person_id) REFERENCES people (id)
        );
      `);
      console.log("Database reset with image dimension columns.");
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
  const fetchPhotos = async (album: MediaLibrary.Album | null = null, loadMore = false) => {
    if (loadMore && !hasNextPage) return; // Stop if there are no more photos

    if (loadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const options: MediaLibrary.AssetsOptions = {
        first: 100000,
        mediaType: 'photo',
        sortBy: ['creationTime'],
      };

      if (album) options.album = album;
      if (loadMore && endCursor) options.after = endCursor; // Start from the last cursor

      const media = await MediaLibrary.getAssetsAsync(options);

      if (loadMore) {
        // Prevent duplicate assets when quickly scrolling
        setAssets(prev => {
          const map = new Map(prev.map(a => [a.id, a]));
          media.assets.forEach(a => map.set(a.id, a));
          return Array.from(map.values());
        });
      } else {
        setAssets(media.assets); // Replace list if it's a fresh load
      }

      setHasNextPage(media.hasNextPage);
      setEndCursor(media.endCursor);
    } catch (error) {
      console.error("Error loading photos:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
    setEndCursor(undefined);
    setHasNextPage(true);
    setSelectedIds(new Set()); // Clear selection
    setIsSelecting(false);
    fetchPhotos(album, false);
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleGroupSelection = (assetIds: string[]) => {
    setIsSelecting(true);
    const newSet = new Set(selectedIds);
    const allSelected = assetIds.every(id => newSet.has(id));

    if (allSelected) {
      assetIds.forEach(id => newSet.delete(id));
    } else {
      assetIds.forEach(id => newSet.add(id));
    }
    setSelectedIds(newSet);
  };

  const handleSelectImage = (imageAsset: MediaLibrary.Asset) => {
    if (isSelecting) {
      toggleSelection(imageAsset.id);
      return;
    }

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

  // NEW HELPER: Standardizes the image before AI processing
  const normalizePhoto = async (uri: string) => {
    // Resizing to 800px width forces the OS to bake in the EXIF rotation 
    // and makes the AI run lightning fast because the file is smaller.
    return await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { format: ImageManipulator.SaveFormat.JPEG }
    );
  };

const cosineSimilarity = (A: number[], B: number[]) => {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

  const analyzePhoto = async () => {
    if (!selectedImage || !tflite) return;

    if (selectedImage.width < 32 || selectedImage.height < 32) {
      console.warn("Image is too small to be analyzed by AI (minimum 32x32).");
      setIsAnalyzed(true);
      return;
    }

    setAnalyzing(true);

    const uniqueId = selectedImage.id;

    try {
      const normalizedImage = await normalizePhoto(selectedImage.uri);

      if (normalizedImage.width < 32 || normalizedImage.height < 32) {
        console.warn("Image is too small after normalization to be analyzed by AI.");
        setIsAnalyzed(true);
        setAnalyzing(false);
        return;
      }

      const detectedFaces = await FaceDetection.detect(normalizedImage.uri, {
        landmarkMode: 'none',
        contourMode: 'none',
        classificationMode: 'none',
      });

      setFaces(detectedFaces);
      const facesJson = JSON.stringify(detectedFaces);

      if (uniqueId) {
        db.runSync(
          `INSERT OR REPLACE INTO photos (asset_id, uri, face_count, faces_data, image_width, image_height) VALUES (?, ?, ?, ?, ?, ?);`,
          [uniqueId, selectedImage.uri, detectedFaces.length, facesJson, normalizedImage.width, normalizedImage.height]
        );

        for (const face of detectedFaces) {
          const croppedImage = await ImageManipulator.manipulateAsync(
            normalizedImage.uri,
            [{ crop: { originX: face.frame.left, originY: face.frame.top, width: face.frame.width, height: face.frame.height } }],
            { format: ImageManipulator.SaveFormat.JPEG }
          );

          const recognitions = await tflite.recognize({
            image: croppedImage.uri,
            inputShape: [1, 160, 160, 3],
          });

          if (recognitions && recognitions.length > 0) {
            const embedding = recognitions[0];
            const allFaceprints = await db.getAllAsync('SELECT * FROM faceprints');
            let matchedPersonId = null;

            for (const faceprint of allFaceprints) {
              const storedEmbedding = JSON.parse(faceprint.embedding);
              const similarity = cosineSimilarity(embedding, storedEmbedding);
              if (similarity > 0.8) {
                matchedPersonId = faceprint.person_id;
                break;
              }
            }

            db.runSync(
              'INSERT INTO faceprints (person_id, photo_asset_id, embedding, face_frame) VALUES (?, ?, ?, ?)',
              [matchedPersonId, uniqueId, JSON.stringify(embedding), JSON.stringify(face.frame)]
            );
          }
        }
      }
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setAnalyzing(false);
      setIsAnalyzed(true);
    }
  };

  const batchScanAlbum = async () => {
    if (!tflite) return;
    const assetsToScan = Array.from(selectedIds)
      .map(id => assets.find(a => a.id === id))
      .filter((a): a is MediaLibrary.Asset => a !== undefined);

    if (assetsToScan.length === 0) return;

    setIsBatchScanning(true);
    setScanTotal(assetsToScan.length);
    setScanProgress(0);

    let processedCount = 0;

    for (const asset of assetsToScan) {
      const uniqueId = asset.id;

      if (uniqueId) {
        try {
          if (asset.width < 32 || asset.height < 32) {
            console.log(`Skipping asset ${uniqueId} because it is too small (${asset.width}x${asset.height})`);
          } else {
            const existingRecord = db.getFirstSync('SELECT id FROM photos WHERE asset_id = ?', [uniqueId]);

            if (!existingRecord) {
              const normalizedImage = await normalizePhoto(asset.uri);

              if (normalizedImage.width >= 32 && normalizedImage.height >= 32) {
                const detectedFaces = await FaceDetection.detect(normalizedImage.uri, {
                  landmarkMode: 'none',
                  contourMode: 'none',
                  classificationMode: 'none',
                });

                const facesJson = JSON.stringify(detectedFaces);

                db.runSync(
                  `INSERT OR REPLACE INTO photos (asset_id, uri, face_count, faces_data, image_width, image_height) VALUES (?, ?, ?, ?, ?, ?);`,
                  [uniqueId, asset.uri, detectedFaces.length, facesJson, normalizedImage.width, normalizedImage.height]
                );

                for (const face of detectedFaces) {
                  const croppedImage = await ImageManipulator.manipulateAsync(
                    normalizedImage.uri,
                    [{ crop: { originX: face.frame.left, originY: face.frame.top, width: face.frame.width, height: face.frame.height } }],
                    { format: ImageManipulator.SaveFormat.JPEG }
                  );

                  const recognitions = await tflite.recognize({
                    image: croppedImage.uri,
                    inputShape: [1, 160, 160, 3],
                  });

                  if (recognitions && recognitions.length > 0) {
                    const embedding = recognitions[0];
                    const allFaceprints = await db.getAllAsync('SELECT * FROM faceprints');
                    let matchedPersonId = null;

                    for (const faceprint of allFaceprints) {
                      const storedEmbedding = JSON.parse(faceprint.embedding);
                      const similarity = cosineSimilarity(embedding, storedEmbedding);
                      if (similarity > 0.8) {
                        matchedPersonId = faceprint.person_id;
                        break;
                      }
                    }

                    db.runSync(
                      'INSERT INTO faceprints (person_id, photo_asset_id, embedding, face_frame) VALUES (?, ?, ?, ?)',
                      [matchedPersonId, uniqueId, JSON.stringify(embedding), JSON.stringify(face.frame)]
                    );
                  }
                }
              } else {
                console.log(`Skipping post-normalized asset ${uniqueId} for size threshold (${normalizedImage.width}x${normalizedImage.height})`);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to scan asset ${uniqueId}:`, error);
        }
      }

      processedCount++;
      setScanProgress(processedCount);
    }

    setIsBatchScanning(false);
    console.log("Batch scan complete!");
  };

  const renderImageWithBoxes = () => {
    if (!selectedImage) return null;
    const imgWidth = selectedImage.width || screenWidth;
    const imgHeight = selectedImage.height || screenWidth;

    // Reserve ~200px for modal controls so it doesn't overlap
    const maxAvailableHeight = screenHeight - 200;

    const scaleWidth = screenWidth / imgWidth;
    const scaleHeight = maxAvailableHeight / imgHeight;
    const finalScale = Math.min(scaleWidth, scaleHeight);

    const finalWidth = imgWidth * finalScale;
    const finalHeight = imgHeight * finalScale;

    return (
      <View style={{ width: finalWidth, height: finalHeight }}>
        <Image source={{ uri: selectedImage.uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        {faces.map((face, index) => (
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

        {/* NEW: The Batch Scan Button */}
        <View style={{ padding: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Button
              title={isSelecting ? "Cancel Select" : "Select"}
              onPress={() => {
                setIsSelecting(!isSelecting);
                if (isSelecting) setSelectedIds(new Set());
              }}
            />
            {isSelecting && (
              <Button
                title={selectedIds.size === assets.length ? "Deselect All" : "Select All"}
                onPress={() => {
                  if (selectedIds.size === assets.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(assets.map(a => a.id)));
                  }
                }}
              />
            )}
          </View>

          {isSelecting && (
            <Button
              key={isBatchScanning || selectedIds.size === 0 ? 'disabled' : 'active'}
              title={`Scan Selected (${selectedIds.size} photos)`}
              onPress={batchScanAlbum}
              disabled={isBatchScanning || selectedIds.size === 0}
            />
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <FlatList
            ref={flatListRef}
            data={listData}
            keyExtractor={(item) => item.id}
            getItemLayout={(data, index) => {
              if (!data || data.length === 0) return { length: 0, offset: 0, index };
              return { length: data[index].length, offset: data[index].offset, index };
            }}
            onEndReached={() => fetchPhotos(selectedAlbum, true)}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#0000ff" style={{ margin: 20 }} /> : null}
            renderItem={({ item }) => {
              if (item.type === 'yearHeader' || item.type === 'monthHeader' || item.type === 'dayHeader') {
                const isSelected = item.assetIds.every((id: string) => selectedIds.has(id)) && item.assetIds.length > 0;
                const hasSomeSelected = item.assetIds.some((id: string) => selectedIds.has(id));

                return (
                  <View style={[styles.headerRow, item.type === 'yearHeader' && styles.yearHeader, { height: item.length }]}>
                    <Text style={[styles.headerTitle, item.type === 'yearHeader' && styles.yearHeaderText, item.type === 'monthHeader' && styles.monthHeaderText]}>
                      {item.title}
                    </Text>

                    {(isSelecting || true) && (
                      <TouchableOpacity
                        style={styles.groupSelectButton}
                        onPress={() => toggleGroupSelection(item.assetIds)}
                      >
                        <View style={[styles.groupCheckmark, isSelected && styles.groupCheckmarkSelected, !isSelected && hasSomeSelected && styles.groupCheckmarkPartial]}>
                          {(isSelected || hasSomeSelected) && <Text style={styles.groupCheckmarkIcon}>{isSelected ? '✓' : '-'}</Text>}
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }

              if (item.type === 'photoRow') {
                return (
                  <View style={[styles.photoRow, { height: item.length }]}>
                    {item.assets.map((asset: MediaLibrary.Asset) => {
                      const isSelected = selectedIds.has(asset.id);
                      return (
                        <Pressable
                          key={asset.id}
                          style={[
                            styles.imageContainer,
                            isSelected && isSelecting ? styles.selectedImageContainer : null
                          ]}
                          onPress={() => handleSelectImage(asset)}
                          onLongPress={() => {
                            if (!isSelecting) {
                              setIsSelecting(true);
                              setSelectedIds(new Set([asset.id]));
                            }
                          }}
                        >
                          <Image source={{ uri: asset.uri }} style={[styles.image, isSelected && isSelecting ? styles.selectedImage : null]} />
                          {isSelecting && isSelected && (
                            <View style={styles.checkmarkContainer}>
                              <Text style={styles.checkmark}>✓</Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                    {item.assets.length === 1 && (
                      <>
                        <View style={{ flex: 1, margin: 1 }} />
                        <View style={{ flex: 1, margin: 1 }} />
                      </>
                    )}
                    {item.assets.length === 2 && (
                      <View style={{ flex: 1, margin: 1 }} />
                    )}
                  </View>
                );
              }
              return null;
            }}
          />
          {yearsNavigation.length > 1 && (
            <View style={styles.scrubberContainer}>
              {yearsNavigation.map((navItem) => (
                <TouchableOpacity
                  key={navItem.title}
                  onPress={() => flatListRef.current?.scrollToIndex({ index: navItem.index, animated: true })}
                  style={styles.scrubberItem}
                >
                  <Text style={styles.scrubberText}>{navItem.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
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

            {isAnalyzed && faces.length > 0 && (
              <Button title="Tag Faces" onPress={() => {
                setSelectedImage(null);
                router.push(`/tagfaces?asset_id=${selectedImage?.id}`);
              }} />
            )}

            <View style={{ height: 10 }} />
            <Button color="red" title="Close" onPress={() => setSelectedImage(null)} />
          </View>
        </SafeAreaView>
      </Modal>

      {/* NEW: Batch Scanning Progress Overlay */}
      {isBatchScanning && (
        <View style={styles.batchOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.batchText}>Scanning Photos...</Text>
          <Text style={styles.batchSubtext}>
            {scanProgress} of {scanTotal} completed
          </Text>
        </View>
      )}
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

  // Group Header Styles
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  yearHeader: {
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  yearHeaderText: {
    fontSize: 22,
    fontWeight: '800',
  },
  monthHeaderText: {
    fontSize: 18,
    fontWeight: '700',
  },
  groupSelectButton: {
    padding: 4,
  },
  groupCheckmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupCheckmarkSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  groupCheckmarkPartial: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
    opacity: 0.5,
  },
  groupCheckmarkIcon: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },

  photoRow: {
    flexDirection: 'row',
    width: '100%',
  },
  imageContainer: { flex: 1, aspectRatio: 1, margin: 1 },
  selectedImageContainer: {
    padding: 2,
    backgroundColor: '#007AFF',
  },
  image: { flex: 1 },
  selectedImage: {
    opacity: 0.8,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  checkmark: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  scrubberContainer: {
    position: 'absolute',
    right: 4,
    top: '15%',
    bottom: '15%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scrubberItem: {
    marginVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  scrubberText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  modalContainer: { flex: 1, backgroundColor: '#000' },
  imageWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalControls: { padding: 20, backgroundColor: '#111', paddingBottom: 40 },
  batchOverlay: {
    ...StyleSheet.absoluteFillObject, // Covers the whole screen
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999, // Ensures it sits on top of everything
  },
  batchText: { color: 'white', fontSize: 20, fontWeight: 'bold', marginTop: 20 },
  batchSubtext: { color: '#ccc', fontSize: 16, marginTop: 10 },
});
