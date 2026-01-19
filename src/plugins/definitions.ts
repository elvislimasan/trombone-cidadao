export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  size: number;
  bitrate?: number;
  codec?: string;
}

export interface ImageMetadata {
  width: number;
  height: number;
  size: number;
}

export interface VideoCompressOptions {
  quality: 'low' | 'medium' | 'high';
  maxWidth?: number;
  maxHeight?: number;
  maxFileSize?: number;
}

export interface VideoCompressResult {
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export interface VideoCompressProgress {
  frame: number;
  totalFrames: number;
  progress: number; 
}

export interface VideoProcessorPlugin {
  capturePhoto(options?: { lowQuality?: boolean; maxWidth?: number; maxHeight?: number; maxSizeMB?: number; quality?: 'low' | 'medium' | 'high' }): Promise<{ filePath: string }>;
  getImageMetadata(options: { filePath: string }): Promise<ImageMetadata>;
  getVideoMetadata(options: { filePath: string }): Promise<VideoMetadata>;
  getVideoThumbnail(options: { filePath: string; atMs?: number; maxWidth?: number; maxHeight?: number }): Promise<{ imagePath: string }>;
  generateImageThumbnail(options: { filePath: string; maxWidth?: number; maxHeight?: number; quality?: number }): Promise<{ thumbnailPath: string }>;
  compressVideo(options: { filePath: string } & VideoCompressOptions): Promise<VideoCompressResult>;
  compressImage(options: { filePath: string; maxWidth?: number; maxHeight?: number; maxSizeMB?: number; quality?: 'low' | 'medium' | 'high'; format?: 'webp' | 'jpeg' | 'png' }): Promise<{ outputPath: string; originalSize: number; compressedSize: number; compressionRatio: number }>;
  uploadVideoInBackground(options: { filePath: string; uploadUrl: string; headers: Record<string, string> }): Promise<{ uploadId: string }>;
  getUploadProgress(uploadId: string): Promise<{ progress: number; status: string }>;
  cancelUpload(uploadId: string): Promise<void>;
  captureVideo(options?: { maxDurationSec?: number; lowQuality?: boolean }): Promise<{ filePath: string }>;
}
